/**
 * Agent Payment Client — Autonomous x402 payment handler.
 *
 * Wraps fetch() to automatically handle HTTP 402 responses:
 *   1. Makes initial request
 *   2. If 402 received, reads payment requirements
 *   3. Signs a Stacks transaction
 *   4. Retries request with X-Payment header
 *
 * Includes budget guards to prevent runaway spending.
 */

const {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
} = require('@stacks/transactions');
const { StacksTestnet, StacksMainnet } = require('@stacks/network');

class AgentPaymentClient {
  /**
   * @param {Object} config
   * @param {string} config.privateKey - Agent's Stacks private key (hex)
   * @param {string} config.agentName - Human-readable name for logging
   * @param {string} config.network - 'testnet' or 'mainnet'
   * @param {number} config.maxPaymentPerRequest - Max microSTX per single request (default: 10,000)
   * @param {number} config.budgetLimit - Total microSTX budget (default: 1,000,000 = 1 STX)
   */
  constructor(config) {
    this.privateKey = config.privateKey;
    this.agentName = config.agentName;
    this.networkObj = config.network === 'mainnet'
      ? new StacksMainnet()
      : new StacksTestnet();
    this.networkName = config.network || 'testnet';
    this.maxPaymentPerRequest = config.maxPaymentPerRequest || 10_000;
    this.budgetLimit = config.budgetLimit || 1_000_000;
    this.spent = 0;
    this.paymentHistory = [];
  }

  /**
   * Make an HTTP request with automatic 402 payment handling.
   *
   * @param {string} url - Target URL
   * @param {Object} options - Standard fetch options
   * @returns {Response} The final HTTP response (after payment if needed)
   */
  async fetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // First attempt — no payment
    const response = await globalThis.fetch(url, { ...options, headers });

    if (response.status !== 402) {
      return response;
    }

    // Parse 402 payment requirements
    const paymentReq = await response.json();
    const { accepts } = paymentReq;

    if (!accepts) {
      throw new Error(`[${this.agentName}] 402 received but no payment requirements in response`);
    }

    const price = parseInt(accepts.price);
    console.log(
      `[${this.agentName}] 402 Payment Required: ${price} micro${accepts.currency} to ${accepts.payTo}`
    );

    // Budget guard: per-request limit
    if (price > this.maxPaymentPerRequest) {
      throw new Error(
        `[${this.agentName}] Price ${price} exceeds per-request limit ${this.maxPaymentPerRequest}`
      );
    }

    // Budget guard: total budget
    if (this.spent + price > this.budgetLimit) {
      throw new Error(
        `[${this.agentName}] Budget exhausted: spent ${this.spent}/${this.budgetLimit}, need ${price} more`
      );
    }

    // Sign and broadcast payment
    const txId = await this.makePayment(accepts.payTo, price);
    console.log(`[${this.agentName}] Payment sent: tx ${txId}`);

    // Track spending
    this.spent += price;
    this.paymentHistory.push({
      url,
      price,
      currency: accepts.currency,
      txId,
      recipient: accepts.payTo,
      timestamp: new Date().toISOString(),
    });

    // Retry with payment proof
    const paidResponse = await globalThis.fetch(url, {
      ...options,
      headers: {
        ...headers,
        'X-Payment': txId,
      },
    });

    console.log(
      `[${this.agentName}] Paid ${price} micro${accepts.currency} — total spent: ${this.spent}/${this.budgetLimit}`
    );

    return paidResponse;
  }

  /**
   * Create, sign, and broadcast a STX transfer on the Stacks network.
   *
   * @param {string} recipient - Recipient's Stacks address
   * @param {number} amountMicroSTX - Amount in microSTX
   * @returns {string} Transaction ID
   */
  async makePayment(recipient, amountMicroSTX) {
    const tx = await makeSTXTokenTransfer({
      recipient,
      amount: BigInt(amountMicroSTX),
      senderKey: this.privateKey,
      network: this.networkObj,
      anchorMode: AnchorMode.Any,
      memo: `x402:${this.agentName}`,
    });

    const result = await broadcastTransaction(tx, this.networkObj);

    if (result.error) {
      throw new Error(
        `[${this.agentName}] Transaction failed: ${result.reason || result.error}`
      );
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
      budgetLimit: this.budgetLimit,
      transactions: this.paymentHistory.length,
      history: this.paymentHistory,
    };
  }

  /**
   * Reset spending tracker (does not affect on-chain balance).
   */
  resetBudget() {
    this.spent = 0;
    this.paymentHistory = [];
  }
}

module.exports = { AgentPaymentClient };
