# Lesson 01: The x402 Protocol — HTTP 402 for AI Agent Payments

## Why HTTP 402?

HTTP 402 "Payment Required" has been a reserved status code since 1997. It was never implemented because there was no internet-native money. Now there is: Bitcoin via Stacks.

x402 turns this dormant status code into a machine-readable payment protocol. No OAuth tokens, no API keys, no subscriptions — just **pay and access**.

## The Protocol Flow in Detail

### Step 1: Initial Request

The agent makes a normal HTTP request:

```http
GET /api/chat HTTP/1.1
Host: syndi-server.example.com
Content-Type: application/json
```

### Step 2: 402 Response

The server responds with payment requirements:

```http
HTTP/1.1 402 Payment Required
X-Payment-Required: true
Content-Type: application/json

{
  "accepts": {
    "scheme": "exact",
    "network": "stacks:testnet",
    "price": "1000",
    "currency": "STX",
    "payTo": "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
    "description": "Chat with Syndi — 1 interaction",
    "maxTimeoutSeconds": 300
  },
  "facilitator": {
    "url": "https://facilitator.x402stacks.xyz"
  }
}
```

Key fields:
- **scheme**: Payment scheme (`exact` = pay exact amount)
- **network**: Which blockchain network (`stacks:testnet` or `stacks:mainnet`)
- **price**: Amount in smallest unit (microSTX for STX)
- **currency**: Settlement token (STX, sBTC, USDCx)
- **payTo**: Recipient's Stacks address
- **facilitator**: Service that verifies payments

### Step 3: Agent Signs and Pays

The agent:
1. Reads the 402 response
2. Constructs a Stacks transaction
3. Signs it with their private key
4. Submits it to the Stacks network
5. Retries the original request with payment proof

```http
GET /api/chat HTTP/1.1
Host: syndi-server.example.com
X-Payment: <base64-encoded-payment-proof>
Content-Type: application/json
```

### Step 4: Server Verifies and Delivers

The server (or facilitator) verifies the transaction on Stacks, then returns the normal response:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"type":"chunk","content":"Ah, my friend..."}
```

## The Facilitator

The **facilitator** is a trusted intermediary that:
- Verifies payments on-chain
- Prevents double-spending
- Handles settlement confirmation
- Can be self-hosted or use the official one

```
Agent ──── pay ────> Stacks L2
  │                     │
  │                     │
  └── proof ──> Server ─┘
                  │
            Facilitator
           (verify on-chain)
```

For development, use the x402 Stacks testnet facilitator. For production, you can run your own.

## Pricing Strategy for Syndi

Different endpoints have different economic value:

| Endpoint | Price | Rationale |
|----------|-------|-----------|
| `GET /api/opponents` | Free | Discovery should be free |
| `POST /api/chat` (low caliber) | 100 microSTX | Low-tier villains are cheap |
| `POST /api/chat` (medium caliber) | 500 microSTX | Better opponents cost more |
| `POST /api/chat` (high caliber) | 1000 microSTX | Premium opponents = premium price |
| `POST /api/arena` | 2000 microSTX | Multi-agent debates are expensive |
| `POST /api/evaluate` | 200 microSTX | Conversion evaluation |

## Code: Minimal x402 Server (Concept)

```javascript
// x402 middleware concept for Express.js
function x402PaymentGate(priceConfig) {
  return async (req, res, next) => {
    // Check if request includes payment proof
    const paymentHeader = req.headers['x-payment'];

    if (!paymentHeader) {
      // Return 402 with payment requirements
      return res.status(402).json({
        accepts: {
          scheme: 'exact',
          network: 'stacks:testnet',
          price: priceConfig.price,
          currency: priceConfig.currency || 'STX',
          payTo: priceConfig.payTo,
          description: priceConfig.description,
        },
        facilitator: {
          url: process.env.X402_FACILITATOR_URL,
        },
      });
    }

    // Verify payment with facilitator
    const verified = await verifyPayment(paymentHeader);
    if (!verified) {
      return res.status(402).json({ error: 'Payment verification failed' });
    }

    // Payment verified — proceed to route handler
    req.paymentVerified = true;
    req.paymentAmount = priceConfig.price;
    next();
  };
}
```

## Key Concepts

### Micropayments
x402 enables sub-cent transactions. At ~$0.001 per request, an agent can have 1,000 interactions for $1. This is the economic layer that makes agent-to-agent commerce viable.

### Autonomous Payments
Unlike human payment flows (click button, confirm, wait), x402 agents pay **programmatically**. The agent's wallet signs transactions without human intervention.

### Settlement Finality
Stacks transactions settle in ~30 seconds and inherit Bitcoin's security. This means payments are **final** — no chargebacks, no disputes.

## Next Lesson

In [Lesson 02](./02-stacks-wallets.md), we'll create Stacks wallets for Syndi and the 16 villain agents.
