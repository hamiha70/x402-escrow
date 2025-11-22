// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Vault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * Mock USDC for testing
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1000000 * 10**6); // 1M USDC
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title VaultTest
 * @notice Comprehensive tests for Vault contract
 * 
 * Test Coverage:
 * - Deployment and initialization
 * - Deposit functionality
 * - EIP-712 signature generation and verification
 * - Batch withdrawal with single/multiple intents
 * - Batch withdrawal with multiple buyers
 * - Solvency checks
 * - Replay attack prevention
 * - Edge cases (expired intents, wrong chain, wrong token)
 */
contract VaultTest is Test {
    Vault public vault;
    MockUSDC public usdc;

    address public facilitator = address(0x1);
    address public buyer1 = address(0x2);
    address public buyer2 = address(0x3);
    address public seller1 = address(0x4);
    address public seller2 = address(0x5);

    uint256 public buyer1PrivateKey = 0xB1;
    uint256 public buyer2PrivateKey = 0xB2;

    bytes32 public constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(address buyer,address seller,uint256 amount,address token,bytes32 nonce,uint256 expiry,string resource,uint256 chainId)"
    );

    // Events (matching Vault contract)
    event Deposited(address indexed buyer, uint256 amount, uint256 newBalance);
    event IntentSettled(address indexed buyer, address indexed seller, uint256 amount, bytes32 nonce, string resource, uint256 indexed batchId);
    event BatchWithdrawn(uint256 indexed batchId, uint256 totalAmount, uint256 intentCount);

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockUSDC();

        // Deploy Vault
        vault = new Vault(address(usdc));

        // Setup buyers with actual keypairs for signing
        buyer1 = vm.addr(buyer1PrivateKey);
        buyer2 = vm.addr(buyer2PrivateKey);

        // Fund buyers with USDC
        usdc.mint(buyer1, 1000 * 10**6); // 1000 USDC
        usdc.mint(buyer2, 1000 * 10**6); // 1000 USDC
    }

    /// @dev Test vault deployment and initialization
    function test_Deployment() public {
        assertEq(address(vault.token()), address(usdc));
        assertTrue(vault.DOMAIN_SEPARATOR() != bytes32(0));
    }

    /// @dev Test deposit functionality
    function test_Deposit() public {
        uint256 amount = 100 * 10**6; // 100 USDC

        vm.startPrank(buyer1);
        usdc.approve(address(vault), amount);
        
        vm.expectEmit(true, false, false, true);
        emit Deposited(buyer1, amount, amount);
        
        vault.deposit(amount);
        vm.stopPrank();

        assertEq(vault.deposits(buyer1), amount);
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    /// @dev Test deposit reverts with zero amount
    function test_Deposit_RevertsZeroAmount() public {
        vm.startPrank(buyer1);
        vm.expectRevert("Vault: amount must be greater than 0");
        vault.deposit(0);
        vm.stopPrank();
    }

    /// @dev Test single intent batch withdrawal
    function test_BatchWithdraw_SingleIntent() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create payment intent
        uint256 paymentAmount = 10 * 10**6; // 0.01 USDC (matching TypeScript tests)
        bytes32 nonce = keccak256("test-nonce-1");
        uint256 expiry = block.timestamp + 300;
        string memory resource = "/api/content/premium";

        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: paymentAmount,
            token: address(usdc),
            nonce: nonce,
            expiry: expiry,
            resource: resource,
            chainId: block.chainid
        });

        // Sign intent
        bytes memory signature = _signPaymentIntent(intent, buyer1PrivateKey);

        // Prepare batch
        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        // Execute batch withdrawal
        uint256 sellerBalanceBefore = usdc.balanceOf(seller1);
        uint256 buyerDepositBefore = vault.deposits(buyer1);

        vm.prank(facilitator);
        vault.batchWithdraw(intents, signatures);

        // Verify balances
        assertEq(usdc.balanceOf(seller1), sellerBalanceBefore + paymentAmount);
        assertEq(vault.deposits(buyer1), buyerDepositBefore - paymentAmount);
        assertTrue(vault.usedNonces(buyer1, nonce));
    }

    /// @dev Test batch withdrawal with multiple intents from same buyer
    function test_BatchWithdraw_MultipleSameBuyer() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create two payment intents
        uint256 payment1 = 10 * 10**6;
        uint256 payment2 = 20 * 10**6;

        Vault.PaymentIntent memory intent1 = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: payment1,
            token: address(usdc),
            nonce: keccak256("nonce-1"),
            expiry: block.timestamp + 300,
            resource: "/api/content/1",
            chainId: block.chainid
        });

        Vault.PaymentIntent memory intent2 = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller2,
            amount: payment2,
            token: address(usdc),
            nonce: keccak256("nonce-2"),
            expiry: block.timestamp + 300,
            resource: "/api/content/2",
            chainId: block.chainid
        });

        // Sign intents
        bytes memory sig1 = _signPaymentIntent(intent1, buyer1PrivateKey);
        bytes memory sig2 = _signPaymentIntent(intent2, buyer1PrivateKey);

        // Prepare batch
        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](2);
        intents[0] = intent1;
        intents[1] = intent2;
        bytes[] memory signatures = new bytes[](2);
        signatures[0] = sig1;
        signatures[1] = sig2;

        // Execute batch withdrawal
        uint256 buyerDepositBefore = vault.deposits(buyer1);

        vm.prank(facilitator);
        vault.batchWithdraw(intents, signatures);

        // Verify balances
        assertEq(usdc.balanceOf(seller1), payment1);
        assertEq(usdc.balanceOf(seller2), payment2);
        assertEq(vault.deposits(buyer1), buyerDepositBefore - (payment1 + payment2));
    }

    /// @dev Test batch withdrawal with multiple buyers
    function test_BatchWithdraw_MultipleBuyers() public {
        // Setup: Both buyers deposit
        uint256 deposit1 = 100 * 10**6;
        uint256 deposit2 = 200 * 10**6;

        vm.startPrank(buyer1);
        usdc.approve(address(vault), deposit1);
        vault.deposit(deposit1);
        vm.stopPrank();

        vm.startPrank(buyer2);
        usdc.approve(address(vault), deposit2);
        vault.deposit(deposit2);
        vm.stopPrank();

        // Create payment intents from both buyers
        uint256 payment1 = 10 * 10**6;
        uint256 payment2 = 20 * 10**6;

        Vault.PaymentIntent memory intent1 = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: payment1,
            token: address(usdc),
            nonce: keccak256("buyer1-nonce"),
            expiry: block.timestamp + 300,
            resource: "/api/content/1",
            chainId: block.chainid
        });

        Vault.PaymentIntent memory intent2 = Vault.PaymentIntent({
            buyer: buyer2,
            seller: seller2,
            amount: payment2,
            token: address(usdc),
            nonce: keccak256("buyer2-nonce"),
            expiry: block.timestamp + 300,
            resource: "/api/content/2",
            chainId: block.chainid
        });

        // Sign with respective private keys
        bytes memory sig1 = _signPaymentIntent(intent1, buyer1PrivateKey);
        bytes memory sig2 = _signPaymentIntent(intent2, buyer2PrivateKey);

        // Prepare batch
        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](2);
        intents[0] = intent1;
        intents[1] = intent2;
        bytes[] memory signatures = new bytes[](2);
        signatures[0] = sig1;
        signatures[1] = sig2;

        // Execute batch withdrawal
        vm.prank(facilitator);
        vault.batchWithdraw(intents, signatures);

        // Verify balances
        assertEq(usdc.balanceOf(seller1), payment1);
        assertEq(usdc.balanceOf(seller2), payment2);
        assertEq(vault.deposits(buyer1), deposit1 - payment1);
        assertEq(vault.deposits(buyer2), deposit2 - payment2);
    }

    /// @dev Test insufficient deposit reverts
    function test_BatchWithdraw_RevertsInsufficientDeposit() public {
        // Setup: Buyer deposits small amount
        uint256 depositAmount = 5 * 10**6; // Only 5 USDC
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Try to withdraw more than deposited
        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: 10 * 10**6, // 10 USDC (more than deposited)
            token: address(usdc),
            nonce: keccak256("nonce"),
            expiry: block.timestamp + 300,
            resource: "/api/content",
            chainId: block.chainid
        });

        bytes memory signature = _signPaymentIntent(intent, buyer1PrivateKey);

        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        vm.prank(facilitator);
        vm.expectRevert("Vault: insufficient deposit");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test replay attack prevention
    function test_BatchWithdraw_RevertsReplayAttack() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create intent
        bytes32 nonce = keccak256("replay-nonce");
        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: 10 * 10**6,
            token: address(usdc),
            nonce: nonce,
            expiry: block.timestamp + 300,
            resource: "/api/content",
            chainId: block.chainid
        });

        bytes memory signature = _signPaymentIntent(intent, buyer1PrivateKey);

        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        // First withdrawal succeeds
        vm.prank(facilitator);
        vault.batchWithdraw(intents, signatures);

        // Second withdrawal with same nonce fails
        vm.prank(facilitator);
        vm.expectRevert("Vault: nonce already used");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test expired intent reverts
    function test_BatchWithdraw_RevertsExpiredIntent() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create intent with past expiry
        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: 10 * 10**6,
            token: address(usdc),
            nonce: keccak256("expired-nonce"),
            expiry: block.timestamp - 1, // Already expired
            resource: "/api/content",
            chainId: block.chainid
        });

        bytes memory signature = _signPaymentIntent(intent, buyer1PrivateKey);

        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        vm.prank(facilitator);
        vm.expectRevert("Vault: intent expired");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test wrong token address reverts
    function test_BatchWithdraw_RevertsWrongToken() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create intent with wrong token address
        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: 10 * 10**6,
            token: address(0xdead), // Wrong token
            nonce: keccak256("nonce"),
            expiry: block.timestamp + 300,
            resource: "/api/content",
            chainId: block.chainid
        });

        bytes memory signature = _signPaymentIntent(intent, buyer1PrivateKey);

        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        vm.prank(facilitator);
        vm.expectRevert("Vault: wrong token");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test wrong chain ID reverts
    function test_BatchWithdraw_RevertsWrongChain() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create intent with wrong chain ID
        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: 10 * 10**6,
            token: address(usdc),
            nonce: keccak256("nonce"),
            expiry: block.timestamp + 300,
            resource: "/api/content",
            chainId: 99999 // Wrong chain
        });

        bytes memory signature = _signPaymentIntent(intent, buyer1PrivateKey);

        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        vm.prank(facilitator);
        vm.expectRevert("Vault: wrong chain");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test invalid signature reverts
    function test_BatchWithdraw_RevertsInvalidSignature() public {
        // Setup: Buyer deposits
        uint256 depositAmount = 100 * 10**6;
        vm.startPrank(buyer1);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount);
        vm.stopPrank();

        // Create intent
        Vault.PaymentIntent memory intent = Vault.PaymentIntent({
            buyer: buyer1,
            seller: seller1,
            amount: 10 * 10**6,
            token: address(usdc),
            nonce: keccak256("nonce"),
            expiry: block.timestamp + 300,
            resource: "/api/content",
            chainId: block.chainid
        });

        // Sign with WRONG private key
        bytes memory signature = _signPaymentIntent(intent, buyer2PrivateKey);

        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](1);
        intents[0] = intent;
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = signature;

        vm.prank(facilitator);
        vm.expectRevert("Vault: invalid signature");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test empty batch reverts
    function test_BatchWithdraw_RevertsEmptyBatch() public {
        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](0);
        bytes[] memory signatures = new bytes[](0);

        vm.prank(facilitator);
        vm.expectRevert("Vault: empty batch");
        vault.batchWithdraw(intents, signatures);
    }

    /// @dev Test mismatched intent/signature arrays reverts
    function test_BatchWithdraw_RevertsMismatchedArrays() public {
        Vault.PaymentIntent[] memory intents = new Vault.PaymentIntent[](2);
        bytes[] memory signatures = new bytes[](1); // Mismatched length

        vm.prank(facilitator);
        vm.expectRevert("Vault: intent/signature mismatch");
        vault.batchWithdraw(intents, signatures);
    }

    // ============ Helper Functions ============

    /**
     * @dev Sign a PaymentIntent using EIP-712
     */
    function _signPaymentIntent(
        Vault.PaymentIntent memory intent,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
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
        );

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                vault.DOMAIN_SEPARATOR(),
                structHash
            )
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}

