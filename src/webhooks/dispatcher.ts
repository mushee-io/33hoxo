export type WebhookEventName = "intent.sealed"|"intent.revealable"|"intent.revealed"|"intent.verified"|"intent.executed"|"intent.failed";
export type WebhookEvent<T=unknown> = { id:string; type:WebhookEventName; createdAt:number; data:T };

function bytes(value:string):Uint8Array { return new TextEncoder().encode(value); }
async function hmacSha256(secret:string,payload:string):Promise<string> {
  const secretBytes=bytes(secret), dataBytes=bytes(payload);
  const key=await crypto.subtle.importKey("raw",secretBytes.buffer.slice(secretBytes.byteOffset,secretBytes.byteOffset+secretBytes.byteLength) as ArrayBuffer,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,dataBytes.buffer.slice(dataBytes.byteOffset,dataBytes.byteOffset+dataBytes.byteLength) as ArrayBuffer);
  return Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,"0")).join("");
}

export class WebhookDispatcher {
  constructor(private readonly fetchImpl:typeof fetch=fetch) {}
  async deliver<T>(url:string,secret:string,event:WebhookEvent<T>):Promise<void> {
    const payload=JSON.stringify(event), signature=await hmacSha256(secret,payload);
    const response=await this.fetchImpl(url,{method:"POST",headers:{"content-type":"application/json","x-33hoxo-event":event.type,"x-33hoxo-signature":`sha256=${signature}`},body:payload});
    if (!response.ok) throw new Error(`Webhook delivery failed with HTTP ${response.status}.`);
  }
}
