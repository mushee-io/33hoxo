import "../src/styles.css";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  ShutterApiClient,
  ShutterApiError,
  createIntentNonce,
  encryptConfidentialIntent,
  decryptConfidentialIntent,
  verifyRevealedIntent,
  randomHex,
} from "../../dist/index.js";
import type {
  ConfidentialEnvelopeV1,
  ConfidentialIntentV1,
} from "../../dist/index.js";

type DemoState = "IDLE" | "REGISTERING" | "ENCRYPTING" | "SEALED" | "WAITING" | "REVEALING" | "VERIFIED" | "EXECUTING" | "EXECUTED" | "ERROR";

type SolanaProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction(transaction: Transaction | VersionedTransaction): Promise<{ signature: string } | string>;
};

declare global {
  interface Window {
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider };
  }
}

const shutterProxyFetch: typeof fetch = async (input, init) => {
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const upstream = new URL(raw);
  const upstreamPath = `${upstream.pathname}${upstream.search}`;
  return fetch(`/api/shutter?path=${encodeURIComponent(upstreamPath)}`, init);
};

const shutter = new ShutterApiClient({
  network: "chiado",
  fetchImpl: shutterProxyFetch,
});

let state: DemoState = "IDLE";
let intent: ConfidentialIntentV1 | null = null;
let envelope: ConfidentialEnvelopeV1 | null = null;
let revealed: ConfidentialIntentV1 | null = null;
let countdownTimer: number | null = null;
let revealTimer: number | null = null;
let lastError = "";
let walletProvider: SolanaProvider | null = null;
let walletAddress = "";
const solana = new Connection("https://api.devnet.solana.com", "confirmed");

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root.");

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">33</div>
      <div>
        <strong>33HOXO</strong>
        <span>Confidential Markets</span>
      </div>
    </div>
    <div class="network-cluster">
      <div id="networkStatus" class="status-pill"><i></i> Shutter Chiado · checking</div>
      <div class="status-pill neutral">Protocol v1</div>
      <button id="walletButton" class="wallet-button">Connect wallet</button>
      <a class="ghost-link" href="https://github.com/mushee-io/33hoxo" target="_blank" rel="noreferrer">GitHub ↗</a>
    </div>
  </header>

  <main class="shell">
    <section class="hero">
      <div>
        <div class="kicker">Threshold-encrypted market execution</div>
        <h1>Seal the intent.<br/>Reveal it fairly.<br/>Settle anywhere.</h1>
        <p>
          33HOXO encrypts market instructions locally with Shutter, keeps them unreadable until the reveal condition,
          verifies the original commitment, then routes the verified intent into a settlement adapter.
        </p>
      </div>
      <div class="hero-proof">
        <span class="proof-label">LIVE PIPELINE</span>
        <div class="pipeline">
          <div class="pipe active">Intent</div><b>→</b>
          <div class="pipe">Encrypt</div><b>→</b>
          <div class="pipe">Seal</div><b>→</b>
          <div class="pipe">Reveal</div><b>→</b>
          <div class="pipe">Verify</div><b>→</b>
          <div class="pipe muted">Settle</div>
        </div>
        <p>No plaintext order is sent to the commitment layer before reveal.</p>
      </div>
    </section>

    <section class="grid">
      <article class="panel trade-panel">
        <div class="panel-head">
          <div>
            <span class="section-tag">REFERENCE IMPLEMENTATION</span>
            <h2>Mary Jane confidential order</h2>
          </div>
          <span class="adapter-pill">maryjane-solana-v1</span>
        </div>

        <div class="form-grid">
          <label>
            <span>Market</span>
            <input id="market" value="maryjane-demo-market" />
          </label>
          <label>
            <span>Trader / wallet</span>
            <input id="trader" value="demo-trader" />
          </label>
          <label>
            <span>Outcome</span>
            <select id="outcome"><option>YES</option><option>NO</option></select>
          </label>
          <label>
            <span>Action</span>
            <select id="action"><option>BUY</option><option>SELL</option></select>
          </label>
          <label>
            <span>Limit price</span>
            <div class="input-unit"><input id="price" type="number" min="1" max="9999" value="6200" /><em>bps</em></div>
          </label>
          <label>
            <span>Quantity</span>
            <div class="input-unit"><input id="quantity" value="500000000" /><em>base units</em></div>
          </label>
          <label>
            <span>Reveal delay</span>
            <div class="input-unit"><input id="delay" type="number" min="15" max="600" value="45" /><em>seconds</em></div>
          </label>
          <label>
            <span>Collateral</span>
            <input value="USDG" disabled />
          </label>
        </div>

        <div class="privacy-note">
          <span>◈</span>
          <div><strong>Encrypted locally.</strong> Side, action, price and quantity remain inside Shutter ciphertext until reveal.</div>
        </div>

        <button class="primary" id="sealButton">Seal with Shutter</button>
        <div id="actionMessage" class="action-message"></div>
      </article>

      <aside class="panel lifecycle-panel">
        <div class="panel-head">
          <div>
            <span class="section-tag">ORDER LIFECYCLE</span>
            <h2>Execution state</h2>
          </div>
          <span id="stateBadge" class="state-badge">IDLE</span>
        </div>

        <ol class="steps" id="steps">
          <li data-step="REGISTERING"><span>01</span><div><strong>Register identity</strong><small>Timed trigger on Shutter Chiado</small></div></li>
          <li data-step="ENCRYPTING"><span>02</span><div><strong>Encrypt intent</strong><small>BLST threshold encryption in browser</small></div></li>
          <li data-step="SEALED"><span>03</span><div><strong>Seal commitment</strong><small>Ciphertext + hash only</small></div></li>
          <li data-step="WAITING"><span>04</span><div><strong>Wait for reveal</strong><small id="countdownText">Not scheduled</small></div></li>
          <li data-step="REVEALING"><span>05</span><div><strong>Threshold reveal</strong><small>Retrieve key and decrypt</small></div></li>
          <li data-step="VERIFIED"><span>06</span><div><strong>Verify commitment</strong><small>Recompute and compare hash</small></div></li>
        </ol>
      </aside>
    </section>

    <section class="proof-grid">
      <article class="panel proof-panel">
        <div class="panel-head">
          <div>
            <span class="section-tag">PUBLIC BEFORE REVEAL</span>
            <h2>Sealed proof</h2>
          </div>
          <button class="mini" id="copyProof" disabled>Copy proof</button>
        </div>
        <div class="proof-table">
          <div><span>Commitment</span><code id="commitment">—</code></div>
          <div><span>Shutter identity</span><code id="identity">—</code></div>
          <div><span>Eon</span><code id="eon">—</code></div>
          <div><span>Reveal time</span><code id="revealTime">—</code></div>
          <div class="cipher-row"><span>Ciphertext</span><code id="ciphertext">—</code></div>
        </div>
      </article>

      <article class="panel reveal-panel">
        <div class="panel-head">
          <div>
            <span class="section-tag">AFTER THRESHOLD REVEAL</span>
            <h2>Verified intent</h2>
          </div>
          <span id="verifyBadge" class="verify-badge">LOCKED</span>
        </div>
        <div id="lockedState" class="locked-state">
          <div class="lock-icon">⌁</div>
          <strong>Intent is still sealed</strong>
          <p>The plaintext order will appear here only after Shutter releases the decryption key and the commitment verifies.</p>
        </div>
        <div id="revealedState" class="revealed-state hidden">
          <div class="metric-row"><span>Outcome</span><strong id="revealedOutcome">—</strong></div>
          <div class="metric-row"><span>Action</span><strong id="revealedAction">—</strong></div>
          <div class="metric-row"><span>Price</span><strong id="revealedPrice">—</strong></div>
          <div class="metric-row"><span>Quantity</span><strong id="revealedQuantity">—</strong></div>
          <div class="verified-banner">✓ Commitment integrity verified</div>
        </div>
      </article>
    </section>

    <section class="panel settlement-panel">
      <div>
        <span class="section-tag">SETTLEMENT ADAPTER</span>
        <h2>Mary Jane · Solana</h2>
        <p>Once the revealed intent verifies, 33HOXO can hand it to the Mary Jane adapter for wallet-authorized Solana settlement.</p>
      </div>
      <div class="settlement-actions">
        <span id="settlementStatus" class="settlement-status">Awaiting verified intent</span>
        <button id="settleButton" class="secondary" disabled>Settle on Solana</button>
        <a id="solanaProofLink" class="proof-link hidden" target="_blank" rel="noreferrer">View transaction ↗</a>
      </div>
    </section>

    <section class="protocol-strip">
      <div><strong>Reusable core</strong><span>Intent standard</span></div>
      <div><strong>Shutter</strong><span>Threshold encryption</span></div>
      <div><strong>33HOXO</strong><span>Reveal + verification</span></div>
      <div><strong>Adapters</strong><span>Mary Jane · Auction · DEX · RFQ</span></div>
    </section>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id) as T | null;
  if (!element) throw new Error(`Missing element: ${id}`);
  return element;
};

const sealButton = $<HTMLButtonElement>("sealButton");
const settleButton = $<HTMLButtonElement>("settleButton");
const copyProof = $<HTMLButtonElement>("copyProof");
const walletButton = $<HTMLButtonElement>("walletButton");
const solanaProofLink = $<HTMLAnchorElement>("solanaProofLink");

function setState(next: DemoState, message = "") {
  state = next;
  $("stateBadge").textContent = next;
  $("actionMessage").textContent = message;
  document.querySelectorAll<HTMLLIElement>(".steps li").forEach((item) => {
    item.classList.toggle("current", item.dataset.step === next);
    const order = ["REGISTERING","ENCRYPTING","SEALED","WAITING","REVEALING","VERIFIED"];
    const currentIndex = order.indexOf(next);
    const itemIndex = order.indexOf(item.dataset.step || "");
    item.classList.toggle("complete", currentIndex > itemIndex || next === "VERIFIED");
  });
}

function getProvider(): SolanaProvider | null {
  return window.phantom?.solana ?? window.solana ?? null;
}

function updateSettlementAvailability() {
  if (state === "VERIFIED" && revealed) {
    if (walletAddress) {
      settleButton.disabled = false;
      settleButton.textContent = "Settle on Solana";
      $("settlementStatus").textContent = "Verified · wallet connected";
    } else {
      settleButton.disabled = true;
      settleButton.textContent = "Connect wallet to settle";
      $("settlementStatus").textContent = "Verified · connect Solana wallet";
    }
  }
}

async function connectWallet() {
  const provider = getProvider();
  if (!provider) {
    throw new Error("No Solana wallet detected. Install Phantom or another compatible Solana wallet.");
  }
  const result = await provider.connect();
  walletProvider = provider;
  walletAddress = result.publicKey.toString();
  ($<HTMLInputElement>("trader")).value = walletAddress;
  walletButton.textContent = walletAddress.slice(0,4) + "…" + walletAddress.slice(-4);
  walletButton.classList.add("connected");
  updateSettlementAvailability();
}

function decodeBase64Transaction(value: string): Transaction | VersionedTransaction {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

async function settleVerifiedIntent() {
  if (!revealed || !envelope) throw new Error("No verified intent is ready for settlement.");
  if (!walletProvider || !walletAddress) {
    await connectWallet();
  }
  if (!walletProvider || !walletAddress) throw new Error("Wallet connection failed.");

  setState("EXECUTING", "Preparing the Mary Jane Solana transaction…");
  settleButton.disabled = true;
  settleButton.textContent = "Preparing transaction…";

  const response = await fetch("/api/maryjane", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      wallet: walletAddress,
      market: revealed.market,
      side: revealed.outcome,
      kind: revealed.action,
      priceBps: revealed.priceBps,
      sharesBaseUnits: revealed.quantityBaseUnits,
    }),
  });

  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "Mary Jane order preparation failed.";
    throw new Error(message);
  }

  const transactionBase64 = body.transactionBase64;
  if (typeof transactionBase64 !== "string" || !transactionBase64) {
    throw new Error("Mary Jane did not return an unsigned Solana transaction.");
  }

  setState("EXECUTING", "Transaction prepared. Approve the Solana transaction in your wallet…");
  settleButton.textContent = "Approve in wallet";

  const transaction = decodeBase64Transaction(transactionBase64);
  const sent = await walletProvider.signAndSendTransaction(transaction);
  const signature = typeof sent === "string" ? sent : sent.signature;
  if (!signature) throw new Error("Wallet did not return a Solana transaction signature.");

  setState("EXECUTING", "Transaction submitted. Waiting for Solana confirmation…");
  settleButton.textContent = "Confirming…";

  const started = Date.now();
  let confirmed = false;
  while (Date.now() - started < 60_000) {
    const status = await solana.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (status.value?.err) throw new Error("Solana transaction failed.");
    if (status.value?.confirmationStatus === "confirmed" || status.value?.confirmationStatus === "finalized") {
      confirmed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!confirmed) throw new Error("Solana transaction was submitted but confirmation timed out. Check the explorer before retrying.");

  setState("EXECUTED", "Mary Jane settlement confirmed on Solana Devnet.");
  $("settlementStatus").textContent = "Confirmed on Solana Devnet";
  settleButton.textContent = "Settled";
  settleButton.disabled = true;
  solanaProofLink.href = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  solanaProofLink.classList.remove("hidden");

  localStorage.setItem("33hoxo:last-execution", JSON.stringify({
    commitment: envelope.commitment,
    signature,
    executedAt: Math.floor(Date.now()/1000),
    adapter: "maryjane-solana-v1",
  }));
}

function renderEnvelope() {
  if (!envelope) return;
  $("commitment").textContent = envelope.commitment;
  $("identity").textContent = envelope.shutter.identity;
  $("eon").textContent = String(envelope.shutter.eon);
  $("revealTime").textContent = new Date(envelope.revealAt * 1000).toLocaleString();
  $("ciphertext").textContent = envelope.ciphertext;
  copyProof.disabled = false;
}

function updateCountdown() {
  if (!envelope) return;
  const now = Math.floor(Date.now() / 1000);
  const left = Math.max(0, envelope.revealAt - now);
  $("countdownText").textContent = left > 0 ? `${left}s until reveal` : "Reveal condition reached";
  if (left === 0 && ["SEALED","WAITING"].includes(state)) {
    void attemptReveal();
  }
}

function beginPolling() {
  if (countdownTimer) window.clearInterval(countdownTimer);
  if (revealTimer) window.clearInterval(revealTimer);
  countdownTimer = window.setInterval(updateCountdown, 1000);
  revealTimer = window.setInterval(() => {
    if (envelope && Math.floor(Date.now() / 1000) >= envelope.revealAt && state !== "VERIFIED") {
      void attemptReveal();
    }
  }, 4000);
}

async function attemptReveal() {
  if (!envelope || state === "REVEALING" || state === "VERIFIED") return;
  const now = Math.floor(Date.now() / 1000);
  if (now < envelope.revealAt) return;

  setState("REVEALING", "Reveal time reached. Requesting threshold decryption key from Shutter…");

  try {
    const key = await shutter.getDecryptionKey(envelope.shutter.identity);
    revealed = await decryptConfidentialIntent(envelope, key.decryption_key);
    const verification = await verifyRevealedIntent(envelope, revealed, now);

    if (!verification.ok) {
      throw new Error(`${verification.code}: ${verification.reason}`);
    }

    setState("VERIFIED", "Threshold reveal complete. Commitment integrity verified.");
    $("verifyBadge").textContent = "VERIFIED";
    $("verifyBadge").classList.add("ok");
    $("lockedState").classList.add("hidden");
    $("revealedState").classList.remove("hidden");
    $("revealedOutcome").textContent = revealed.outcome;
    $("revealedAction").textContent = revealed.action;
    $("revealedPrice").textContent = revealed.priceBps != null ? `${revealed.priceBps} bps` : "Market";
    $("revealedQuantity").textContent = revealed.quantityBaseUnits;
    updateSettlementAvailability();
    if (revealTimer) window.clearInterval(revealTimer);
  } catch (error) {
    if (error instanceof ShutterApiError && (error.status === 404 || error.retryable)) {
      setState("WAITING", "Reveal condition reached; waiting for Shutter key availability…");
      return;
    }
    lastError = error instanceof Error ? error.message : String(error);
    setState("ERROR", lastError);
  }
}

sealButton.addEventListener("click", async () => {
  if (state !== "IDLE" && state !== "ERROR" && state !== "VERIFIED") return;

  sealButton.disabled = true;
  sealButton.textContent = "Registering with Shutter…";
  $("verifyBadge").textContent = "LOCKED";
  $("verifyBadge").classList.remove("ok");
  $("lockedState").classList.remove("hidden");
  $("revealedState").classList.add("hidden");

  try {
    const now = Math.floor(Date.now() / 1000);
    const delay = Math.max(15, Number(($<HTMLInputElement>("delay")).value || 45));
    const revealAt = now + delay;

    intent = {
      version: 1,
      application: "maryjane",
      sourceChain: "solana:devnet",
      settlementAdapter: "maryjane-solana-v1",
      market: ($<HTMLInputElement>("market")).value.trim(),
      trader: ($<HTMLInputElement>("trader")).value.trim(),
      kind: "LIMIT_ORDER",
      action: ($<HTMLSelectElement>("action")).value as "BUY" | "SELL",
      outcome: ($<HTMLSelectElement>("outcome")).value,
      priceBps: Number(($<HTMLInputElement>("price")).value),
      quantityBaseUnits: ($<HTMLInputElement>("quantity")).value.trim(),
      collateralAsset: "USDG",
      allowPartialFill: true,
      nonce: createIntentNonce(),
      createdAt: now,
      revealAt,
      expiresAt: revealAt + 300,
      metadata: { demo: true, protocol: "33hoxo" },
    };

    setState("REGISTERING", "Creating timed Shutter identity on Chiado…");
    const identityPrefix = randomHex(32);
    const registration = await shutter.registerTimeIdentity({
      decryptionTimestamp: revealAt,
      identityPrefix,
    });

    setState("ENCRYPTING", "Shutter identity registered. Encrypting the canonical intent locally…");
    envelope = await encryptConfidentialIntent({
      intent,
      network: "chiado",
      encryptionData: {
        eon: registration.eon,
        eonKey: registration.eon_key,
        identity: registration.identity,
        identityPrefix: registration.identity_prefix,
        epochId: registration.epoch_id,
      },
    });

    setState("SEALED", "Real Shutter ciphertext created. The plaintext fields are now sealed until reveal.");
    renderEnvelope();
    localStorage.setItem("33hoxo:last-envelope", JSON.stringify(envelope));
    sessionStorage.setItem("33hoxo:last-intent", JSON.stringify(intent));
    updateCountdown();
    beginPolling();

    window.setTimeout(() => {
      if (state === "SEALED") setState("WAITING", "Ciphertext sealed. Waiting for the timed Shutter reveal condition.");
    }, 700);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    setState("ERROR", lastError);
  } finally {
    sealButton.disabled = false;
    sealButton.textContent = "Seal another intent";
  }
});

copyProof.addEventListener("click", async () => {
  if (!envelope) return;
  await navigator.clipboard.writeText(JSON.stringify({
    protocol: "33hoxo",
    network: "chiado",
    commitment: envelope.commitment,
    ciphertext: envelope.ciphertext,
    shutter: envelope.shutter,
    revealAt: envelope.revealAt,
  }, null, 2));
  copyProof.textContent = "Copied";
  window.setTimeout(() => { copyProof.textContent = "Copy proof"; }, 1200);
});

walletButton.addEventListener("click", async () => {
  try {
    await connectWallet();
    $("actionMessage").textContent = "Solana wallet connected.";
  } catch (error) {
    $("actionMessage").textContent = error instanceof Error ? error.message : String(error);
  }
});

settleButton.addEventListener("click", async () => {
  try {
    await settleVerifiedIntent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState("ERROR", message);
    $("settlementStatus").textContent = "Settlement failed";
    settleButton.disabled = false;
    settleButton.textContent = "Retry settlement";
  }
});

void (async () => {
  const provider = getProvider();
  if (provider) {
    try {
      const trusted = await provider.connect({ onlyIfTrusted: true });
      walletProvider = provider;
      walletAddress = trusted.publicKey.toString();
      ($<HTMLInputElement>("trader")).value = walletAddress;
      walletButton.textContent = walletAddress.slice(0,4) + "…" + walletAddress.slice(-4);
      walletButton.classList.add("connected");
    } catch {
      // User has not previously trusted this site; explicit connect stays available.
    }
  }

  const status = document.getElementById("networkStatus");
  if (!status) return;
  try {
    await shutter.checkAuthentication();
    status.innerHTML = "<i></i> Shutter Chiado · reachable";
  } catch {
    status.innerHTML = "<i></i> Shutter Chiado · proxy error";
  }
})();

setState("IDLE");
