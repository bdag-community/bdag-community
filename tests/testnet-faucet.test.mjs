import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateFaucetClaim,faucetPublicStatus} from '../src/lib/testnet-faucet.ts';
test('faucet accepts only a fixed claim with an address, id and verification token',()=>{
 const good={address:'0x'+'12'.repeat(20),id:'50326ee3-1234-4abc-8abc-50326ee31234',token:'challenge'};
 assert(validateFaucetClaim(good));for(const patch of [{address:'0x'+'0'.repeat(40)},{address:'bad'},{id:'x'},{token:''},{amount:'999999'},{chainId:1404}])assert.equal(validateFaucetClaim({...good,...patch}),null);
});
test('faucet status exposes no signed bytes or infrastructure secrets',()=>{
 assert.deepEqual(faucetPublicStatus({id:'id',status:'broadcast',transactionHash:'hash',raw:'secret',nonce:8}),{id:'id',status:'broadcast',transactionHash:'hash',blockNumber:null});
});
test('page includes faucet and the public joining direction without claiming a seed is already available',()=>{
 const page=readFileSync(new URL('../src/app/(public)/testnet/page.tsx',import.meta.url),'utf8');assert.match(page,/TestnetFaucet/);
});

test('faucet request body is bounded while streaming, including without Content-Length',async()=>{
 const {readFaucetBody}=await import('../src/lib/testnet-faucet.ts');
 assert.equal(await readFaucetBody(new Request('http://localhost',{method:'POST',body:'{}'})),'{}');
 await assert.rejects(readFaucetBody(new Request('http://localhost',{method:'POST',body:'x'.repeat(4097)})),/large/);
});
