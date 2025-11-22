// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title OmnibusVault
 * @notice Omnibus vault for TEE-facilitator scheme (x402-tee-facilitator)
 * 
 * Buyers deposit USDC into the vault. The TEE facilitator maintains
 * private off-chain accounting and settles to sellers via withdrawToSeller().
 * 
 * Privacy: On-chain observers see deposits and seller withdrawals but
 * cannot link specific buyers to specific sellers (linkage private in TEE).
 */
contract OmnibusVault {
    using SafeERC20 for IERC20;

    /// @notice The ERC-20 token (USDC) held in the vault
    IERC20 public immutable token;

    /// @notice The TEE facilitator address (only address allowed to withdraw)
    address public immutable facilitator;

    /// @notice Owner address (for seller allowlist management)
    address public owner;

    /// @notice Allowlist of approved sellers
    mapping(address => bool) public allowedSellers;

    /// @notice Total deposits made by each buyer (for transparency)
    mapping(address => uint256) public totalDeposited;

    /// @notice Total withdrawn to each seller (for transparency)
    mapping(address => uint256) public totalWithdrawn;

    /// @notice Event emitted when a buyer deposits funds
    event Deposited(address indexed buyer, uint256 amount, uint256 totalDeposited);

    /// @notice Event emitted when facilitator withdraws to seller
    event Withdrawn(address indexed seller, uint256 amount, bytes32 indexed intentHash);

    /// @notice Event emitted when seller authorization changes
    event SellerAuthorized(address indexed seller, bool status);

    /// @notice Emitted when ledger hash is published (for auditability)
    event LedgerHashPublished(bytes32 indexed ledgerHash, uint256 timestamp);

    /**
     * @notice Contract constructor
     * @param _token The ERC-20 token address (USDC)
     * @param _facilitator The TEE facilitator address
     */
    constructor(address _token, address _facilitator) {
        require(_token != address(0), "Invalid token");
        require(_facilitator != address(0), "Invalid facilitator");
        
        token = IERC20(_token);
        facilitator = _facilitator;
        owner = msg.sender;
    }

    /**
     * @notice Deposit USDC into the vault
     * @param amount Amount of USDC to deposit (6 decimals)
     * 
     * Buyer calls this directly. TEE facilitator tracks balance off-chain.
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Zero deposit");

        // Transfer USDC from buyer
        token.safeTransferFrom(msg.sender, address(this), amount);

        // Track total deposits (transparency)
        totalDeposited[msg.sender] += amount;

        emit Deposited(msg.sender, amount, totalDeposited[msg.sender]);
    }

    /**
     * @notice Withdraw USDC to seller (only callable by facilitator)
     * @param seller Seller address to receive payment
     * @param amount Amount to transfer
     * @param intentHash Hash of payment intent (for tracking)
     * 
     * TEE facilitator calls this after verifying buyer balance off-chain.
     */
    function withdrawToSeller(
        address seller,
        uint256 amount,
        bytes32 intentHash
    ) external {
        require(msg.sender == facilitator, "Only facilitator");
        require(allowedSellers[seller], "Seller not authorized");
        require(amount > 0, "Zero amount");

        // Transfer to seller
        token.safeTransfer(seller, amount);

        // Track total withdrawals (transparency)
        totalWithdrawn[seller] += amount;

        emit Withdrawn(seller, amount, intentHash);
    }

    /**
     * @notice Authorize or deauthorize a seller
     * @param seller Seller address
     * @param status True to authorize, false to deauthorize
     */
    function authorizeSeller(address seller, bool status) external {
        require(msg.sender == owner, "Only owner");
        allowedSellers[seller] = status;
        emit SellerAuthorized(seller, status);
    }

    /**
     * @notice Publish ledger hash for auditability
     * @param ledgerHash Hash of off-chain ledger state
     * 
     * TEE facilitator can call this periodically to prove ledger integrity.
     */
    function publishLedgerHash(bytes32 ledgerHash) external {
        require(msg.sender == facilitator, "Only facilitator");
        emit LedgerHashPublished(ledgerHash, block.timestamp);
    }

    /**
     * @notice Get vault balance
     * @return Current USDC balance in vault
     */
    function getBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    /**
     * @notice Get contract name for EIP-712 domain
     */
    function name() external pure returns (string memory) {
        return "x402-tee-facilitator";
    }

    /**
     * @notice Get contract version for EIP-712 domain
     */
    function version() external pure returns (string memory) {
        return "1";
    }
}

