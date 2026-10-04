import { describe,expect,it } from "vitest";
import { InMemoryCommitmentStore,InMemoryNonceRegistry,type PublicIntentRecord } from "../src/index.js";

const record:PublicIntentRecord={
  commitment:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  envelope:{
    version:1,scheme:"shutter-threshold-encryption",application:"test",sourceChain:"solana:devnet",
    settlementAdapter:"noop",market:"m",
    commitment:"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ciphertext:"0x0102",shutter:{network:"chiado",identity:"0x0102",identityPrefix:"0x0304",eon:1},
    createdAt:100,revealAt:200,expiresAt:400
  },
  state:"WAITING",acceptedAt:150,updatedAt:150
};

describe("in-memory security semantics",()=>{
  it("does not expose mutable references to stored records",async()=>{
    const store=new InMemoryCommitmentStore();await store.put(record);
    const read=await store.get(record.commitment);expect(read).not.toBeNull();
    read!.state="CANCELLED";read!.envelope.market="mutated";
    const reread=await store.get(record.commitment);
    expect(reread?.state).toBe("WAITING");expect(reread?.envelope.market).toBe("m");
  });

  it("clears stale failure codes after a successful state transition",async()=>{
    const store=new InMemoryCommitmentStore();await store.put(record);
    await store.updateState(record.commitment,"REVEALABLE",{failureCode:"KEY_NOT_READY",now:200});
    const verified=await store.updateState(record.commitment,"VERIFIED",{now:201});
    expect(verified.failureCode).toBeUndefined();
  });

  it("keeps case-sensitive trader identifiers distinct",async()=>{
    const nonces=new InMemoryNonceRegistry();
    const nonce="0x00000000000000000000000000000055";
    await nonces.reserve("AbC123",nonce,2_000_000_000);
    expect(await nonces.has("AbC123",nonce)).toBe(true);
    expect(await nonces.has("abc123",nonce)).toBe(false);
  });
});
