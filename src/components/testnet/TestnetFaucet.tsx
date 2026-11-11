"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/Button";
import {TurnstileWidget} from "@/components/security/TurnstileWidget";

type Claim={id:string;address:string;status:string;transactionHash?:string|null};
type Info={contract:string;remainingToday:string;reserve:string;paused:boolean;nextClaimAt:number|null;eligible:boolean};
const STORAGE="bdag-testnet-faucet-request";
function remember(claim:Claim){try{localStorage.setItem(STORAGE,JSON.stringify(claim));}catch{/* The server still deduplicates the current in-memory request ID. */}}
export function TestnetFaucet(){
 const [address,setAddress]=useState(""),[verified,setVerified]=useState(false),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[claim,setClaim]=useState<Claim|null>(null),[info,setInfo]=useState<Info|null>(null),[infoState,setInfoState]=useState<"loading"|"ready"|"error">("loading");
 const form=useRef<HTMLFormElement>(null),inFlight=useRef(false),infoSequence=useRef(0);
 const loadInfo=useCallback(async(wallet?:string)=>{const sequence=++infoSequence.current;try{const r=await fetch(`/api/testnet/faucet${wallet?`?address=${wallet}`:""}`,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();const data=await r.json();if(sequence!==infoSequence.current)return;setInfo(data);setInfoState("ready");}catch{if(sequence!==infoSequence.current)return;setInfo(null);setInfoState("error");}},[]);
 useEffect(()=>{queueMicrotask(()=>{let wallet:string|undefined;try{const stored=JSON.parse(localStorage.getItem(STORAGE)??"null");if(stored&&/^[a-f0-9-]{36}$/.test(stored.id)&&/^0x[0-9a-fA-F]{40}$/.test(stored.address)){setClaim(stored);setAddress(stored.address);wallet=stored.address;}}catch{/* Ignore corrupted browser metadata. */}if(!wallet)void loadInfo();});},[loadInfo]);
 useEffect(()=>{if(!/^0x[0-9a-fA-F]{40}$/.test(address))return;const timer=setTimeout(()=>void loadInfo(address),350);return()=>clearTimeout(timer);},[address,loadInfo]);
 useEffect(()=>{
  if(!claim||["confirmed","failed"].includes(claim.status))return;
  const poll=async()=>{try{const r=await fetch(`/api/testnet/faucet?id=${claim.id}`,{signal:AbortSignal.timeout(8000)});if(!r.ok)return;const data=await r.json();if(data.status==="unknown")return;const next={...claim,...data};if(data.status!==claim.status||data.transactionHash!==claim.transactionHash)setClaim(next);remember(next);if(data.status==="confirmed"){setMessage("1,000 test BDAG confirmed. You can now try the platforms below.");void loadInfo(claim.address);}}catch{/* Retain the same request when a connection drops. */}};
  void poll();const timer=setInterval(poll,10000);return()=>clearInterval(timer);
 },[claim,loadInfo]); // A request ID stays stable across retries and reloads.
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(inFlight.current||!verified||infoState!=="ready"||!info?.eligible)return;
  inFlight.current=true;setBusy(true);setMessage("");
  const previous=claim&&claim.address.toLowerCase()===address.toLowerCase()&&!['confirmed','failed'].includes(claim.status)?claim:null;
  const id=previous?.id??crypto.randomUUID(),pointer={id,address,status:"checking"};
  remember(pointer);setClaim(pointer);
  try{
   const token=String(new FormData(event.currentTarget).get("cf-turnstile-response")??"");
   const r=await fetch("/api/testnet/faucet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,address,token}),signal:AbortSignal.timeout(16000)});const data=await r.json();
   if(!r.ok)throw Error(data.error??"The request could not be confirmed. Try again with the same wallet.");
   const next={...pointer,...data};setClaim(next);remember(next);setMessage("Request received. Waiting for 64 chain confirmations. You can leave this page open.");
  }catch(error){setMessage(error instanceof Error?error.message:"Connection interrupted. Retry this request.");}
  finally{inFlight.current=false;setBusy(false);setVerified(false);setAttempt(n=>n+1);}
 }
 const pending=claim&&["queued","signed","broadcast"].includes(claim.status);
 return <div className="min-w-0">
  <div className="mb-6 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-teal-soft/25 px-3 py-1 text-teal-soft">1,000 test BDAG</span><span className="rounded-full border border-border px-3 py-1 text-on-surface-variant">Once per wallet every 24 hours</span></div>
  <form ref={form} onSubmit={submit} className="space-y-5">
   <div><label htmlFor="faucet-wallet" className="mb-2 block text-sm font-medium">Your Testnet wallet address</label><input id="faucet-wallet" name="address" type="text" value={address} onChange={e=>{infoSequence.current++;setAddress(e.target.value.trim());setInfoState("loading");}} required pattern="0x[0-9a-fA-F]{40}" maxLength={42} autoComplete="off" spellCheck={false} readOnly={Boolean(pending)||busy} placeholder="0x…" className="focus-ring w-full min-w-0 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm"/><p className="mt-2 text-xs text-on-surface-variant">Public address only. No wallet signature, gas, seed phrase or private key needed.</p></div>
   <TurnstileWidget action="testnet_faucet" attempt={attempt} id="faucet-verification" onVerifiedChange={setVerified}/>
   <Button type="submit" disabled={!verified||busy||Boolean(pending)||!info?.eligible||infoState!=="ready"}>{busy?"Requesting…":pending?"Waiting for confirmations…":infoState==="ready"&&!info?.eligible?"Allowance unavailable":"Get test BDAG"}</Button>
   {infoState==="loading"&&<p role="status" className="text-sm text-on-surface-variant">Checking faucet availability…</p>}{infoState==="error"&&<p className="text-sm text-on-surface-variant">Faucet is temporarily unavailable. Refresh shortly to check again.</p>}
   <p role="status" aria-live="polite" className="text-sm leading-relaxed text-on-surface">{message|| (claim?.status==="confirmed"?"Your test BDAG request is confirmed.":"")}</p>
   {claim?.transactionHash&&<p className="break-all font-mono text-xs text-on-surface-variant">Transaction: {claim.transactionHash}</p>}
   {info?.nextClaimAt?<p className="text-sm text-teal-soft">Next allowance: {new Date(info.nextClaimAt*1000).toLocaleString()}</p>:null}
  </form>
  <p className="mt-5 border-t border-border/60 pt-4 text-xs leading-relaxed text-on-surface-variant">Funded by the X30 Testnet mining pool. The faucet has a total allowance of 100,000 test BDAG per UTC day. Test BDAG has no monetary value.</p>
  {info?.contract&&<details className="mt-3"><summary className="focus-ring cursor-pointer text-xs text-accent-soft">Faucet contract · chain 1043</summary><p className="mt-2 break-all font-mono text-xs text-on-surface-variant">{info.contract}</p></details>}
 </div>;
}
