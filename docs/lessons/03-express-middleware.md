# Lesson 03: Express Middleware — Gating Syndi's API Behind x402 Payments

## The Goal

Turn Syndi's free API endpoints into paid services. When an agent calls `POST /api/chat`, it gets a 402 response with payment requirements. After paying, the request proceeds normally.

## Architecture

```
                          ┌─────────────────────┐
  Agent Request ─────────>│  x402 Middleware     │
                          │                     │
                          │  Has X-Payment?     │
                          │   ├─ NO  → 402      │
                          │   └─ YES → verify   │
                          │            ├─ FAIL → 402
                          │            └─ OK   → next()
                          └─────────┬───────────┘
                                    │
                                    v
                          ┌─────────────────────┐
                          │  Original Handler   │
                          │  (chat, arena, etc) │
                          └─────────────────────┘
```

## The Middleware

### Payment Configuration

Define pricing per endpoint:

```javascript
// config/x402-pricing.js

const PRICING = {
  // Free endpoints (no gate)
  'GET /api/opponents': null,
  'GET /api/conversations': null,
  'GET /api/conversations/:id': null,

  // Paid endpoints
  'POST /api/chat': {
    base: 100,          // 100 microSTX base price
    currency: 'STX',
    // Dynamic pricing by villain caliber:
    caliberMultiplier: {
      low: 1,           // 100 microSTX
      medium: 5,        // 500 microSTX
      high: 10,         // 1000 microSTX
    },
  },
  'POST /api/arena': {
    base: 2000,         // 2000 microSTX (expensive — multi-agent)
    currency: 'STX',
    perVillain: 500,    // +500 per additional villain
  },
  'POST /api/evaluate': {
    base: 200,          // 200 microSTX
    currency: 'STX',
  },
};

module.exports = { PRICING };
```

### Core Middleware

```javascript
// src/x402-middleware.js

const { PRICING } = require('../config/x402-pricing');

/**
 * x402 payment middleware for Express.js.
 *
 * Checks incoming requests for payment proof. If none provided,
 * returns HTTP 402 with payment requirements. If proof is present,
 * verifies it against the Stacks facilitator before proceeding.
 */
function createX402Middleware(config) {
  const {
    payToAddress,          // Treasury Stacks address
    facilitatorUrl,        // x402 facilitator endpoint
    network = 'stacks:testnet',
  } = config;

  return async function x402Gate(req, res, next) {
    // Build route key: "METHOD /path"
    const routeKey = `${req.method} ${req.route?.path || req.path}`;

    // Check if this endpoint requires payment
    const pricing = PRICING[routeKey];
    if (!pricing) {
      return next(); // Free endpoint
    }

    // Calculate dynamic price
    let price = pricing.base;

    if (routeKey === 'POST /api/chat' && req.body?.villainPersona) {
      const caliber = getVillainCaliber(req.body.villainPersona);
      price = pricing.base * (pricing.caliberMultiplier[caliber] || 1);
    }

    if (routeKey === 'POST /api/arena' && req.body?.villains) {
      price = pricing.base + (req.body.villains.length - 2) * pricing.perVillain;
    }

    // Check for payment proof header
    const paymentProof = req.headers['x-payment'];

    if (!paymentProof) {
      // Return 402 Payment Required
      return res.status(402).json({
        accepts: {
          scheme: 'exact',
          network,
          price: String(price),
          currency: pricing.currency,
          payTo: payToAddress,
          description: `Syndi API — ${routeKey}`,
          maxTimeoutSeconds: 300,
        },
        facilitator: {
          url: facilitatorUrl,
        },
      });
    }

    // Verify payment with facilitator
    try {
      const verified = await verifyPaymentWithFacilitator(
        facilitatorUrl,
        paymentProof,
        price,
        payToAddress
      );

      if (!verified.success) {
        return res.status(402).json({
          error: 'Payment verification failed',
          reason: verified.reason,
        });
      }

      // Attach payment info to request
      req.payment = {
        verified: true,
        amount: price,
        currency: pricing.currency,
        txId: verified.txId,
        payer: verified.payer,
      };

      next();
    } catch (err) {
      console.error('[x402] Verification error:', err.message);
      return res.status(500).json({ error: 'Payment verification service unavailable' });
    }
  };
}

/**
 * Verify payment proof with the x402 facilitator service.
 */
async function verifyPaymentWithFacilitator(facilitatorUrl, paymentProof, expectedAmount, expectedRecipient) {
  const response = await fetch(`${facilitatorUrl}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentProof,
      expectedAmount: String(expectedAmount),
      expectedRecipient,
    }),
  });

  if (!response.ok) {
    return { success: false, reason: 'Facilitator rejected verification' };
  }

  return await response.json();
}

/**
 * Look up villain caliber by persona name.
 */
function getVillainCaliber(villainName) {
  // Import from syndi-core at runtime to avoid circular deps
  const { OPPONENTS } = require('../../syndi-core/syndi-core');
  const villain = OPPONENTS.find(o => o.name === villainName);
  return villain?.caliber || 'low';
}

module.exports = { createX402Middleware };
```

### Integrating with Syndi's Server

Here's how the middleware plugs into the existing `index.js`:

```javascript
// In server.js — add these lines:

const { createX402Middleware } = require('./src/x402-middleware');

// After app.use(cors()) and app.use(express.json()):
if (process.env.X402_ENABLED === 'true') {
  const x402 = createX402Middleware({
    payToAddress: process.env.TREASURY_STACKS_ADDRESS,
    facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://facilitator.x402stacks.xyz',
    network: process.env.STACKS_NETWORK || 'stacks:testnet',
  });

  // Apply to paid endpoints only
  app.use('/api/chat', x402);
  app.use('/api/arena', x402);
  app.use('/api/evaluate', x402);

  console.log('  x402: ENABLED (payments required for chat/arena/evaluate)');
}
```

## Dynamic Pricing: Why It Matters

Static pricing ignores the value hierarchy already built into Syndi. The villain caliber system maps directly to economic tiers:

| Caliber | Model | Price | Examples |
|---------|-------|-------|----------|
| Low | gpt-4o-mini | 100 microSTX (~$0.0001) | The Troll, The Penguin |
| Medium | gpt-4o | 500 microSTX (~$0.0005) | The Bitcoiner, The Know It All |
| High | gpt-4.1 | 1000 microSTX (~$0.001) | The Professor, The Sage |
| Arena | mixed | 2000+ microSTX | Multi-agent debates |

This creates a natural market: harder opponents are more valuable to engage because:
- They require Syndi's best persuasion techniques
- They generate higher-quality conversion data
- Their conversion is worth more (harder to convince = stronger signal)

## Payment Logging

Track all payments for analytics:

```javascript
// src/payment-logger.js

class PaymentLogger {
  constructor() {
    this.payments = [];
  }

  log(payment) {
    this.payments.push({
      ...payment,
      timestamp: new Date().toISOString(),
    });
  }

  getRevenue(currency = 'STX') {
    return this.payments
      .filter(p => p.currency === currency)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  getPaymentsByAgent(agentName) {
    return this.payments.filter(p => p.payer === agentName);
  }

  getSummary() {
    return {
      totalPayments: this.payments.length,
      totalRevenue: this.getRevenue(),
      uniquePayers: [...new Set(this.payments.map(p => p.payer))].length,
      byEndpoint: this.payments.reduce((acc, p) => {
        acc[p.endpoint] = (acc[p.endpoint] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

module.exports = { PaymentLogger };
```

## Environment Variables

Add these to your `.env`:

```env
# x402 Configuration
X402_ENABLED=true
X402_FACILITATOR_URL=https://facilitator.x402stacks.xyz
STACKS_NETWORK=stacks:testnet
TREASURY_STACKS_ADDRESS=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM
```

## Testing Without x402

The middleware is opt-in via `X402_ENABLED`. When disabled (default), all endpoints work exactly as before — zero breaking changes.

```bash
# Without x402 (original behavior)
X402_ENABLED=false npm start

# With x402 payments
X402_ENABLED=true npm start
```

## Next Lesson

In [Lesson 04](./04-agent-payments.md), we'll build the client side — an agent that can read 402 responses and autonomously pay for access.
