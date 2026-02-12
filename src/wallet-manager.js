/**
 * Wallet Manager — HD wallet creation and management for Syndi agents.
 *
 * Uses a single master mnemonic to derive wallets for:
 *   Index 0: Syndi
 *   Index 1: Treasury
 *   Index 2–17: 16 villain agents (in OPPONENTS order)
 *
 * CLI usage:
 *   node wallet-manager.js create    — generate wallets and save registry
 *   node wallet-manager.js balances  — check all wallet balances
 *   node wallet-manager.js fund      — request testnet STX from faucet
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REGISTRY_PATH = path.join(__dirname, '..', 'wallet-registry.json');
const STACKS_API_BASE = process.env.STACKS_API_URL || 'https://api.testnet.hiro.so';

// Agent index assignments
const AGENT_INDICES = {
  Syndi: 0,
  Treasury: 1,
  // Villains start at index 2, in OPPONENTS array order
};

/**
 * Dynamically load OPPONENTS from syndi-core.
 */
function getOpponents() {
  try {
    const syndiCore = require('../syndi-core/syndi-core');
    return syndiCore.OPPONENTS;
  } catch {
    console.warn('Could not load OPPONENTS from syndi-core, using placeholder names.');
    return [
      { name: 'The Troll', caliber: 'low' },
      { name: 'The AI-cels', caliber: 'low' },
      { name: 'The Penguin', caliber: 'low' },
      { name: 'The Drug Lord', caliber: 'low' },
      { name: 'The Extrovert', caliber: 'low' },
      { name: 'The Know It All', caliber: 'medium' },
      { name: 'The False Profit', caliber: 'medium' },
      { name: 'The Bitcoiner', caliber: 'medium' },
      { name: 'The Thankless', caliber: 'medium' },
      { name: 'The Nostradamus', caliber: 'medium' },
      { name: 'What Are They Doing Here?', caliber: 'medium' },
      { name: "So You Think YOU'VE Got It Bad", caliber: 'medium' },
      { name: 'The Ascot-Wearer', caliber: 'high' },
      { name: 'The Scientist', caliber: 'high' },
      { name: 'The Professor', caliber: 'high' },
      { name: 'The Sage On The Stage', caliber: 'high' },
    ];
  }
}

// ─── Wallet Creation ────────────────────────────────────────────────────────

/**
 * Create all agent wallets from a master mnemonic using HD derivation.
 * Each agent gets a unique account derived from the same seed.
 */
async function createAllWallets(masterMnemonic) {
  const { generateWallet, generateNewAccount, getStxAddress } = require('@stacks/wallet-sdk');
  const { TransactionVersion } = require('@stacks/transactions');

  const isTestnet = (process.env.STACKS_NETWORK || 'testnet') === 'testnet';
  const txVersion = isTestnet
    ? TransactionVersion.Testnet
    : TransactionVersion.Mainnet;

  // Generate wallet with enough accounts for all agents
  const opponents = getOpponents();
  const totalAccounts = 2 + opponents.length; // Syndi + Treasury + villains

  let wallet = await generateWallet({
    secretKey: masterMnemonic,
    password: '',
  });

  // Derive additional accounts (generateNewAccount returns a new wallet object)
  while (wallet.accounts.length < totalAccounts) {
    wallet = generateNewAccount(wallet);
  }

  const registry = {
    network: isTestnet ? 'testnet' : 'mainnet',
    generated: new Date().toISOString(),
    wallets: {},
  };

  // Syndi (index 0)
  registry.wallets['Syndi'] = {
    address: getStxAddress({ account: wallet.accounts[0], transactionVersion: txVersion }),
    index: 0,
    role: 'persuader',
    caliber: 'high',
  };

  // Treasury (index 1)
  registry.wallets['Treasury'] = {
    address: getStxAddress({ account: wallet.accounts[1], transactionVersion: txVersion }),
    index: 1,
    role: 'treasury',
    caliber: null,
  };

  // Villains (index 2+)
  opponents.forEach((opp, i) => {
    const accountIndex = i + 2;
    registry.wallets[opp.name] = {
      address: getStxAddress({ account: wallet.accounts[accountIndex], transactionVersion: txVersion }),
      index: accountIndex,
      role: 'villain',
      caliber: opp.caliber || 'low',
    };
  });

  return registry;
}

/**
 * Generate a new random 24-word mnemonic.
 */
function generateMnemonic() {
  const { generateSecretKey } = require('@stacks/wallet-sdk');
  return generateSecretKey(256);
}

// ─── Registry Persistence ───────────────────────────────────────────────────

function saveRegistry(registry) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log(`Wallet registry saved to ${REGISTRY_PATH}`);
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
}

// ─── Balance Checking ───────────────────────────────────────────────────────

async function getBalance(address) {
  const response = await fetch(
    `${STACKS_API_BASE}/extended/v1/address/${address}/balances`
  );
  if (!response.ok) {
    throw new Error(`Balance check failed for ${address}: ${response.statusText}`);
  }
  const data = await response.json();
  return {
    stx: parseInt(data.stx.balance) / 1_000_000,
    locked: parseInt(data.stx.locked) / 1_000_000,
  };
}

async function checkAllBalances(registry) {
  console.log('\nAgent Balances:');
  console.log('─'.repeat(60));
  for (const [name, info] of Object.entries(registry.wallets)) {
    try {
      const bal = await getBalance(info.address);
      console.log(
        `  ${name.padEnd(30)} ${info.address.slice(0, 12)}...  ${bal.stx.toFixed(6)} STX`
      );
    } catch (e) {
      console.log(`  ${name.padEnd(30)} ${info.address.slice(0, 12)}...  ERROR: ${e.message}`);
    }
  }
  console.log('─'.repeat(60));
}

// ─── Testnet Faucet ─────────────────────────────────────────────────────────

async function fundFromFaucet(address) {
  const url = `${STACKS_API_BASE}/extended/v1/faucets/stx?address=${address}&stacking=false`;
  const response = await fetch(url, { method: 'POST' });

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after') || '60';
    throw new Error(`Rate limited — retry after ${retryAfter}s`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Faucet request failed (${response.status}): ${text}`);
  }

  const result = await response.json();
  return result;
}

async function fundAllWallets(registry, onlyNames = null) {
  const entries = Object.entries(registry.wallets)
    .filter(([name]) => !onlyNames || onlyNames.includes(name));

  console.log(`\nFunding ${entries.length} wallets from testnet faucet...`);
  console.log('(Faucet has rate limits — using 60s delay between requests)\n');

  for (let i = 0; i < entries.length; i++) {
    const [name, info] = entries[i];
    try {
      const result = await fundFromFaucet(info.address);
      const txId = result.txId || result.txid || result.tx_id || 'submitted';
      console.log(`  [${i + 1}/${entries.length}] Funded ${name}: tx ${txId}`);
    } catch (e) {
      console.log(`  [${i + 1}/${entries.length}] ${name}: ${e.message}`);
    }
    // Respect faucet rate limits (60s between requests)
    if (i < entries.length - 1) {
      console.log('  Waiting 60s for rate limit...');
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  createAllWallets,
  generateMnemonic,
  saveRegistry,
  loadRegistry,
  getBalance,
  checkAllBalances,
  fundFromFaucet,
  fundAllWallets,
  getOpponents,
  REGISTRY_PATH,
};

// ─── CLI ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    switch (command) {
      case 'create': {
        let mnemonic = process.env.STACKS_MASTER_MNEMONIC;
        if (!mnemonic) {
          mnemonic = generateMnemonic();
          console.log('\nGenerated master mnemonic (save this securely):');
          console.log(`  ${mnemonic}\n`);
          console.log('Add to your .env as STACKS_MASTER_MNEMONIC\n');
        }

        console.log('Deriving agent wallets...\n');
        const registry = await createAllWallets(mnemonic);

        console.log(`Network: ${registry.network}`);
        console.log(`Total wallets: ${Object.keys(registry.wallets).length}\n`);

        for (const [name, info] of Object.entries(registry.wallets)) {
          console.log(`  [${info.index}] ${name.padEnd(30)} ${info.address}`);
        }

        saveRegistry(registry);
        console.log('\nDone. Next steps:');
        console.log('  1. Save the mnemonic in your .env');
        console.log('  2. Run: npm run fund-wallets');
        console.log('  3. Run: npm run check-balances');
        break;
      }

      case 'balances': {
        const registry = loadRegistry();
        if (!registry) {
          console.error('No wallet registry found. Run: npm run create-wallets');
          process.exit(1);
        }
        await checkAllBalances(registry);
        break;
      }

      case 'fund': {
        const registry = loadRegistry();
        if (!registry) {
          console.error('No wallet registry found. Run: npm run create-wallets');
          process.exit(1);
        }
        if (registry.network !== 'testnet') {
          console.error('Faucet only works on testnet.');
          process.exit(1);
        }
        // Optional: specify wallet names as extra args
        const names = process.argv.slice(3);
        await fundAllWallets(registry, names.length > 0 ? names : null);
        break;
      }

      default:
        console.log('Usage: node wallet-manager.js <create|balances|fund>');
        process.exit(1);
    }
  })().catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}
