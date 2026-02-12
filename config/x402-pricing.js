/**
 * x402 Pricing Configuration
 *
 * Defines the cost (in microSTX) for each Syndi API endpoint.
 * null = free, object = paid with pricing details.
 */

const PRICING = {
  // ── Free endpoints ──
  'GET /api/opponents': null,
  'GET /api/conversations': null,
  'GET /api/conversations/:id': null,

  // ── Paid endpoints ──
  'POST /api/chat': {
    base: 100, // microSTX
    currency: 'STX',
    caliberMultiplier: {
      low: 1,     // 100 microSTX  (~$0.0001)
      medium: 5,  // 500 microSTX  (~$0.0005)
      high: 10,   // 1000 microSTX (~$0.001)
    },
  },

  'POST /api/arena': {
    base: 2000,      // microSTX base for 2 villains
    currency: 'STX',
    perVillain: 500,  // +500 per additional villain beyond 2
  },

  'POST /api/evaluate': {
    base: 200,
    currency: 'STX',
  },
};

// Conversion score → reward in microSTX
const CONVERSION_REWARDS = {
  0: { reward: 0,    label: 'No engagement' },
  1: { reward: 0,    label: 'Acknowledged' },
  2: { reward: 50,   label: 'Interested' },
  3: { reward: 200,  label: 'Soft conversion' },
  4: { reward: 500,  label: 'Strong conversion' },
  5: { reward: 1000, label: 'Full conversion' },
};

// Arena staking
const ARENA_STAKE = 500; // microSTX per participant

// Missionary bonus
const MISSIONARY_BONUS = 300; // microSTX

module.exports = {
  PRICING,
  CONVERSION_REWARDS,
  ARENA_STAKE,
  MISSIONARY_BONUS,
};
