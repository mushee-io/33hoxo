import "../src/styles.css";
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

type DemoState = "IDLE" | "REGISTERING" | "ENCRYPTING" | "SEALED" | "WAITING" | "REVEALING" | "VERIFIED" | "ERROR";

const shutter = new ShutterApiClient({ network: "chiado" });

let state: DemoState = "IDLE";
let intent: ConfidentialIntentV1 | null = null;
let envelope: ConfidentialEnvelopeV1 | null = null;
let revealed: ConfidentialIntentV1 | null = null;
let countdownTimer: number | null = null;
let revealTimer: number | null = null;
let lastError = "";

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
      <div class="status-pill"><i></i> Shutter Chiado</div>
      <div class="status-pill neutral">Protocol v1</div>
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
    $("settlementStatus").textContent = "Verified · adapter ready";
    settleButton.disabled = true;
    settleButton.textContent = "Wire Mary Jane wallet to settle";
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

settleButton.addEventListener("click", () => {
  $("actionMessage").textContent =
    "The 33HOXO Mary Jane adapter is implemented, but this deployment intentionally does not fake wallet signing. Connect the Mary Jane wallet layer next.";
});

setState("IDLE");
