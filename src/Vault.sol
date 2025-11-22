// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Vault
 * @notice Pool-based vault for escrow-deferred x402 payments
 * 
 * Buyers deposit USDC into the vault, and sellers receive payments
 * via batched withdrawals based on signed payment intents.
 */
contract Vault {
    using SafeERC20 for IERC20;

    /// @notice The ERC-20 token (USDC) held in the vault
    IERC20 public immutable token;

    /// @notice Per-buyer deposit balances
    mapping(address => uint256) public deposits;

    /// @notice Track used nonces per buyer to prevent replay attacks
    mapping(address => mapping(bytes32 => bool)) public usedNonces;

    /// @notice Counter for batch transaction IDs
    uint256 private batchIdCounter;

    /// @notice EIP-712 domain separator
    bytes32 public immutable DOMAIN_SEPARATOR;

    /// @notice EIP-712 typehash for PaymentIntent
    bytes32 public constant PAYMENT_INTENT_TYPEHASH =
        keccak256(
            "PaymentIntent(address buyer,address seller,uint256 amount,address token,bytes32 nonce,uint256 expiry,string resource,uint256 chainId)"
        );

    /// @notice Event emitted when a buyer deposits funds
    event Deposited(address indexed buyer, uint256 amount, uint256 newBalance);

    /// @notice Event emitted when an intent is settled
    event IntentSettled(
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        bytes32 nonce,
        string resource,
        uint256 indexed batchId
    );

    /// @notice Event emitted when a batch withdrawal completes
    event BatchWithdrawn(uint256 indexed batchId, uint256 totalAmount, uint256 intentCount);

    /**
     * @notice Constructor
     * @param _token Address of the ERC-20 token (USDC)
     */
    constructor(address _token) {
        token = IERC20(_token);
        
        // EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("x402-Vault"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Deposit tokens into the vault
     * @param amount Amount of tokens to deposit (must be approved first)
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Vault: amount must be greater than 0");
        
        token.safeTransferFrom(msg.sender, address(this), amount);
        deposits[msg.sender] += amount;
        
        emit Deposited(msg.sender, amount, deposits[msg.sender]);
    }

    /**
     * @notice PaymentIntent struct matching off-chain structure
     */
    struct PaymentIntent {
        address buyer;
        address seller;
        uint256 amount;
        address token;
        bytes32 nonce;
        uint256 expiry;
        string resource;
        uint256 chainId;
    }

    /**
     * @notice Batch withdraw funds to sellers based on signed payment intents
     * @param intents Array of payment intents
     * @param signatures Array of EIP-712 signatures (one per intent)
     */
    function batchWithdraw(
        PaymentIntent[] calldata intents,
        bytes[] calldata signatures
    ) external {
        require(intents.length > 0, "Vault: empty batch");
        require(intents.length == signatures.length, "Vault: intent/signature mismatch");

        uint256 batchId = ++batchIdCounter;
        uint256 totalAmount = 0;

        // First pass: Validate signatures and mark nonces
        for (uint256 i = 0; i < intents.length; i++) {
            PaymentIntent calldata intent = intents[i];
            bytes calldata signature = signatures[i];

            // Validate intent
            require(intent.token == address(token), "Vault: wrong token");
            require(intent.chainId == block.chainid, "Vault: wrong chain");
            require(block.timestamp <= intent.expiry, "Vault: intent expired");
            require(!usedNonces[intent.buyer][intent.nonce], "Vault: nonce already used");

            // Verify EIP-712 signature
            bytes32 intentHash = keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(
                        abi.encode(
                            PAYMENT_INTENT_TYPEHASH,
                            intent.buyer,
                            intent.seller,
                            intent.amount,
                            intent.token,
                            intent.nonce,
                            intent.expiry,
                            keccak256(bytes(intent.resource)),
                            intent.chainId
                        )
                    )
                )
            );

            address signer = _recoverSigner(intentHash, signature);
            require(signer == intent.buyer, "Vault: invalid signature");

            // Mark nonce as used (prevents replay)
            usedNonces[intent.buyer][intent.nonce] = true;

            totalAmount += intent.amount;

            emit IntentSettled(
                intent.buyer,
                intent.seller,
                intent.amount,
                intent.nonce,
                intent.resource,
                batchId
            );
        }

        // Second pass: Check solvency and decrease deposits (once per buyer)
        for (uint256 i = 0; i < intents.length; i++) {
            address buyer = intents[i].buyer;
            
            // Only process each buyer once
            if (_isFirstOccurrence(intents, buyer, i)) {
                uint256 buyerTotal = _calculateBuyerTotal(intents, buyer);
                require(
                    deposits[buyer] >= buyerTotal,
                    "Vault: insufficient deposit"
                );
                deposits[buyer] -= buyerTotal;
            }
        }

        // Third pass: Transfer to sellers
        for (uint256 i = 0; i < intents.length; i++) {
            token.safeTransfer(intents[i].seller, intents[i].amount);
        }

        emit BatchWithdrawn(batchId, totalAmount, intents.length);
    }

    /**
     * @notice Calculate total amount for a specific buyer in the batch
     */
    function _calculateBuyerTotal(
        PaymentIntent[] calldata intents,
        address buyer
    ) private pure returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < intents.length; i++) {
            if (intents[i].buyer == buyer) {
                total += intents[i].amount;
            }
        }
        return total;
    }

    /**
     * @notice Check if this is the first occurrence of a buyer in the intents array
     */
    function _isFirstOccurrence(
        PaymentIntent[] calldata intents,
        address buyer,
        uint256 index
    ) private pure returns (bool) {
        for (uint256 i = 0; i < index; i++) {
            if (intents[i].buyer == buyer) {
                return false;
            }
        }
        return true;
    }

    /**
     * @notice Recover signer from EIP-712 signature
     */
    function _recoverSigner(
        bytes32 hash,
        bytes calldata signature
    ) private pure returns (address) {
        require(signature.length == 65, "Vault: invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        // Handle EIP-155 recovery
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "Vault: invalid signature v");

        return ecrecover(hash, v, r, s);
    }
}

