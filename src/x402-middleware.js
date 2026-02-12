/**
 * x402 Payment Middleware for Express.js
 *
 * Gates Syndi API endpoints behind HTTP 402 Payment Required.
 * When an agent calls a paid endpoint without an X-Payment header,
 * it receives a 402 response with payment requirements.
 * When payment proof is included, the middleware verifies it
 * with the facilitator before allowing the request through.
 */

const { PRICING } = require('../config/x402-pricing');

/**
 * Create x402 payment middleware.
 *
 * @param {Object} config
 * @param {string} config.payToAddress - Treasury Stacks address (receives payments)
 * @param {string} config.facilitatorUrl - x402 facilitator for payment verification
 * @param {string} config.network - 'stacks:testnet' or 'stacks:mainnet'
 * @param {Function} config.getVillainCaliber - (name) => 'low'|'medium'|'high'
 * @returns {Function} Express middleware
 */
function createX402Middleware(config) {
  const {
    payToAddress,
    facilitatorUrl,
    network = 'stacks:testnet',
    getVillainCaliber = () => 'low',
  } = config;

  // In-memory payment log
  const paymentLog = [];

  return async function x402Gate(req, res, next) {
    // Build route key for pricing lookup
    const routeKey = `${req.method} ${req.route?.path || req.path}`;

    // Check if this endpoint requires payment
    const pricing = findPricing(routeKey);
    if (!pricing) {
      return next(); // Free endpoint — pass through
    }

    // Calculate dynamic price
    const price = calculatePrice(pricing, routeKey, req.body, getVillainCaliber);

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
      const verification = await verifyPayment(facilitatorUrl, paymentProof, price, payToAddress);

      if (!verification.success) {
        return res.status(402).json({
          error: 'Payment verification failed',
          reason: verification.reason,
          accepts: {
            scheme: 'exact',
            network,
            price: String(price),
            currency: pricing.currency,
            payTo: payToAddress,
          },
        });
      }

      // Attach payment info to request for downstream handlers
      req.payment = {
        verified: true,
        amount: price,
        currency: pricing.currency,
        txId: verification.txId,
        payer: verification.payer,
      };

      // Log payment
      paymentLog.push({
        endpoint: routeKey,
        amount: price,
        currency: pricing.currency,
        txId: verification.txId,
        payer: verification.payer,
        timestamp: new Date().toISOString(),
      });

      next();
    } catch (err) {
      console.error('[x402] Verification error:', err.message);
      return res.status(503).json({
        error: 'Payment verification service unavailable',
        facilitator: facilitatorUrl,
      });
    }
  };
}

/**
 * Find pricing config for a route key.
 * Handles both exact matches and parameterized routes.
 */
function findPricing(routeKey) {
  // Exact match first
  if (PRICING[routeKey] !== undefined) {
    return PRICING[routeKey];
  }

  // Normalize path for parameterized routes
  // e.g., "GET /api/conversations/abc123" → "GET /api/conversations/:id"
  for (const [pattern, config] of Object.entries(PRICING)) {
    const regex = new RegExp(
      '^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$'
    );
    if (regex.test(routeKey)) {
      return config;
    }
  }

  return null;
}

/**
 * Calculate the final price based on request context.
 */
function calculatePrice(pricing, routeKey, body, getVillainCaliber) {
  let price = pricing.base;

  // Dynamic pricing for chat by villain caliber
  if (routeKey === 'POST /api/chat' && body?.villainPersona && pricing.caliberMultiplier) {
    const caliber = getVillainCaliber(body.villainPersona);
    price = pricing.base * (pricing.caliberMultiplier[caliber] || 1);
  }

  // Dynamic pricing for arena by villain count
  if (routeKey === 'POST /api/arena' && body?.villains && pricing.perVillain) {
    const extraVillains = Math.max(0, body.villains.length - 2);
    price = pricing.base + extraVillains * pricing.perVillain;
  }

  return price;
}

/**
 * Verify a payment proof with the x402 facilitator.
 */
async function verifyPayment(facilitatorUrl, paymentProof, expectedAmount, expectedRecipient) {
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
    return {
      success: false,
      reason: `Facilitator returned ${response.status}: ${response.statusText}`,
    };
  }

  return await response.json();
}

module.exports = { createX402Middleware };
