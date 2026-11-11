import {createHmac} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {validateFaucetClaim,faucetPublicStatus,readFaucetBody} from "@/lib/testnet-faucet";
export const dynamic="force-dynamic";
const BASE="https://testnet-api.bdag.co/faucet";
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function forward(path:string,init?:RequestInit){
 const key=process.env.TESTNET_FAUCET_SERVICE_KEY;
 if(!key||key.length<32)throw Error("Faucet unavailable");
 return fetch(BASE+path,{...init,headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},cache:"no-store",signal:AbortSignal.timeout(12000)});
}
export async function GET(request:NextRequest){
 try{
  const id=request.nextUrl.searchParams.get("id"),address=request.nextUrl.searchParams.get("address");
  if(id&&!/^[a-f0-9-]{36}$/.test(id))return reply({error:"Invalid request"},400);
  if(address&&!/^0x[0-9a-fA-F]{40}$/.test(address))return reply({error:"Invalid address"},400);
  const response=await forward(id?`/status/${id}`:`/info${address?`?address=${address}`:""}`);
  const data=await response.json();
  if(!response.ok)return reply({error:"Faucet temporarily unavailable. Please try again shortly."},503);
  if(id)return reply(faucetPublicStatus(data));
  return reply({chainId:data.chainId,contract:data.contract,amount:data.amount,cooldownSeconds:data.cooldownSeconds,dailyLimit:data.dailyLimit,reserve:data.reserve,remainingToday:data.remainingToday,paused:data.paused,nextClaimAt:data.nextClaimAt,eligible:data.eligible===true});
 }catch{return reply({error:"Faucet temporarily unavailable. Please try again shortly."},503);}
}
export async function POST(request:NextRequest){
 try{
  if(request.headers.get("origin")!=="https://bdag.community")return reply({error:"Origin not allowed"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"Invalid request"},415);
  let text:string;try{text=await readFaucetBody(request);}catch{return reply({error:"Request too large"},413);}
  const parsed=validateFaucetClaim(JSON.parse(text));if(!parsed)return reply({error:"Enter a valid Testnet wallet and complete verification."},400);
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),secret=process.env.ABUSE_HMAC_SECRET;
  if(!ip||!secret||secret.length<32)return reply({error:"Faucet temporarily unavailable"},503);
  const ipHash=createHmac("sha256",secret).update(`testnet-faucet:${ip}`).digest("hex");
  const response=await forward("/claim",{method:"POST",body:JSON.stringify({...parsed,ipHash})});const data=await response.json();
  if(!response.ok)return reply({error:typeof data.error==="string"?data.error:"Faucet temporarily unavailable",nextClaimAt:data.nextClaimAt??null},[400,409,429].includes(response.status)?response.status:503);
  return reply(faucetPublicStatus(data),response.status);
 }catch{return reply({error:"Request could not be confirmed. Keep this page open and retry the same request."},503);}
}
