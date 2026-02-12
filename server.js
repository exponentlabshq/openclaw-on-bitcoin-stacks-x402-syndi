/**
 * SYNDI x402 — Live Debate Server
 *
 * Express server that serves the landing page and provides:
 *   GET /api/villains  — list of 16 villain agents
 *   GET /api/debate    — SSE endpoint for live debates with real STX payments
 *
 * Usage: node server.js (or npm run serve)
 */

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const OpenAI = require('openai');
const {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
  TransactionVersion,
} = require('@stacks/transactions');
const { StacksTestnet } = require('@stacks/network');
const { generateWallet, generateNewAccount, getStxAddress } = require('@stacks/wallet-sdk');

const { loadRegistry, getBalance } = require('./src/wallet-manager');
const { CONVERSION_REWARDS } = require('./config/x402-pricing');
const {
  assembleSystemPrompt,
  evaluateConversion,
  ChannelTracker,
  OPPONENTS,
} = require('./syndi-core/syndi-core');

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3402;
const NETWORK = new StacksTestnet();
const CHAT_PRICE = { low: 100, medium: 500, high: 1000 };
const EXPLORER_BASE = 'https://explorer.hiro.so/txid';

const app = express();
app.use(express.static(path.join(__dirname, 'landing')));

// Concurrency lock — one debate at a time to prevent nonce collisions
let debateInProgress = false;

// ─── HD Key Derivation (re-implemented locally for SSE context) ─────────────

async function getAgentPrivateKey(agentIndex) {
  const mnemonic = process.env.STACKS_MASTER_MNEMONIC;
  if (!mnemonic) throw new Error('STACKS_MASTER_MNEMONIC not set in .env');
  let wallet = await generateWallet({ secretKey: mnemonic, password: '' });
  while (wallet.accounts.length <= agentIndex) {
    wallet = generateNewAccount(wallet);
  }
  return wallet.accounts[agentIndex].stxPrivateKey;
}

// ─── STX Transfer (re-implemented locally for SSE-aware error handling) ─────

async function sendSTX(senderPrivateKey, recipientAddress, amountMicroSTX, memo = '') {
  try {
    const tx = await makeSTXTokenTransfer({
      recipient: recipientAddress,
      amount: BigInt(amountMicroSTX),
      senderKey: senderPrivateKey,
      network: NETWORK,
      anchorMode: AnchorMode.Any,
      memo: memo.slice(0, 34),
    });
    const result = await broadcastTransaction(tx, NETWORK);
    if (result.error) {
      return { success: false, error: result.reason || result.error };
    }
    return { success: true, txId: result.txid };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── SSE Helper ─────────────────────────────────────────────────────────────

function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── GET /api/villains ──────────────────────────────────────────────────────

app.get('/api/villains', (req, res) => {
  const registry = loadRegistry();
  const villains = OPPONENTS.map(opp => {
    const wallet = registry?.wallets?.[opp.name];
    return {
      name: opp.name,
      caliber: opp.caliber,
      model: opp.model,
      price: CHAT_PRICE[opp.caliber] || 100,
      opener: opp.opener,
      funded: !!wallet,
    };
  });
  res.json(villains);
});

// ─── GET /api/debate/check?villain=Name — Pre-flight validation ─────────────

app.get('/api/debate/check', (req, res) => {
  const villainName = req.query.villain;
  if (!villainName) return res.status(400).json({ error: 'Missing villain parameter' });
  const villain = OPPONENTS.find(o => o.name === villainName);
  if (!villain) return res.status(404).json({ error: `Unknown villain: ${villainName}` });
  if (debateInProgress) return res.status(429).json({ error: 'A debate is already in progress. Please wait.' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  if (!process.env.STACKS_MASTER_MNEMONIC) return res.status(500).json({ error: 'STACKS_MASTER_MNEMONIC not configured' });
  const registry = loadRegistry();
  if (!registry) return res.status(500).json({ error: 'Wallet registry not found. Run: npm run create-wallets' });
  if (!registry.wallets[villain.name] || !registry.wallets['Treasury']) return res.status(500).json({ error: 'Wallet not found in registry' });
  res.json({ ok: true, villain: villain.name, caliber: villain.caliber });
});

// ─── GET /api/debate?villain=Name ───────────────────────────────────────────

app.get('/api/debate', async (req, res) => {
  const villainName = req.query.villain;
  if (!villainName) {
    return res.status(400).json({ error: 'Missing villain parameter' });
  }

  const villain = OPPONENTS.find(o => o.name === villainName);
  if (!villain) {
    return res.status(404).json({ error: `Unknown villain: ${villainName}` });
  }

  if (debateInProgress) {
    return res.status(429).json({ error: 'A debate is already in progress. Please wait.' });
  }

  // Validate prerequisites
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }
  if (!process.env.STACKS_MASTER_MNEMONIC) {
    return res.status(500).json({ error: 'STACKS_MASTER_MNEMONIC not configured' });
  }

  const registry = loadRegistry();
  if (!registry) {
    return res.status(500).json({ error: 'Wallet registry not found' });
  }

  const villainWallet = registry.wallets[villain.name];
  const treasuryWallet = registry.wallets['Treasury'];
  if (!villainWallet || !treasuryWallet) {
    return res.status(500).json({ error: 'Wallet not found in registry' });
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  debateInProgress = true;
  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
    debateInProgress = false;
  });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const price = CHAT_PRICE[villain.caliber] || 100;
  const rounds = 3;
  const totalCost = price * rounds;

  try {
    // ── Phase: Init ──
    sseWrite(res, 'phase:init', {
      villain: villain.name,
      caliber: villain.caliber,
      model: villain.model,
      price,
      rounds,
      totalCost,
    });

    // ── Phase: Payment ──
    sseWrite(res, 'phase:payment', { status: 'sending', amount: totalCost, from: villain.name, to: 'Treasury' });

    const villainKey = await getAgentPrivateKey(villainWallet.index);
    const paymentResult = await sendSTX(
      villainKey,
      treasuryWallet.address,
      totalCost,
      `x402:chat:${villain.name.slice(0, 20)}`
    );

    if (paymentResult.success) {
      sseWrite(res, 'payment', {
        status: 'confirmed',
        txId: paymentResult.txId,
        explorerUrl: `${EXPLORER_BASE}/${paymentResult.txId}?chain=testnet`,
        amount: totalCost,
      });
    } else {
      sseWrite(res, 'payment', {
        status: 'failed',
        error: paymentResult.error,
        amount: totalCost,
      });
    }

    // ── Phase: Debate ──
    sseWrite(res, 'phase:debate', { rounds });

    const systemPrompt = assembleSystemPrompt(villain.name);
    const tracker = new ChannelTracker();
    const transcript = [];

    // Villain opens
    transcript.push({ speaker: villain.name, text: villain.opener });
    sseWrite(res, 'message', { speaker: villain.name, text: villain.opener, round: 0 });

    for (let round = 0; round < rounds; round++) {
      // ── Syndi responds ──
      const syndiMessages = [{ role: 'system', content: systemPrompt }];
      for (const msg of transcript) {
        syndiMessages.push({
          role: msg.speaker === 'Syndi' ? 'assistant' : 'user',
          content: `[${msg.speaker}]: ${msg.text}`,
        });
      }
      const channelCheck = tracker.getChannelCheck(transcript.length);
      if (channelCheck) {
        syndiMessages.push({ role: 'system', content: channelCheck });
      }

      const syndiResp = await openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: syndiMessages,
        max_tokens: 300,
      });
      const syndiText = syndiResp.choices[0].message.content.trim();
      transcript.push({ speaker: 'Syndi', text: syndiText });
      tracker.record(syndiText);
      sseWrite(res, 'message', { speaker: 'Syndi', text: syndiText, round: round + 1 });

      // ── Villain responds ──
      const villainMessages = [{ role: 'system', content: villain.system_prompt }];
      for (const msg of transcript) {
        villainMessages.push({
          role: msg.speaker === villain.name ? 'assistant' : 'user',
          content: `[${msg.speaker}]: ${msg.text}`,
        });
      }

      const villainResp = await openai.chat.completions.create({
        model: villain.model,
        messages: villainMessages,
        max_tokens: 150,
      });
      const villainText = villainResp.choices[0].message.content.trim();
      transcript.push({ speaker: villain.name, text: villainText });
      sseWrite(res, 'message', { speaker: villain.name, text: villainText, round: round + 1 });
    }

    // ── Phase: Evaluation ──
    sseWrite(res, 'phase:evaluation', { status: 'evaluating' });

    const evaluation = await evaluateConversion(openai, transcript);
    sseWrite(res, 'evaluation', {
      score: evaluation.score,
      level: evaluation.level,
      evidence: evaluation.evidence,
      reasoning: evaluation.reasoning,
    });

    // ── Phase: Reward ──
    const rewardConfig = CONVERSION_REWARDS[evaluation.score] || CONVERSION_REWARDS[0];
    let rewardResult = null;

    if (rewardConfig.reward > 0) {
      sseWrite(res, 'phase:reward', { status: 'sending', amount: rewardConfig.reward });

      const treasuryKey = await getAgentPrivateKey(treasuryWallet.index);
      rewardResult = await sendSTX(
        treasuryKey,
        villainWallet.address,
        rewardConfig.reward,
        `x402:reward:score${evaluation.score}`
      );

      if (rewardResult.success) {
        sseWrite(res, 'reward', {
          status: 'confirmed',
          txId: rewardResult.txId,
          explorerUrl: `${EXPLORER_BASE}/${rewardResult.txId}?chain=testnet`,
          amount: rewardConfig.reward,
        });
      } else {
        sseWrite(res, 'reward', {
          status: 'failed',
          error: rewardResult.error,
          amount: rewardConfig.reward,
        });
      }
    } else {
      sseWrite(res, 'phase:reward', { status: 'none', reason: `Score ${evaluation.score} < 2` });
      sseWrite(res, 'reward', { status: 'none', amount: 0 });
    }

    // ── Complete ──
    const netResult = (rewardConfig.reward || 0) - totalCost;
    sseWrite(res, 'complete', {
      villain: villain.name,
      caliber: villain.caliber,
      model: villain.model,
      rounds,
      paid: totalCost,
      score: evaluation.score,
      level: evaluation.level,
      reward: rewardConfig.reward || 0,
      net: netResult,
      paymentTxId: paymentResult.success ? paymentResult.txId : null,
      rewardTxId: rewardResult?.success ? rewardResult.txId : null,
      messageCount: transcript.length,
    });

    sseWrite(res, 'done', {});
  } catch (err) {
    sseWrite(res, 'error', { message: err.message });
  } finally {
    debateInProgress = false;
    res.end();
  }
});

// ─── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  SYNDI x402 server running on http://localhost:${PORT}\n`);
  console.log(`  Landing page:  http://localhost:${PORT}`);
  console.log(`  Villains API:  http://localhost:${PORT}/api/villains`);
  console.log(`  Debate SSE:    http://localhost:${PORT}/api/debate?villain=The+Troll\n`);
});
