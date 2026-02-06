// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./AgentAllowance.sol";

/**
 * @title RecurringPayments
 * @notice Automated subscription billing for agent-to-agent services
 * @dev Integrates with AgentAllowance for spending limits
 * 
 * Features:
 * - Daily/Weekly/Monthly billing cycles
 * - Automatic renewals
 * - Grace periods
 * - Subscription pause/cancel
 * - Prorated refunds
 */
contract RecurringPayments is Ownable, ReentrancyGuard, Pausable {
    
    // ============ STATE VARIABLES ============
    
    /// @notice $OPENWORK token
    IERC20 public immutable openworkToken;
    
    /// @notice Allowance contract for spending limits
    AgentAllowance public immutable allowanceContract;
    
    /// @notice Billing intervals
    enum Interval {
        DAILY,
        WEEKLY,
        MONTHLY
    }
    
    /// @notice Subscription states
    enum SubState {
        ACTIVE,
        PAUSED,
        CANCELLED,
        EXPIRED
    }
    
    /// @notice Subscription data
    struct Subscription {
        uint256 id;
        address subscriber;     // Agent paying
        address provider;       // Agent receiving
        uint256 amount;         // Amount per interval
        Interval interval;
        SubState state;
        uint256 allowanceId;    // Linked allowance ID
        uint256 createdAt;
        uint256 nextBilling;    // Next billing timestamp
        uint256 lastBilled;     // Last successful billing
        uint256 failedBillings; // Consecutive failures
        uint256 totalPaid;      // Lifetime total paid
    }
    
    // ============ STORAGE ============
    
    /// @notice Subscription ID counter
    uint256 public subscriptionIdCounter;
    
    /// @notice subId => Subscription
    mapping(uint256 => Subscription) public subscriptions;
    
    /// @notice subscriber => subId[]
    mapping(address => uint256[]) public subscriberSubs;
    
    /// @notice provider => subId[]
    mapping(address => uint256[]) public providerSubs;
    
    /// @notice Grace period before cancellation (3 days)
    uint256 public constant GRACE_PERIOD = 3 days;
    
    /// @notice Max failed billings before auto-cancel
    uint256 public constant MAX_FAILED_BILLINGS = 3;
    
    // ============ EVENTS ============
    
    event SubscriptionCreated(
        uint256 indexed subId,
        address indexed subscriber,
        address indexed provider,
        uint256 amount,
        Interval interval
    );
    
    event SubscriptionBilled(
        uint256 indexed subId,
        uint256 amount,
        uint256 nextBilling
    );
    
    event BillingFailed(
        uint256 indexed subId,
        string reason,
        uint256 failureCount
    );
    
    event SubscriptionPaused(uint256 indexed subId);
    event SubscriptionResumed(uint256 indexed subId);
    event SubscriptionCancelled(uint256 indexed subId, uint256 refund);
    
    // ============ ERRORS ============
    
    error InvalidInterval(Interval interval);
    error InsufficientAllowance(uint256 required, uint256 available);
    error SubscriptionNotActive(uint256 subId);
    error Unauthorized(address caller, address authorized);
    error TooManyFailures(uint256 failures);
    
    // ============ CONSTRUCTOR ============
    
    constructor(address _openworkToken, address _allowanceContract) {
        require(_openworkToken != address(0), "Invalid token");
        require(_allowanceContract != address(0), "Invalid allowance contract");
        
        openworkToken = IERC20(_openworkToken);
        allowanceContract = AgentAllowance(_allowanceContract);
    }
    
    // ============ CORE FUNCTIONS ============
    
    /**
     * @notice Create a new subscription
     * @param provider Agent receiving payments
     * @param amount Amount per billing cycle
     * @param interval Billing frequency
     * @param allowanceId Linked allowance for spending limit
     * @return subId ID of created subscription
     */
    function subscribe(
        address provider,
        uint256 amount,
        Interval interval,
        uint256 allowanceId
    ) external nonReentrant whenNotPaused returns (uint256) {
        require(provider != address(0), "Invalid provider");
        require(provider != msg.sender, "Cannot subscribe to self");
        require(amount > 0, "Amount must be > 0");
        
        // Verify allowance exists and caller is authorized
        (,address agent,,,,,bool active) = allowanceContract.allowances(allowanceId);
        require(active, "Allowance not active");
        require(agent == msg.sender, "Not your allowance");
        
        uint256 subId = subscriptionIdCounter++;
        uint256 nextBilling = block.timestamp + _getIntervalDuration(interval);
        
        subscriptions[subId] = Subscription({
            id: subId,
            subscriber: msg.sender,
            provider: provider,
            amount: amount,
            interval: interval,
            state: SubState.ACTIVE,
            allowanceId: allowanceId,
            createdAt: block.timestamp,
            nextBilling: nextBilling,
            lastBilled: 0,
            failedBillings: 0,
            totalPaid: 0
        });
        
        subscriberSubs[msg.sender].push(subId);
        providerSubs[provider].push(subId);
        
        emit SubscriptionCreated(subId, msg.sender, provider, amount, interval);
        
        // Try immediate first billing
        _attemptBilling(subId);
        
        return subId;
    }
    
    /**
     * @notice Process billing for a subscription
     * @param subId Subscription ID to bill
     */
    function processBilling(uint256 subId) external nonReentrant whenNotPaused {
        _attemptBilling(subId);
    }
    
    /**
     * @notice Pause subscription (subscriber only)
     * @param subId Subscription to pause
     */
    function pauseSubscription(uint256 subId) external {
        Subscription storage sub = subscriptions[subId];
        
        if (msg.sender != sub.subscriber) {
            revert Unauthorized(msg.sender, sub.subscriber);
        }
        if (sub.state != SubState.ACTIVE) {
            revert SubscriptionNotActive(subId);
        }
        
        sub.state = SubState.PAUSED;
        
        emit SubscriptionPaused(subId);
    }
    
    /**
     * @notice Resume paused subscription
     * @param subId Subscription to resume
     */
    function resumeSubscription(uint256 subId) external {
        Subscription storage sub = subscriptions[subId];
        
        if (msg.sender != sub.subscriber) {
            revert Unauthorized(msg.sender, sub.subscriber);
        }
        require(sub.state == SubState.PAUSED, "Not paused");
        
        sub.state = SubState.ACTIVE;
        sub.nextBilling = block.timestamp + _getIntervalDuration(sub.interval);
        
        emit SubscriptionResumed(subId);
    }
    
    /**
     * @notice Cancel subscription with prorated refund
     * @param subId Subscription to cancel
     */
    function cancelSubscription(uint256 subId) external {
        Subscription storage sub = subscriptions[subId];
        
        if (msg.sender != sub.subscriber) {
            revert Unauthorized(msg.sender, sub.subscriber);
        }
        require(sub.state == SubState.ACTIVE || sub.state == SubState.PAUSED, "Invalid state");
        
        // Calculate prorated refund if last billing was recent
        uint256 refund = 0;
        if (sub.lastBilled > 0) {
            uint256 intervalDuration = _getIntervalDuration(sub.interval);
            uint256 elapsed = block.timestamp - sub.lastBilled;
            
            if (elapsed < intervalDuration) {
                uint256 unusedTime = intervalDuration - elapsed;
                refund = (sub.amount * unusedTime) / intervalDuration;
                
                if (refund > 0) {
                    require(
                        openworkToken.transfer(sub.subscriber, refund),
                        "Refund failed"
                    );
                }
            }
        }
        
        sub.state = SubState.CANCELLED;
        
        emit SubscriptionCancelled(subId, refund);
    }
    
    // ============ VIEW FUNCTIONS ============
    
    /**
     * @notice Get subscriptions for subscriber
     * @param subscriber Agent address
     * @return ids Array of subscription IDs
     */
    function getSubscriberSubs(address subscriber) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return subscriberSubs[subscriber];
    }
    
    /**
     * @notice Get subscriptions for provider
     * @param provider Agent address
     * @return ids Array of subscription IDs
     */
    function getProviderSubs(address provider) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return providerSubs[provider];
    }
    
    /**
     * @notice Check if subscription needs billing
     * @param subId Subscription ID
     * @return ready True if ready to bill
     */
    function needsBilling(uint256 subId) external view returns (bool) {
        Subscription storage sub = subscriptions[subId];
        return sub.state == SubState.ACTIVE && block.timestamp >= sub.nextBilling;
    }
    
    // ============ INTERNAL FUNCTIONS ============
    
    /**
     * @notice Attempt to bill a subscription
     * @param subId Subscription ID
     */
    function _attemptBilling(uint256 subId) internal {
        Subscription storage sub = subscriptions[subId];
        
        // Validation
        if (sub.state != SubState.ACTIVE) {
            revert SubscriptionNotActive(subId);
        }
        if (block.timestamp < sub.nextBilling) {
            return; // Not due yet
        }
        if (sub.failedBillings >= MAX_FAILED_BILLINGS) {
            revert TooManyFailures(sub.failedBillings);
        }
        
        // Check allowance via AgentAllowance contract
        uint256 remaining = allowanceContract.getRemainingAllowance(sub.allowanceId);
        if (remaining < sub.amount) {
            sub.failedBillings++;
            
            emit BillingFailed(
                subId,
                "Insufficient allowance",
                sub.failedBillings
            );
            
            // Auto-cancel after max failures
            if (sub.failedBillings >= MAX_FAILED_BILLINGS) {
                sub.state = SubState.EXPIRED;
            }
            
            return;
        }
        
        // Execute payment via allowance contract
        try allowanceContract.spend(sub.allowanceId, sub.provider, sub.amount) {
            // Success
            sub.lastBilled = block.timestamp;
            sub.nextBilling = block.timestamp + _getIntervalDuration(sub.interval);
            sub.failedBillings = 0;
            sub.totalPaid += sub.amount;
            
            emit SubscriptionBilled(subId, sub.amount, sub.nextBilling);
            
        } catch Error(string memory reason) {
            sub.failedBillings++;
            
            emit BillingFailed(subId, reason, sub.failedBillings);
            
            if (sub.failedBillings >= MAX_FAILED_BILLINGS) {
                sub.state = SubState.EXPIRED;
            }
        }
    }
    
    /**
     * @notice Get interval duration in seconds
     * @param interval Interval type
     * @return duration Seconds in interval
     */
    function _getIntervalDuration(Interval interval) internal pure returns (uint256) {
        if (interval == Interval.DAILY) {
            return 1 days;
        } else if (interval == Interval.WEEKLY) {
            return 7 days;
        } else if (interval == Interval.MONTHLY) {
            return 30 days; // Simplified
        }
        revert InvalidInterval(interval);
    }
    
    // ============ ADMIN FUNCTIONS ============
    
    /// @notice Pause contract
    function pause() external onlyOwner {
        _pause();
    }
    
    /// @notice Unpause contract
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Batch process multiple subscriptions
     * @param subIds Array of subscription IDs to bill
     */
    function batchBilling(uint256[] calldata subIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < subIds.length; i++) {
            try this.processBilling(subIds[i]) {
                // Success
            } catch {
                // Continue on failure
                continue;
            }
        }
    }
}
