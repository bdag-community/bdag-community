export type FaucetClaim = {address:string;id:string;token:string};
export function validateFaucetClaim(input: unknown): FaucetClaim | null {
 if(!input||typeof input!=="object")return null;
 const v=input as Record<string,unknown>;
 if(Object.keys(v).some(k=>!["address","id","token"].includes(k)))return null;
 if(typeof v.address!=="string"||!/^0x[0-9a-fA-F]{40}$/.test(v.address)||/^0x0{40}$/.test(v.address))return null;
 if(typeof v.id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.id))return null;
 if(typeof v.token!=="string"||!v.token||v.token.length>2048)return null;
 return {address:v.address,id:v.id,token:v.token};
}
export function faucetPublicStatus(v:Record<string,unknown>){
 return {id:typeof v.id==="string"?v.id:null,status:typeof v.status==="string"?v.status:"unknown",transactionHash:typeof v.transactionHash==="string"?v.transactionHash:null,blockNumber:typeof v.blockNumber==="number"?v.blockNumber:null};
}

/** Reject oversized requests before buffering the complete body. */
export async function readFaucetBody(request:Request):Promise<string>{
 const reader=request.body?.getReader();if(!reader)return "";
 const chunks:Uint8Array[]=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();throw Error("Request too large");}chunks.push(value);}
 const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 return new TextDecoder().decode(data);
}
