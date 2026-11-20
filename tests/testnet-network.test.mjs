import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Testnet is a separate discoverable page without changing primary navigation or Mainnet identity', async () => {
  assert(existsSync(new URL('../src/app/(public)/testnet/page.tsx', import.meta.url)));
  const { CHAIN, NAV_LINKS, TESTNET } = await import('../src/lib/content/site.ts');
  assert.equal(CHAIN.chainId, 1404);
  assert(!NAV_LINKS.some(link => link.href === '/testnet'));
  assert.equal(TESTNET.network.chainId, 1043);
  assert.equal(TESTNET.network.chainIdHex, '0x413');
  assert.equal(TESTNET.network.rpcUrl, 'https://testnet-staking.bdag.co/rpc');
  assert.equal(TESTNET.network.fallbackRpcUrl, 'https://testnet-api.bdag.co/rpc');
  assert.equal(TESTNET.network.evmGenesis, '0x58d97c1c16a3ff988105c2bd101b2f473103cc2ef7106ade3296647de65a1663');
  assert.equal(TESTNET.network.currency.symbol, 'BDAG');
  for (const path of ['../src/app/(public)/staking/page.tsx', '../src/app/(public)/community/page.tsx', '../src/components/site/Footer.tsx', '../src/app/sitemap.ts']) assert.match(read(path), /testnet|TESTNET/, path);
});

test('Wallet setup requests network metadata only, never an account, signature, transfer or Mainnet explorer', async () => {
  const { TESTNET } = await import('../src/lib/content/site.ts');
  const { requestTestnetNetwork } = await import('../src/lib/testnet-wallet.ts');
  const calls = [];
  await requestTestnetNetwork({ request: async value => { calls.push(value); return null; } }, TESTNET.network);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'wallet_addEthereumChain');
  assert.deepEqual(calls[0].params[0], { chainId: '0x413', chainName: 'BDAG Community Testnet', nativeCurrency: { name: 'Test BDAG', symbol: 'BDAG', decimals: 18 }, rpcUrls: [TESTNET.network.rpcUrl, TESTNET.network.fallbackRpcUrl] });
  assert(!('blockExplorerUrls' in calls[0].params[0]));
  await assert.rejects(requestTestnetNetwork(undefined, TESTNET.network), /MetaMask|wallet/i);
  await assert.rejects(requestTestnetNetwork({ request: async () => { throw { code: 4001 }; } }, TESTNET.network), /cancelled/i);
});

test('Testnet copy keeps funds/tester access separate and does not expose private node admission details', async () => {
  const { TESTNET } = await import('../src/lib/content/site.ts');
  const copy = JSON.stringify(TESTNET);
  assert.match(copy, /no monetary value/i);
  assert.match(copy, /ZeroTier/);
  assert.match(copy, /without ZeroTier or individual peer approval/i);
  assert.match(copy, /same network/i);
  assert.match(copy, /no dedicated Testnet explorer/i);
  assert.doesNotMatch(copy, /cf719fd540ebe8e1|10\.151\.116\.|10\.90\.67\.|654321/);
  assert.equal(TESTNET.operators.publicSeed, '/ip4/154.70.222.46/tcp/18160/p2p/16Uiu2HAmD78L3GVeqrXN4M2nk9fRmYZxrNC9vddWY5W2mbpSir2Z');
  assert.deepEqual([...new Set(copy.match(/16Uiu2[A-Za-z0-9]+/g))], ['16Uiu2HAmD78L3GVeqrXN4M2nk9fRmYZxrNC9vddWY5W2mbpSir2Z']);
  assert.doesNotMatch(copy, /explorer\.blockdag\.engineering|legacy-rehearsal|106043/);
});
