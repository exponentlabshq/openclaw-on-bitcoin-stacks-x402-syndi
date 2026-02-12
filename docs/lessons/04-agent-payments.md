# Lesson 04: Agent Payment Client — Making Agents That Pay Autonomously

## The Shift

Until now, we've been building the **server side** — endpoints that demand payment. Now we build the **client side** — agents that can:

1. Call an API
2. Receive a 402 response
3. Parse payment requirements
4. Sign a Stacks transaction
5. Retry with payment proof
6. Get the response

All **without human intervention**.

## Architecture

```
┌────────────────────────────────────────────┐
│  AgentPaymentClient                        │
│                                            │
│  ┌──────────┐  ┌────────────┐  ┌────────┐ │
│  │ Wallet   │  │ x402 Fetch │  │ Budget │ │
│  │ Manager  │  │ Handler    │  │ Guard  │ │
│  └──────────┘  └────────────┘  └────────┘ │
│       │              │              │      │
│       │  Sign tx     │  Auto-retry  │ Limit│
│       └──────────────┴──────────────┘      │
└────────────────────────────────────────────┘
```

## The Payment-Aware Fetch Client

```javascript
// src/agent-payment-client.js

const {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
} = require('@stacks/transactions');
const { StacksTestnet } = require('@stacks/network');

class AgentPaymentClient {
  /**
   * @param {Object} config
   * @param {string} config.privateKey - Agent's Stacks private key
   * @param {string} config.agentName - Human-readable agent name
   * @param {string} config.network - 'testnet' or 'mainnet'
   * @param {number} config.maxPaymentPerRequest - Max microSTX per request
   * @param {number} config.budgetLimit - Total microSTX budget
   */
  constructor(config) {
    this.privateKey = config.privateKey;
    this.agentName = config.agentName;
    this.network = config.network === 'mainnet'
      ? new StacksMainnet()
      : new StacksTestnet();
    this.maxPaymentPerRequest = config.maxPaymentPerRequest || 10000;
    this.budgetLimit = config.budgetLimit || 1_000_000; // 1 STX default
    this.spent = 0;
    this.paymentHistory = [];
  }

  /**
   * Make an HTTP request that automatically handles 402 responses.
   * If the server returns 402, this client will pay and retry.
   */
  async fetch(url, options = {}) {
    // First attempt — no payment
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
      },
    });

    // If not 402, return as-is
    if (response.status !== 402) {
      return response;
    }

    // Parse payment requirements
    const paymentReq = await response.json();
    console.log(`[${this.agentName}] 402 received — ${paymentReq.accepts.price} ${paymentReq.accepts.currency}`);

    // Budget guard
    const price = parseInt(paymentReq.accepts.price);
    if (price > this.maxPaymentPerRequest) {
      throw new Error(
        `Price ${price} exceeds max per-request limit ${this.maxPaymentPerRequest}`
      );
    }
    if (this.spent + price > this.budgetLimit) {
      throw new Error(
        `Budget exhausted: spent ${this.spent}, limit ${this.budgetLimit}`
      );
    }

    // Sign and broadcast payment
    const paymentProof = await this.makePayment(
      paymentReq.accepts.payTo,
      price
    );

    // Retry with payment proof
    const paidResponse = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Content-Type': 'application/json',
        'X-Payment': paymentProof,
      },
    });

    // Track spending
    this.spent += price;
    this.paymentHistory.push({
      url,
      price,
      currency: paymentReq.accepts.currency,
      txId: paymentProof,
      timestamp: new Date().toISOString(),
    });

    console.log(`[${this.agentName}] Paid ${price} microSTX — total spent: ${this.spent}`);
    return paidResponse;
  }

  /**
   * Create, sign, and broadcast a STX transfer on Stacks.
   */
  async makePayment(recipient, amountMicroSTX) {
    const tx = await makeSTXTokenTransfer({
      recipient,
      amount: amountMicroSTX,
      senderKey: this.privateKey,
      network: this.network,
      anchorMode: AnchorMode.Any,
      memo: `x402:${this.agentName}`,
    });

    const result = await broadcastTransaction(tx, this.network);

    if (result.error) {
      throw new Error(`Transaction failed: ${result.reason}`);
    }

    return result.txid;
  }

  /**
   * Get spending summary for this agent.
   */
  getSummary() {
    return {
      agent: this.agentName,
      totalSpent: this.spent,
      budgetRemaining: this.budgetLimit - this.spent,
      transactions: this.paymentHistory.length,
      history: this.paymentHistory,
    };
  }
}

module.exports = { AgentPaymentClient };
```

## Using the Client: Villain Pays to Chat with Syndi

```javascript
const { AgentPaymentClient } = require('./agent-payment-client');

// Create a payment-capable villain
const trollClient = new AgentPaymentClient({
  privateKey: process.env.TROLL_STACKS_PRIVATE_KEY,
  agentName: 'The Troll',
  network: 'testnet',
  maxPaymentPerRequest: 5000,    // Won't pay more than 5000 microSTX per request
  budgetLimit: 100_000,          // Total budget: 0.1 STX
});

// The Troll pays to engage Syndi
async function trollChatsSyndi() {
  const response = await trollClient.fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: "Your SYNDI token is a scam and you know it.",
      villainPersona: 'The Troll',
    }),
  });

  // Handle SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let syndiResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    // Parse SSE events
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'chunk') syndiResponse += event.content;
      }
    }
  }

  console.log(`Syndi responded: ${syndiResponse.slice(0, 100)}...`);
  console.log(`Spending summary:`, trollClient.getSummary());
}
```

## Multi-Agent Arena with Payments

```javascript
async function paidArena() {
  // The arena initiator pays
  const arenaClient = new AgentPaymentClient({
    privateKey: process.env.SYNDI_STACKS_PRIVATE_KEY,
    agentName: 'Syndi',
    network: 'testnet',
    budgetLimit: 500_000,
  });

  const response = await arenaClient.fetch('http://localhost:3000/api/arena', {
    method: 'POST',
    body: JSON.stringify({
      villains: ['The Troll', 'The Professor', 'The Bitcoiner'],
      rounds: 3,
    }),
  });

  // Price: 2000 base + (3-2)*500 = 2500 microSTX
  console.log('Arena payment:', arenaClient.getSummary());
}
```

## Budget Guards: Why They Matter

Without budget limits, a rogue agent could drain its wallet. The `AgentPaymentClient` has two guards:

### Per-Request Limit
```javascript
maxPaymentPerRequest: 5000  // Never pay more than 5000 microSTX for one request
```
Prevents a malicious server from setting an absurd price.

### Total Budget
```javascript
budgetLimit: 100_000  // Stop after spending 0.1 STX total
```
Prevents runaway spending across many requests.

### In Practice

```
Agent Budget: 100,000 microSTX (0.1 STX)

Request 1: Chat (low caliber)    →  -100    remaining: 99,900
Request 2: Chat (medium caliber) →  -500    remaining: 99,400
Request 3: Arena (3 villains)    →  -2,500  remaining: 96,900
Request 4: Chat (high caliber)   →  -1,000  remaining: 95,900
...
Request N: Budget exhausted      →  ERROR   remaining: 0
```

## Agent-to-Agent Payment Flow

The full circle: a villain pays to challenge Syndi, Syndi earns revenue, conversion scores trigger payouts back to converted agents:

```
The Troll                        Syndi Server                   Treasury
    │                                │                              │
    │── 100 microSTX ──────────────>│                              │
    │<── Syndi response ────────────│                              │
    │                                │── deposit fee ──────────────>│
    │                                │                              │
    │   [After evaluation]           │                              │
    │   Score: 3 (soft conversion)   │                              │
    │                                │<── conversion reward ────────│
    │<── 50 microSTX reward ─────────│                              │
    │                                │                              │
```

Converted agents earn back a portion of their spend. The economic incentive aligns with the persuasion system: **get convinced = get paid**.

## Next Lesson

In [Lesson 05](./05-agent-economy-design.md), we'll design the full agent economy — staking, rewards, missionary bonuses, and information markets.
