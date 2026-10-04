import type { ConfidentialIntentGateway } from "../gateway/service.js";
import type { ConfidentialEnvelopeV1 } from "../protocol/types.js";
import { assertHex } from "../protocol/hex.js";

export type GatewayApiRequest = { method:"GET"|"POST"; path:string; body?:unknown };
export type GatewayApiResponse = { status:number; body:unknown };

export function createGatewayApi(gateway: ConfidentialIntentGateway) {
  return async function handle(request: GatewayApiRequest): Promise<GatewayApiResponse> {
    if (request.method==="POST" && request.path==="/v1/intents") {
      try { return { status:202, body:await gateway.submit(request.body as ConfidentialEnvelopeV1) }; }
      catch (error) { return { status:400, body:{ error:error instanceof Error ? error.message : String(error) } }; }
    }
    const match=request.path.match(/^\/v1\/intents\/(0x[0-9a-f]+)(?:\/(cancel))?$/i);
    if (match) {
      try {
        const commitment=match[1]; assertHex(commitment,"commitment");
        if (request.method==="POST" && match[2]==="cancel") return { status:200, body:await gateway.cancel(commitment) };
        if (request.method==="GET" && !match[2]) {
          const record=await gateway.get(commitment);
          return record ? {status:200,body:record} : {status:404,body:{error:"Unknown commitment."}};
        }
      } catch (error) { return { status:400, body:{ error:error instanceof Error ? error.message : String(error) } }; }
    }
    if (request.method==="GET" && request.path==="/health") return { status:200, body:{service:"33hoxo",status:"ok",protocolVersion:1} };
    return { status:404, body:{error:"Route not found."} };
  };
}
