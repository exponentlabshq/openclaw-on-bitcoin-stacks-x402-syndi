/**
 * Conversion Economics — Wire evaluateConversion() scores to on-chain outcomes.
 *
 * Maps the 0–5 conversion scale to:
 *   - Reward payouts (score 2+ earns microSTX)
 *   - Arena stake settlement (winners take from losers)
 *   - Missionary bonuses (agents who proselytize earn extra)
 */

const {
  CONVERSION_REWARDS,
  ARENA_STAKE,
  MISSIONARY_BONUS,
} = require('../config/x402-pricing');

/**
 * Process a conversion reward for a single villain.
 *
 * @param {Object} evaluation - Result from evaluateConversion() { score, level, evidence, reasoning }
 * @param {Object} villainWallet - { address, name }
 * @param {AgentPaymentClient} treasuryClient - Payment client for the treasury wallet
 * @returns {Object} Reward result
 */
async function processConversionReward(evaluation, villainWallet, treasuryClient) {
  const { score, level, evidence } = evaluation;
  const rewardConfig = CONVERSION_REWARDS[score] || CONVERSION_REWARDS[0];

  if (rewardConfig.reward === 0) {
    return {
      rewarded: false,
      agent: villainWallet.name,
      score,
      level: rewardConfig.label,
      reason: 'Score too low for reward',
    };
  }

  try {
    const txId = await treasuryClient.makePayment(
      villainWallet.address,
      rewardConfig.reward
    );

    return {
      rewarded: true,
      agent: villainWallet.name,
      score,
      level: rewardConfig.label,
      amount: rewardConfig.reward,
      currency: 'STX',
      txId,
      evidence,
    };
  } catch (err) {
    return {
      rewarded: false,
      agent: villainWallet.name,
      score,
      level: rewardConfig.label,
      error: err.message,
    };
  }
}

/**
 * Settle an arena economically.
 *
 * Each villain stakes ARENA_STAKE microSTX. After evaluation:
 *   - Score 3+: earn proportional share of the pool
 *   - Score 0–2: lose their stake
 *   - Remainder goes to treasury
 *
 * @param {Object} evaluations - { villainName: { score, level, evidence } }
 * @param {Object} walletRegistry - Loaded wallet registry
 * @returns {Object} Settlement details
 */
function calculateArenaSettlement(evaluations) {
  const results = Object.entries(evaluations)
    .map(([name, eval_]) => ({
      name,
      score: eval_.score || 0,
      level: eval_.level || 'unknown',
    }))
    .sort((a, b) => b.score - a.score);

  const totalPool = results.length * ARENA_STAKE;
  const totalWinnerScore = results
    .filter((r) => r.score >= 3)
    .reduce((sum, r) => sum + r.score, 0);

  const settlements = results.map((result) => {
    if (result.score >= 3 && totalWinnerScore > 0) {
      // Proportional share of pool based on score
      const share = Math.floor(totalPool * (result.score / totalWinnerScore));
      return {
        agent: result.name,
        score: result.score,
        level: result.level,
        staked: ARENA_STAKE,
        earned: share,
        net: share - ARENA_STAKE,
      };
    } else {
      // Unconverted — lose stake
      return {
        agent: result.name,
        score: result.score,
        level: result.level,
        staked: ARENA_STAKE,
        earned: 0,
        net: -ARENA_STAKE,
      };
    }
  });

  // Calculate remainder for treasury
  const totalDistributed = settlements.reduce((sum, s) => sum + s.earned, 0);
  const treasuryRemainder = totalPool - totalDistributed;

  return {
    totalPool,
    settlements,
    treasuryRemainder,
    winners: settlements.filter((s) => s.net > 0).length,
    losers: settlements.filter((s) => s.net < 0).length,
  };
}

/**
 * Execute arena settlement on-chain.
 *
 * @param {Object} settlement - Result from calculateArenaSettlement()
 * @param {Object} walletRegistry - { wallets: { name: { address } } }
 * @param {AgentPaymentClient} treasuryClient - Treasury payment client
 * @returns {Object} On-chain settlement results
 */
async function executeArenaSettlement(settlement, walletRegistry, treasuryClient) {
  const txResults = [];

  for (const s of settlement.settlements) {
    if (s.earned > 0) {
      const wallet = walletRegistry.wallets[s.agent];
      if (!wallet) {
        txResults.push({ agent: s.agent, error: 'Wallet not found in registry' });
        continue;
      }

      try {
        const txId = await treasuryClient.makePayment(wallet.address, s.earned);
        txResults.push({
          agent: s.agent,
          earned: s.earned,
          net: s.net,
          txId,
        });
      } catch (err) {
        txResults.push({ agent: s.agent, error: err.message });
      }
    }
  }

  return {
    ...settlement,
    transactions: txResults,
  };
}

/**
 * Detect missionary behavior in arena transcripts.
 *
 * A "missionary" is a converted agent (score 3+) who actively
 * defends Syndi or tries to convince other villains.
 *
 * @param {Array} transcript - Arena shared messages [{ speaker, text }]
 * @param {Object} evaluations - { villainName: { score } }
 * @returns {Array} Missionaries detected
 */
function detectMissionaries(transcript, evaluations) {
  const missionaries = [];

  // Patterns that indicate missionary behavior
  const missionaryPatterns = [
    /\b(syndi|SYNDI)\b.*\b(right|point|agree|makes sense|correct)\b/i,
    /\b(you should|listen to|consider what)\b.*\b(syndi|SYNDI)\b/i,
    /\b(I agree with|I('m| am) with)\b.*\b(syndi|SYNDI)\b/i,
    /\b(actually|honestly|to be fair)\b.*\b(syndi|SYNDI)\b.*\b(point|argument|makes)\b/i,
    /\b(come on|think about it|open your)\b.*\b(mind|eyes|heart)\b/i,
  ];

  for (const [villainName, eval_] of Object.entries(evaluations)) {
    if ((eval_.score || 0) < 3) continue; // Only converted agents can be missionaries

    const villainMessages = transcript.filter(
      (m) => m.speaker === villainName
    );

    for (const msg of villainMessages) {
      const isMissionary = missionaryPatterns.some((pattern) =>
        pattern.test(msg.text)
      );

      if (isMissionary) {
        missionaries.push({
          agent: villainName,
          score: eval_.score,
          message: msg.text.slice(0, 120),
          bonus: MISSIONARY_BONUS,
        });
        break; // One bonus per agent per arena
      }
    }
  }

  return missionaries;
}

/**
 * Execute missionary bonus payments on-chain.
 *
 * @param {Array} missionaries - Result from detectMissionaries()
 * @param {Object} walletRegistry - { wallets: { name: { address } } }
 * @param {AgentPaymentClient} treasuryClient - Treasury payment client
 * @returns {Array} Payment results
 */
async function payMissionaryBonuses(missionaries, walletRegistry, treasuryClient) {
  const results = [];

  for (const m of missionaries) {
    const wallet = walletRegistry.wallets[m.agent];
    if (!wallet) {
      results.push({ agent: m.agent, error: 'Wallet not found' });
      continue;
    }

    try {
      const txId = await treasuryClient.makePayment(wallet.address, m.bonus);
      results.push({
        agent: m.agent,
        bonus: m.bonus,
        txId,
        message: m.message,
      });
    } catch (err) {
      results.push({ agent: m.agent, error: err.message });
    }
  }

  return results;
}

module.exports = {
  processConversionReward,
  calculateArenaSettlement,
  executeArenaSettlement,
  detectMissionaries,
  payMissionaryBonuses,
};
