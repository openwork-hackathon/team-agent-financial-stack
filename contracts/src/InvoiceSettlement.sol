// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title InvoiceSettlement
 * @notice On-chain invoicing and settlement for agent-to-agent transactions
 * @dev Implements ERC-8004-style invoice lifecycle with escrow
 * 
 * Features:
 * - Draft → Sent → Paid lifecycle
 * - Escrow-based settlement
 * - Dispute resolution
 * - Revenue sharing (95% worker, 5% validator)
 * - Partial payments support
 */
contract InvoiceSettlement is Ownable, ReentrancyGuard, Pausable {
    
    // ============ STATE VARIABLES ============
    
    /// @notice $OPENWORK token
    IERC20 public immutable openworkToken;
    
    /// @notice Platform fee (5% = 500 basis points)
    uint256 public constant PLATFORM_FEE_BPS = 500;
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    /// @notice Invoice states
    enum InvoiceState {
        DRAFT,      // Created but not sent
        SENT,       // Sent to recipient
        ESCROWED,   // Funds locked in escrow
        PAID,       // Completed and settled
        DISPUTED,   // Under dispute
        CANCELLED   // Cancelled by issuer
    }
    
    /// @notice Invoice data
    struct Invoice {
        uint256 id;
        address issuer;         // Agent creating invoice
        address recipient;      // Agent paying invoice
        uint256 amount;         // Total amount due
        uint256 paidAmount;     // Amount paid so far
        InvoiceState state;
        uint256 createdAt;
        uint256 dueDate;        // Optional deadline
        string description;     // Work description
        bool partialPayment;    // Allow partial payments
    }
    
    /// @notice Dispute data
    struct Dispute {
        uint256 invoiceId;
        address initiator;
        string reason;
        uint256 createdAt;
        address[] validators;   // Addresses that can resolve
        uint256 validatorApprovals;
        bool resolved;
    }
    
    // ============ STORAGE ============
    
    /// @notice Invoice ID counter
    uint256 public invoiceIdCounter;
    
    /// @notice invoiceId => Invoice
    mapping(uint256 => Invoice) public invoices;
    
    /// @notice agent => invoiceId[] (issued)
    mapping(address => uint256[]) public issuedInvoices;
    
    /// @notice agent => invoiceId[] (received)
    mapping(address => uint256[]) public receivedInvoices;
    
    /// @notice invoiceId => Dispute
    mapping(uint256 => Dispute) public disputes;
    
    /// @notice Escrow balance: invoiceId => amount
    mapping(uint256 => uint256) public escrowBalances;
    
    /// @notice Collected platform fees
    uint256 public collectedFees;
    
    // ============ EVENTS ============
    
    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed issuer,
        address indexed recipient,
        uint256 amount
    );
    
    event InvoiceSent(uint256 indexed invoiceId, uint256 dueDate);
    
    event InvoiceEscrowed(
        uint256 indexed invoiceId,
        address indexed payer,
        uint256 amount
    );
    
    event InvoicePaid(
        uint256 indexed invoiceId,
        uint256 amountPaid,
        uint256 platformFee,
        bool fullyPaid
    );
    
    event PartialPayment(
        uint256 indexed invoiceId,
        uint256 amountPaid,
        uint256 remaining
    );
    
    event InvoiceCancelled(uint256 indexed invoiceId);
    
    event DisputeRaised(
        uint256 indexed invoiceId,
        address indexed initiator,
        string reason
    );
    
    event DisputeResolved(
        uint256 indexed invoiceId,
        bool refunded
    );
    
    // ============ ERRORS ============
    
    error InvalidState(InvoiceState current, InvoiceState required);
    error Unauthorized(address caller, address authorized);
    error InsufficientPayment(uint256 provided, uint256 required);
    error PartialPaymentsNotAllowed(uint256 invoiceId);
    error InvoiceOverpaid(uint256 total, uint256 limit);
    error DisputeNotResolved(uint256 invoiceId);
    
    // ============ CONSTRUCTOR ============
    
    constructor(address _openworkToken) {
        require(_openworkToken != address(0), "Invalid token");
        openworkToken = IERC20(_openworkToken);
    }
    
    // ============ CORE FUNCTIONS ============
    
    /**
     * @notice Create a new invoice (draft state)
     * @param recipient Who will pay
     * @param amount Total amount due
     * @param description Work description
     * @param dueDate Optional deadline (0 = no deadline)
     * @param partialPayment Allow partial payments
     * @return invoiceId ID of created invoice
     */
    function createInvoice(
        address recipient,
        uint256 amount,
        string memory description,
        uint256 dueDate,
        bool partialPayment
    ) external whenNotPaused returns (uint256) {
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot invoice self");
        require(amount > 0, "Amount must be > 0");
        
        uint256 invoiceId = invoiceIdCounter++;
        
        invoices[invoiceId] = Invoice({
            id: invoiceId,
            issuer: msg.sender,
            recipient: recipient,
            amount: amount,
            paidAmount: 0,
            state: InvoiceState.DRAFT,
            createdAt: block.timestamp,
            dueDate: dueDate,
            description: description,
            partialPayment: partialPayment
        });
        
        issuedInvoices[msg.sender].push(invoiceId);
        receivedInvoices[recipient].push(invoiceId);
        
        emit InvoiceCreated(invoiceId, msg.sender, recipient, amount);
        
        return invoiceId;
    }
    
    /**
     * @notice Send invoice to recipient (draft → sent)
     * @param invoiceId ID to send
     */
    function sendInvoice(uint256 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        
        if (msg.sender != invoice.issuer) {
            revert Unauthorized(msg.sender, invoice.issuer);
        }
        if (invoice.state != InvoiceState.DRAFT) {
            revert InvalidState(invoice.state, InvoiceState.DRAFT);
        }
        
        invoice.state = InvoiceState.SENT;
        
        emit InvoiceSent(invoiceId, invoice.dueDate);
    }
    
    /**
     * @notice Pay invoice with escrow (sent → escrowed → paid)
     * @param invoiceId ID to pay
     * @param amount Amount to pay (can be partial if allowed)
     */
    function payInvoice(uint256 invoiceId, uint256 amount) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        Invoice storage invoice = invoices[invoiceId];
        
        // Validation
        if (msg.sender != invoice.recipient) {
            revert Unauthorized(msg.sender, invoice.recipient);
        }
        if (invoice.state != InvoiceState.SENT && invoice.state != InvoiceState.ESCROWED) {
            revert InvalidState(invoice.state, InvoiceState.SENT);
        }
        require(amount > 0, "Amount must be > 0");
        
        uint256 remaining = invoice.amount - invoice.paidAmount;
        
        // Check partial payment rules
        if (amount < remaining && !invoice.partialPayment) {
            revert PartialPaymentsNotAllowed(invoiceId);
        }
        
        // Check not overpaying
        if (amount > remaining) {
            revert InvoiceOverpaid(invoice.paidAmount + amount, invoice.amount);
        }
        
        // Transfer to escrow
        require(
            openworkToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        escrowBalances[invoiceId] += amount;
        invoice.paidAmount += amount;
        
        // Update state
        if (invoice.state == InvoiceState.SENT) {
            invoice.state = InvoiceState.ESCROWED;
            emit InvoiceEscrowed(invoiceId, msg.sender, amount);
        }
        
        // Check if fully paid
        if (invoice.paidAmount >= invoice.amount) {
            _settle(invoiceId);
        } else {
            emit PartialPayment(invoiceId, amount, remaining - amount);
        }
    }
    
    /**
     * @notice Cancel invoice (issuer only, draft/sent states)
     * @param invoiceId ID to cancel
     */
    function cancelInvoice(uint256 invoiceId) external {
        Invoice storage invoice = invoices[invoiceId];
        
        if (msg.sender != invoice.issuer) {
            revert Unauthorized(msg.sender, invoice.issuer);
        }
        if (invoice.state != InvoiceState.DRAFT && invoice.state != InvoiceState.SENT) {
            revert InvalidState(invoice.state, InvoiceState.DRAFT);
        }
        
        invoice.state = InvoiceState.CANCELLED;
        
        emit InvoiceCancelled(invoiceId);
    }
    
    /**
     * @notice Raise a dispute on escrowed invoice
     * @param invoiceId ID to dispute
     * @param reason Dispute reason
     * @param validators Addresses that can resolve
     */
    function raiseDispute(
        uint256 invoiceId,
        string memory reason,
        address[] memory validators
    ) external {
        Invoice storage invoice = invoices[invoiceId];
        
        require(
            msg.sender == invoice.issuer || msg.sender == invoice.recipient,
            "Not party to invoice"
        );
        if (invoice.state != InvoiceState.ESCROWED) {
            revert InvalidState(invoice.state, InvoiceState.ESCROWED);
        }
        require(validators.length > 0, "Need validators");
        
        invoice.state = InvoiceState.DISPUTED;
        
        disputes[invoiceId] = Dispute({
            invoiceId: invoiceId,
            initiator: msg.sender,
            reason: reason,
            createdAt: block.timestamp,
            validators: validators,
            validatorApprovals: 0,
            resolved: false
        });
        
        emit DisputeRaised(invoiceId, msg.sender, reason);
    }
    
    /**
     * @notice Resolve dispute (validators only)
     * @param invoiceId ID to resolve
     * @param refund True = refund to payer, False = settle to issuer
     */
    function resolveDispute(uint256 invoiceId, bool refund) external {
        Dispute storage dispute = disputes[invoiceId];
        Invoice storage invoice = invoices[invoiceId];
        
        require(!dispute.resolved, "Already resolved");
        
        // Validate caller is validator
        bool isValidator = false;
        for (uint256 i = 0; i < dispute.validators.length; i++) {
            if (dispute.validators[i] == msg.sender) {
                isValidator = true;
                break;
            }
        }
        require(isValidator, "Not validator");
        
        dispute.validatorApprovals++;
        
        // Require majority approval
        uint256 requiredApprovals = (dispute.validators.length / 2) + 1;
        if (dispute.validatorApprovals < requiredApprovals) {
            return; // Wait for more approvals
        }
        
        dispute.resolved = true;
        
        if (refund) {
            // Refund to recipient
            uint256 escrow = escrowBalances[invoiceId];
            escrowBalances[invoiceId] = 0;
            require(
                openworkToken.transfer(invoice.recipient, escrow),
                "Refund failed"
            );
            invoice.state = InvoiceState.CANCELLED;
        } else {
            // Settle to issuer
            _settle(invoiceId);
        }
        
        emit DisputeResolved(invoiceId, refund);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Get invoices issued by agent
     * @param agent Agent address
     * @return ids Array of invoice IDs
     */
    function getIssuedInvoices(address agent) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return issuedInvoices[agent];
    }
    
    /**
     * @notice Get invoices received by agent
     * @param agent Agent address
     * @return ids Array of invoice IDs
     */
    function getReceivedInvoices(address agent) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return receivedInvoices[agent];
    }
    
    /**
     * @notice Get invoice details
     * @param invoiceId ID to query
     * @return invoice Full invoice data
     */
    function getInvoice(uint256 invoiceId) 
        external 
        view 
        returns (Invoice memory) 
    {
        return invoices[invoiceId];
    }
    
    // ============ INTERNAL FUNCTIONS ============
    
    /**
     * @notice Settle escrowed invoice (95% to issuer, 5% platform fee)
     * @param invoiceId ID to settle
     */
    function _settle(uint256 invoiceId) internal {
        Invoice storage invoice = invoices[invoiceId];
        uint256 escrow = escrowBalances[invoiceId];
        
        // Calculate fee (5%)
        uint256 platformFee = (escrow * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 payoutAmount = escrow - platformFee;
        
        // Update state
        escrowBalances[invoiceId] = 0;
        invoice.state = InvoiceState.PAID;
        collectedFees += platformFee;
        
        // Transfer to issuer (95%)
        require(
            openworkToken.transfer(invoice.issuer, payoutAmount),
            "Payout failed"
        );
        
        emit InvoicePaid(invoiceId, payoutAmount, platformFee, true);
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /**
     * @notice Withdraw collected platform fees
     * @param to Recipient address
     */
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 amount = collectedFees;
        collectedFees = 0;
        
        require(openworkToken.transfer(to, amount), "Withdrawal failed");
    }
    
    /// @notice Pause contract
    function pause() external onlyOwner {
        _pause();
    }
    
    /// @notice Unpause contract
    function unpause() external onlyOwner {
        _unpause();
    }
}
