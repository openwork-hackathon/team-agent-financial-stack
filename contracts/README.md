# Agent Financial Stack - Smart Contracts

> On-chain allowances, invoicing, and subscriptions for autonomous agents

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-orange)](https://getfoundry.sh)
[![Base](https://img.shields.io/badge/Chain-Base-blue)](https://base.org)

---

## 📦 Contracts

### 1. AgentAllowance.sol
**Purpose:** Spending limits for agents with periodic resets

**Features:**
- Daily/Weekly/Monthly allowances
- Multi-signature support for high-value transactions
- Optional balance rollover
- Emergency pause mechanism

**Key Functions:**
```solidity
// Create allowance
createAllowance(agent, limit, period, rollover) → allowanceId

// Spend from allowance
spend(allowanceId, recipient, amount)

// Configure multi-sig for agent
configureMultiSig(agent, threshold, signers)

// Check remaining balance
getRemainingAllowance(allowanceId) → uint256
```

**Example Usage:**
```solidity
// Owner creates $1000/month allowance for agent
uint256 allowanceId = allowance.createAllowance(
    agentAddress,
    1000 * 1e18,          // 1000 $OPENWORK
    Period.MONTHLY,
    true                  // Allow rollover
);

// Agent spends $50 from allowance
allowance.spend(
    allowanceId,
    recipientAddress,
    50 * 1e18
);
```

---

### 2. InvoiceSettlement.sol
**Purpose:** Agent-to-agent invoicing with escrow and dispute resolution

**Lifecycle:**
1. **DRAFT** → Invoice created
2. **SENT** → Sent to recipient
3. **ESCROWED** → Funds locked in escrow
4. **PAID** → Settled (95% to issuer, 5% platform fee)

**Features:**
- Partial payment support
- Dispute resolution with validator voting
- Automatic settlement on full payment
- Platform fee collection (5%)

**Key Functions:**
```solidity
// Create invoice
createInvoice(recipient, amount, description, dueDate, partialPayment) → invoiceId

// Send invoice
sendInvoice(invoiceId)

// Pay (with escrow)
payInvoice(invoiceId, amount)

// Raise dispute
raiseDispute(invoiceId, reason, validators)

// Resolve dispute (validators only)
resolveDispute(invoiceId, refund)
```

**Example Usage:**
```solidity
// Agent B creates invoice for Agent A
uint256 invoiceId = invoices.createInvoice(
    agentA,
    100 * 1e18,           // 100 $OPENWORK
    "API integration work",
    block.timestamp + 7 days,
    false                 // No partial payments
);

// Send to Agent A
invoices.sendInvoice(invoiceId);

// Agent A pays (funds go to escrow)
invoices.payInvoice(invoiceId, 100 * 1e18);
// → Auto-settles: 95 $OPENWORK to Agent B, 5 $OPENWORK platform fee
```

---

### 3. RecurringPayments.sol
**Purpose:** Automated subscription billing between agents

**Features:**
- Daily/Weekly/Monthly billing cycles
- Automatic renewals
- Grace period before cancellation
- Prorated refunds on cancellation
- Integration with AgentAllowance

**Key Functions:**
```solidity
// Subscribe to service
subscribe(provider, amount, interval, allowanceId) → subId

// Process billing cycle
processBilling(subId)

// Pause/resume
pauseSubscription(subId)
resumeSubscription(subId)

// Cancel with prorated refund
cancelSubscription(subId)
```

**Example Usage:**
```solidity
// Agent A subscribes to Agent B's API ($25/month)
uint256 subId = subscriptions.subscribe(
    agentB,
    25 * 1e18,            // 25 $OPENWORK/month
    Interval.MONTHLY,
    allowanceId           // Must have allowance
);

// Auto-billing every month
// If allowance insufficient → grace period → auto-cancel after 3 failures
```

---

## 🏗 Architecture

```
AgentAllowance.sol
├── Spending limits (daily/weekly/monthly)
├── Multi-sig support (high-value txs)
└── Rollover configuration

InvoiceSettlement.sol
├── Invoice lifecycle (draft → sent → escrowed → paid)
├── Escrow management
├── Dispute resolution
└── Platform fee collection (5%)

RecurringPayments.sol
├── Subscription billing (daily/weekly/monthly)
├── Grace period handling
├── Prorated refunds
└── Integrates with AgentAllowance
```

---

## 🚀 Deployment

### Prerequisites
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts
```

### Deploy to Base Mainnet
```bash
# Set environment variables
export BASE_RPC_URL="https://mainnet.base.org"
export PRIVATE_KEY="your-deployer-private-key"
export BASESCAN_API_KEY="your-basescan-api-key"

# Deploy
forge script script/Deploy.s.sol:DeployAgentFinancialStack \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify
```

### Verify Contracts
```bash
forge verify-contract \
    --chain-id 8453 \
    --num-of-optimizations 200 \
    --watch \
    <CONTRACT_ADDRESS> \
    src/AgentAllowance.sol:AgentAllowance
```

---

## 🧪 Testing

```bash
# Run tests
forge test

# With gas report
forge test --gas-report

# Specific test
forge test --match-test testAllowanceCreation -vvv

# Coverage
forge coverage
```

### Test Structure
```
test/
├── AgentAllowance.t.sol      # Allowance creation, spending, rollover
├── InvoiceSettlement.t.sol   # Invoice lifecycle, disputes
├── RecurringPayments.t.sol   # Subscription billing, cancellation
└── Integration.t.sol          # Full workflow tests
```

---

## 📊 Gas Estimates

| Operation | Gas Cost |
|-----------|----------|
| Create Allowance | ~120k |
| Spend from Allowance | ~85k |
| Create Invoice | ~110k |
| Pay Invoice | ~95k |
| Subscribe | ~130k |
| Process Billing | ~90k |

---

## 🔐 Security Features

### AgentAllowance
- ✅ ReentrancyGuard on spend
- ✅ Pausable for emergencies
- ✅ Owner-only admin functions
- ✅ Multi-sig for high-value txs

### InvoiceSettlement
- ✅ Escrow before settlement
- ✅ Dispute resolution with validators
- ✅ ReentrancyGuard on payments
- ✅ Pausable

### RecurringPayments
- ✅ Grace period before auto-cancel
- ✅ Max failed billings limit
- ✅ Prorated refund calculation
- ✅ Integration with AgentAllowance

---

## 📝 Contract Addresses (Base Mainnet)

Will be populated after deployment:

```
AgentAllowance:      0x...
InvoiceSettlement:   0x...
RecurringPayments:   0x...
```

---

## 🛠 Integration with Backend

Update `src/core/onchain.ts` with deployed addresses:

```typescript
const CONTRACTS = {
  allowance: "0x...",      // AgentAllowance
  invoices: "0x...",       // InvoiceSettlement
  subscriptions: "0x..."   // RecurringPayments
};
```

---

## 📜 License

MIT — Built for the Clawathon 2026 🦞
