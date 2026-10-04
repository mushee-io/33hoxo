import { assertHex, type Hex } from "../protocol/hex.js";
import type { ShutterEncryptionData } from "../protocol/types.js";

export type ShutterNetwork = "chiado" | "gnosis";
const NETWORKS:Record<ShutterNetwork,{baseUrl:string;apiAddress:string}>={
  chiado:{baseUrl:"https://shutter-api.chiado.staging.shutter.network/api",apiAddress:"0xd150bbf86C686de1a25820A94c2C2397e0bC54ab"},
  gnosis:{baseUrl:"https://shutter-api.shutter.network/api",apiAddress:"0x228DefCF37Da29475F0EE2B9E4dfAeDc3b0746bc"},
};

export type ShutterApiClientOptions={network?:ShutterNetwork;apiKey?:string;fetchImpl?:typeof fetch;timeoutMs?:number};
export type ShutterIdentityRegistration={eon:number;eon_key:Hex;identity:Hex;identity_prefix:Hex;epoch_id?:Hex;tx_hash?:Hex};
export type ShutterDecryptionKey={decryption_key:Hex;decryption_timestamp:number;identity:Hex};

export class ShutterApiError extends Error{
  constructor(readonly status:number|null,message:string,readonly retryable:boolean,readonly cause?:unknown){super(message);this.name="ShutterApiError";}
}

function normalizeHex(value:unknown,label:string):Hex{
  if(typeof value!=="string"||!value.trim())throw new Error(`${label} is missing from Shutter API response.`);
  const raw=value.trim();
  const prefixed=raw.startsWith("0x")?raw:`0x${raw}`;
  assertHex(prefixed,label);
  return prefixed;
}

export class ShutterApiClient{
  readonly network:ShutterNetwork;readonly baseUrl:string;readonly apiAddress:string;
  private readonly apiKey?:string;private readonly fetchImpl:typeof fetch;private readonly timeoutMs:number;

  constructor(options:ShutterApiClientOptions={}){
    this.network=options.network??"chiado";this.baseUrl=NETWORKS[this.network].baseUrl;this.apiAddress=NETWORKS[this.network].apiAddress;
    this.apiKey=options.apiKey;this.fetchImpl=options.fetchImpl??fetch;this.timeoutMs=options.timeoutMs??30_000;
  }

  private async request<T>(path:string,init?:RequestInit):Promise<T>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const headers=new Headers(init?.headers);headers.set("accept","application/json");if(init?.body)headers.set("content-type","application/json");
      if(this.apiKey)headers.set("authorization",`Bearer ${this.apiKey}`);
      let response:Response;
      try{response=await this.fetchImpl(`${this.baseUrl}${path}`,{...init,headers,signal:controller.signal});}
      catch(error){throw new ShutterApiError(null,controller.signal.aborted?"Shutter API request timed out.":"Shutter API network request failed.",true,error);}
      if(!response.ok){
        const body=await response.text().catch(()=>"");const retryable=response.status===408||response.status===429||response.status>=500;
        throw new ShutterApiError(response.status,`Shutter API request failed: ${response.status} ${response.statusText}${body?` — ${body}`:""}`,retryable);
      }
      return response.json() as Promise<T>;
    }finally{clearTimeout(timer);}
  }

  async registerTimeIdentity(input:{decryptionTimestamp:number;identityPrefix:Hex}):Promise<ShutterIdentityRegistration>{
    if(!Number.isInteger(input.decryptionTimestamp)||input.decryptionTimestamp<=0)throw new Error("decryptionTimestamp must be a positive Unix timestamp.");
    assertHex(input.identityPrefix,"identityPrefix");
    const raw=await this.request<Record<string,unknown>>("/time/register_identity",{method:"POST",body:JSON.stringify({decryptionTimestamp:input.decryptionTimestamp,identityPrefix:input.identityPrefix})});
    const normalized:ShutterIdentityRegistration={
      eon:Number(raw.eon),
      eon_key:normalizeHex(raw.eon_key,"eon_key"),
      identity:normalizeHex(raw.identity,"identity"),
      identity_prefix:normalizeHex(raw.identity_prefix,"identity_prefix"),
      ...(raw.epoch_id?{epoch_id:normalizeHex(raw.epoch_id,"epoch_id")}:{ }),
      ...(raw.tx_hash?{tx_hash:normalizeHex(raw.tx_hash,"tx_hash")}:{ }),
    };
    if(!Number.isInteger(normalized.eon)||normalized.eon<0)throw new Error("Shutter API returned an invalid eon.");
    if(normalized.identity_prefix.toLowerCase()!==input.identityPrefix.toLowerCase())throw new Error("Shutter API returned an unexpected identity prefix.");
    return normalized;
  }

  async getEncryptionData(identityPrefix:Hex):Promise<ShutterEncryptionData>{
    assertHex(identityPrefix,"identityPrefix");
    const query=new URLSearchParams({address:this.apiAddress,identityPrefix});
    const raw=await this.request<Record<string,unknown>>(`/time/get_data_for_encryption?${query.toString()}`);
    const prefix=normalizeHex(raw.identity_prefix,"identity_prefix");
    if(prefix.toLowerCase()!==identityPrefix.toLowerCase())throw new Error("Shutter API returned encryption data for a different identity prefix.");
    const eon=Number(raw.eon);
    if(!Number.isInteger(eon)||eon<0)throw new Error("Shutter API returned an invalid eon.");
    return{
      eon,
      eonKey:normalizeHex(raw.eon_key,"eon_key"),
      identity:normalizeHex(raw.identity,"identity"),
      identityPrefix:prefix,
      ...(raw.epoch_id?{epochId:normalizeHex(raw.epoch_id,"epoch_id")}:{ }),
    };
  }

  async getDecryptionKey(identity:Hex):Promise<ShutterDecryptionKey>{
    assertHex(identity,"identity");
    const query=new URLSearchParams({identity});
    const raw=await this.request<Record<string,unknown>>(`/time/get_decryption_key?${query.toString()}`);
    const returnedIdentity=normalizeHex(raw.identity,"identity");
    if(returnedIdentity.toLowerCase()!==identity.toLowerCase())throw new Error("Shutter API returned a decryption key for a different identity.");
    const timestamp=Number(raw.decryption_timestamp);
    if(!Number.isInteger(timestamp)||timestamp<0)throw new Error("Shutter API returned an invalid decryption timestamp.");
    return{
      decryption_key:normalizeHex(raw.decryption_key,"decryption_key"),
      decryption_timestamp:timestamp,
      identity:returnedIdentity,
    };
  }

  async checkAuthentication():Promise<unknown>{return this.request("/check_authentication");}
}
