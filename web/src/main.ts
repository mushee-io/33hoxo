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

type DemoState =
  | "IDLE"
  | "REGISTERING"
  | "ENCRYPTING"
  | "SEALED"
  | "WAITING"
  | "REVEALING"
  | "VERIFIED"
  | "EXECUTING"
  | "EXECUTED"
  | "ERROR";

type ViewName =
  | "overview"
  | "orders"
  | "explorer"
  | "adapters"
  | "shutter"
  | "proofs"
  | "developer"
  | "security"
  | "architecture";

type StoredOrder = {
  commitment: string;
  envelope: ConfidentialEnvelopeV1;
  intent?: ConfidentialIntentV1;
  status: DemoState;
  createdAt: number;
  updatedAt: number;
  signature?: string;
  error?: string;
};

type SolanaProvider = {
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

type RuntimeConfig = {
  environment: "staging" | "production";
  shutterNetwork: "chiado" | "gnosis";
  solanaCluster: "devnet" | "mainnet-beta";
  mainnetEnabled: boolean;
  maxMainnetQuantityBaseUnits: string;
  allowedMainnetAdapters: string[];
  allowedMainnetMarkets: string[];
};

let runtimeConfig: RuntimeConfig = {
  environment: "staging",
  shutterNetwork: "chiado",
  solanaCluster: "devnet",
  mainnetEnabled: false,
  maxMainnetQuantityBaseUnits: "1000000",
  allowedMainnetAdapters: ["maryjane-solana-v1"],
  allowedMainnetMarkets: [],
};

const shutterProxyFetch: typeof fetch = async (input, init) => {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const upstream = new URL(raw);
  const upstreamPath = `${upstream.pathname}${upstream.search}`;
  return fetch(
    `/api/shutter?network=${runtimeConfig.shutterNetwork}&path=${encodeURIComponent(upstreamPath)}`,
    init,
  );
};

let shutter = new ShutterApiClient({
  network: runtimeConfig.shutterNetwork,
  fetchImpl: shutterProxyFetch,
});

let solana = new Connection("https://api.devnet.solana.com", "confirmed");

let state: DemoState = "IDLE";
let intent: ConfidentialIntentV1 | null = null;
let envelope: ConfidentialEnvelopeV1 | null = null;
let revealed: ConfidentialIntentV1 | null = null;
let countdownTimer: number | null = null;
let revealTimer: number | null = null;
let walletProvider: SolanaProvider | null = null;
let walletAddress = "";
let currentView: ViewName = "overview";
let shutterReachable = false;

const HISTORY_KEY = "33hoxo:orders:v1";
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root.");

app.innerHTML = `
<div class="app-frame">
  <aside class="sidebar">
    <div class="side-brand">
      <div class="brand-mark">33</div>
      <div><strong>33HOXO</strong><span>Confidential Markets</span></div>
    </div>

    <nav class="side-nav">
      ${[
        ["overview","Overview","◫"],
        ["orders","Confidential Orders","◈"],
        ["explorer","Intent Explorer","⌕"],
        ["adapters","Adapters","⇄"],
        ["shutter","Shutter Network","◎"],
        ["proofs","Proof Center","✓"],
        ["developer","Developer","</>"],
        ["security","Security","⌾"],
        ["architecture","Architecture","◇"],
      ].map(([id,label,icon]) => `<button data-view="${id}" class="nav-button"><span>${icon}</span>${label}</button>`).join("")}
    </nav>

    <div class="side-foot">
      <div id="sideNetwork" class="mini-status"><i></i> Chiado checking</div>
      <span id="runtimeLabel">Protocol v1 · Solana Devnet</span>
    </div>
  </aside>

  <div class="workspace">
    <header class="topbar">
      <div>
        <span class="crumb">33HOXO / <b id="pageTitle">Overview</b></span>
      </div>
      <div class="network-cluster">
        <div id="networkStatus" class="status-pill"><i></i> ${runtimeConfig.shutterNetwork === "gnosis" ? "Shutter Gnosis" : "Shutter Chiado"} · checking</div>
        <button id="walletButton" class="wallet-button">Connect wallet</button>
        <a class="ghost-link" href="https://github.com/mushee-io/33hoxo" target="_blank" rel="noreferrer">GitHub ↗</a>
      </div>
    </header>

    <main class="content">
      <section class="view" data-view-panel="overview">
        <div class="page-head">
          <div>
            <span class="kicker">CONFIDENTIAL EXECUTION INFRASTRUCTURE</span>
            <h1>Everything needed to seal, reveal, verify and settle market intents.</h1>
            <p>33HOXO packages Shutter threshold encryption into a reusable workflow for prediction markets, auctions, DEX intents, RFQs and OTC execution.</p>
          </div>
          <button class="primary compact" data-jump="orders">Create confidential intent</button>
        </div>

        <div class="stat-grid">
          <div class="stat-card"><span>Shutter network</span><strong id="statNetwork">Checking</strong><small>Chiado threshold encryption</small></div>
          <div class="stat-card"><span>Stored intents</span><strong id="statIntents">0</strong><small>Local protocol history</small></div>
          <div class="stat-card"><span>Verified</span><strong id="statVerified">0</strong><small>Commitment matched</small></div>
          <div class="stat-card"><span>Executed</span><strong id="statExecuted">0</strong><small>Settlement confirmed</small></div>
        </div>

        <div class="overview-grid">
          <article class="panel">
            <span class="section-tag">LIVE PIPELINE</span>
            <h2>Confidential market lifecycle</h2>
            <div class="pipeline vertical">
              <div class="pipe active">01 · Canonical intent</div>
              <b>↓</b><div class="pipe">02 · Local Shutter encryption</div>
              <b>↓</b><div class="pipe">03 · Ciphertext commitment</div>
              <b>↓</b><div class="pipe">04 · Threshold reveal</div>
              <b>↓</b><div class="pipe">05 · Integrity verification</div>
              <b>↓</b><div class="pipe">06 · Settlement adapter</div>
            </div>
          </article>

          <article class="panel">
            <span class="section-tag">CURRENT ADAPTERS</span>
            <h2>Reusable, not Mary-Jane-specific</h2>
            <div class="mini-list">
              <div><b>Mary Jane</b><span>Solana prediction markets</span><em class="live-dot">LIVE</em></div>
              <div><b>Sealed Auction</b><span>Private bids</span><em>READY</em></div>
              <div><b>DEX Intent</b><span>Private order flow</span><em>SDK</em></div>
              <div><b>RFQ / OTC</b><span>Confidential quotes</span><em>SDK</em></div>
            </div>
          </article>
        </div>

        <article class="panel recent-panel">
          <div class="panel-head"><div><span class="section-tag">RECENT ACTIVITY</span><h2>Latest confidential intents</h2></div><button class="mini" data-jump="explorer">Open explorer</button></div>
          <div id="recentOrders" class="history-table"></div>
        </article>
      </section>

      <section class="view hidden" data-view-panel="orders">
        <div class="page-head compact-head">
          <div><span class="kicker">REFERENCE IMPLEMENTATION</span><h1>Confidential Orders</h1><p>Real ${runtimeConfig.shutterNetwork === "gnosis" ? "Shutter Gnosis" : "Shutter Chiado"} registration, encryption, timed reveal and verification. Mary Jane is the first settlement adapter.</p></div>
        </div>

        <section class="grid">
          <article class="panel trade-panel">
            <div class="panel-head">
              <div><span class="section-tag">MARY JANE · SOLANA</span><h2>Create confidential order</h2></div>
              <span class="adapter-pill">maryjane-solana-v1</span>
            </div>

            <div class="form-grid">
              <label><span>Market</span><input id="market" value="maryjane-demo-market" /></label>
              <label><span>Trader / wallet</span><input id="trader" value="demo-trader" /></label>
              <label><span>Outcome</span><select id="outcome"><option>YES</option><option>NO</option></select></label>
              <label><span>Action</span><select id="action"><option>BUY</option><option>SELL</option></select></label>
              <label><span>Limit price</span><div class="input-unit"><input id="price" type="number" min="1" max="9999" value="6200" /><em>bps</em></div></label>
              <label><span>Quantity</span><div class="input-unit"><input id="quantity" value="500000000" /><em>base units</em></div></label>
              <label><span>Reveal delay</span><div class="input-unit"><input id="delay" type="number" min="15" max="600" value="45" /><em>seconds</em></div></label>
              <label><span>Collateral</span><input value="USDG" disabled /></label>
            </div>

            <div class="privacy-note"><span>◈</span><div><strong>Encrypted locally.</strong> Side, action, price and quantity remain inside Shutter ciphertext until reveal.</div></div>
            <button class="primary" id="sealButton">Seal with Shutter</button>
            <div id="actionMessage" class="action-message"></div>
          </article>

          <aside class="panel lifecycle-panel">
            <div class="panel-head"><div><span class="section-tag">ORDER LIFECYCLE</span><h2>Execution state</h2></div><span id="stateBadge" class="state-badge">IDLE</span></div>
            <ol class="steps">
              <li data-step="REGISTERING"><span>01</span><div><strong>Register identity</strong><small>Timed trigger on ${runtimeConfig.shutterNetwork === "gnosis" ? "Shutter Gnosis" : "Shutter Chiado"}</small></div></li>
              <li data-step="ENCRYPTING"><span>02</span><div><strong>Encrypt intent</strong><small>BLST threshold encryption in browser</small></div></li>
              <li data-step="SEALED"><span>03</span><div><strong>Seal commitment</strong><small>Ciphertext + SHA-256</small></div></li>
              <li data-step="WAITING"><span>04</span><div><strong>Wait for reveal</strong><small id="countdownText">Not scheduled</small></div></li>
              <li data-step="REVEALING"><span>05</span><div><strong>Threshold reveal</strong><small>Retrieve key and decrypt</small></div></li>
              <li data-step="VERIFIED"><span>06</span><div><strong>Verify commitment</strong><small>Recompute and compare hash</small></div></li>
            </ol>
          </aside>
        </section>

        <section class="proof-grid">
          <article class="panel">
            <div class="panel-head"><div><span class="section-tag">PUBLIC BEFORE REVEAL</span><h2>Sealed proof</h2></div><button class="mini" id="copyProof" disabled>Copy proof</button></div>
            <div class="proof-table">
              <div><span>Commitment</span><code id="commitment">—</code></div>
              <div><span>Shutter identity</span><code id="identity">—</code></div>
              <div><span>Eon</span><code id="eon">—</code></div>
              <div><span>Reveal time</span><code id="revealTime">—</code></div>
              <div class="cipher-row"><span>Ciphertext</span><code id="ciphertext">—</code></div>
            </div>
          </article>

          <article class="panel">
            <div class="panel-head"><div><span class="section-tag">AFTER THRESHOLD REVEAL</span><h2>Verified intent</h2></div><span id="verifyBadge" class="verify-badge">LOCKED</span></div>
            <div id="lockedState" class="locked-state"><div class="lock-icon">⌁</div><strong>Intent is still sealed</strong><p>Plaintext appears only after Shutter releases the decryption key and the commitment verifies.</p></div>
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
          <div><span class="section-tag">SETTLEMENT ADAPTER</span><h2>Mary Jane · Solana</h2><p>Verified intents are converted into a Mary Jane unsigned transaction. Your wallet signs; 33HOXO never receives your private key.</p></div>
          <div class="settlement-actions"><span id="settlementStatus" class="settlement-status">Awaiting verified intent</span><button id="settleButton" class="secondary" disabled>Settle on Solana</button><a id="solanaProofLink" class="proof-link hidden" target="_blank" rel="noreferrer">View transaction ↗</a></div>
        </section>
      </section>

      <section class="view hidden" data-view-panel="explorer">
        <div class="page-head compact-head"><div><span class="kicker">COMMITMENT INDEX</span><h1>Intent Explorer</h1><p>Search and inspect sealed, verified and executed intents created in this browser.</p></div></div>
        <article class="panel">
          <div class="search-row"><input id="explorerSearch" placeholder="Search commitment, market, trader or status…" /><button id="clearHistory" class="mini danger">Clear local history</button></div>
          <div id="historyTable" class="history-table"></div>
        </article>
      </section>

      <section class="view hidden" data-view-panel="adapters">
        <div class="page-head compact-head"><div><span class="kicker">SETTLEMENT ROUTING</span><h1>Adapter Registry</h1><p>Confidentiality stays generic. Each adapter translates a verified intent into application-specific execution.</p></div></div>
        <div class="adapter-grid">
          <article class="adapter-card live"><span>LIVE</span><h2>Mary Jane</h2><p>Solana prediction-market settlement through the current order-place API.</p><code>maryjane-solana-v1</code></article>
          <article class="adapter-card ready"><span>READY</span><h2>Sealed Auction</h2><p>Confidential bid reveal using the same Shutter pipeline.</p><code>sealed-auction-v1</code></article>
          <article class="adapter-card"><span>FRAMEWORK</span><h2>DEX Intent</h2><p>Private swaps and order-flow routing before execution.</p><code>SettlementAdapter</code></article>
          <article class="adapter-card"><span>FRAMEWORK</span><h2>RFQ / OTC</h2><p>Encrypted bilateral quote collection and fair reveal.</p><code>SettlementAdapter</code></article>
          <article class="adapter-card"><span>EXTENSIBLE</span><h2>RWA Markets</h2><p>Permissioned or issuer-routed execution through custom adapter policy.</p><code>SettlementAdapter</code></article>
          <article class="adapter-card"><span>EXTENSIBLE</span><h2>Batch Auction</h2><p>Reveal a window of sealed intents together and route them as a batch.</p><code>BatchSettlementCoordinator</code></article>
        </div>
      </section>

      <section class="view hidden" data-view-panel="shutter">
        <div class="page-head compact-head"><div><span class="kicker">THRESHOLD ENCRYPTION</span><h1>Shutter Network</h1><p>Live connectivity and confidentiality status for the development deployment.</p></div></div>
        <div class="stat-grid">
          <div class="stat-card"><span>Network</span><strong id="shutterNetworkName">Chiado</strong><small>Time-triggered reveal</small></div>
          <div class="stat-card"><span>API</span><strong id="shutterApiState">Checking</strong><small>Same-origin Vercel proxy</small></div>
          <div class="stat-card"><span>Latest eon</span><strong id="latestEon">—</strong><small>From last sealed intent</small></div>
          <div class="stat-card"><span>Successful reveals</span><strong id="revealCount">0</strong><small>Local history</small></div>
        </div>
        <article class="panel">
          <span class="section-tag">LIVE GUARANTEE</span><h2>What is hidden before reveal?</h2>
          <div class="security-grid">
            <div>✓ Outcome / side</div><div>✓ BUY / SELL action</div><div>✓ Limit price</div><div>✓ Quantity</div><div>✓ Max spend / fill rules</div><div>✓ Private application metadata</div>
          </div>
          <p class="muted-copy">Public routing metadata can include the commitment hash, ciphertext, market identifier, application, Shutter identity/eon and reveal timestamp. 33HOXO does not claim permanent post-settlement anonymity.</p>
        </article>
      </section>

      <section class="view hidden" data-view-panel="proofs">
        <div class="page-head compact-head"><div><span class="kicker">CRYPTOGRAPHIC EVIDENCE</span><h1>Proof Center</h1><p>Paste a commitment from this browser to reconstruct its confidentiality, reveal and settlement evidence.</p></div></div>
        <article class="panel">
          <div class="search-row"><input id="proofSearch" placeholder="0x commitment hash" /><button id="proofLookup" class="secondary">Inspect proof</button></div>
          <div id="proofResult" class="proof-result empty">Enter a commitment to inspect its proof chain.</div>
        </article>
      </section>

      <section class="view hidden" data-view-panel="developer">
        <div class="page-head compact-head"><div><span class="kicker">INTEGRATION SURFACE</span><h1>Developer Console</h1><p>Use the protocol as infrastructure, not as a one-off UI feature.</p></div></div>
        <div class="dev-grid">
          <article class="panel"><span class="section-tag">SDK</span><h2>@mushee/33hoxo</h2><pre><code>const sealed = await client.sealIntent(intent)

const revealed = await revealEngine.process(
  sealed.envelope.commitment
)

await settlement.executeVerified(
  revealed.intent,
  sealed.envelope.commitment
)</code></pre></article>
          <article class="panel"><span class="section-tag">LIVE ROUTES</span><h2>Deployment API</h2><div class="endpoint-list"><code>GET /api/health</code><code>GET|POST /api/shutter</code><code>POST /api/maryjane</code></div></article>
          <article class="panel"><span class="section-tag">WEBHOOK EVENTS</span><h2>Lifecycle hooks</h2><div class="endpoint-list"><code>intent.sealed</code><code>intent.revealable</code><code>intent.revealed</code><code>intent.verified</code><code>intent.executed</code><code>intent.failed</code></div></article>
          <article class="panel"><span class="section-tag">ADAPTER CONTRACT</span><h2>Implement your market</h2><pre><code>class MyAdapter implements SettlementAdapter {
  validate()
  simulate()
  prepare()
  execute()
  confirm()
}</code></pre></article>
        </div>
      </section>

      <section class="view hidden" data-view-panel="security">
        <div class="page-head compact-head"><div><span class="kicker">FAIRNESS & INTEGRITY</span><h1>Security Guarantees</h1><p>Runtime rules already enforced by the protocol and regression suite.</p></div></div>
        <div class="security-grid cards">
          ${[
            ["Late commitment protection","New commitments are rejected after the reveal window opens."],
            ["Conflicting-envelope protection","Same commitment cannot be replaced with different ciphertext."],
            ["Late cancellation protection","Orders cannot be cancelled after reveal time."],
            ["Commitment verification","Revealed plaintext is re-hashed before settlement."],
            ["Replay protection","Trader + nonce pairs cannot execute twice."],
            ["Expiry enforcement","Expired intents are blocked at reveal and settlement."],
            ["Key identity validation","Returned Shutter key identity must match the sealed identity."],
            ["Wallet custody","33HOXO never receives the trader private key."],
            ["Ciphertext-only storage","Pre-reveal commitment storage does not require plaintext."],
            ["Official crypto vector","CI verifies Shutter encryption/decryption against upstream vectors."],
          ].map(([title,body])=>`<article class="security-card"><b>✓ ${title}</b><p>${body}</p></article>`).join("")}
        </div>
      </section>

      <section class="view hidden" data-view-panel="architecture">
        <div class="page-head compact-head"><div><span class="kicker">SYSTEM DESIGN</span><h1>Architecture</h1><p>The Shutter layer is separated from application settlement so the protocol can serve multiple market types.</p></div></div>
        <article class="panel architecture">
          <div class="arch-node root">Application / Trader</div><div class="arch-arrow">↓</div>
          <div class="arch-node">Canonical Confidential Intent</div><div class="arch-arrow">↓</div>
          <div class="arch-node green">Local Shutter Encryption</div><div class="arch-arrow">↓</div>
          <div class="arch-node">Ciphertext Commitment Gateway</div><div class="arch-arrow">↓</div>
          <div class="arch-node green">Threshold Reveal Engine</div><div class="arch-arrow">↓</div>
          <div class="arch-node">Commitment Verification + Replay Guard</div><div class="arch-arrow">↓</div>
          <div class="arch-node">Settlement Adapter Registry</div>
          <div class="arch-branches"><div>Mary Jane<br/><small>Solana</small></div><div>Sealed Auction<br/><small>Bids</small></div><div>DEX / RFQ<br/><small>Intents</small></div><div>Custom<br/><small>Markets</small></div></div>
        </article>
      </section>
    </main>
  </div>
</div>
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

function getHistory(): StoredOrder[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setHistory(history: StoredOrder[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
  renderStats();
  renderHistory();
}

function upsertHistory(record: StoredOrder) {
  const history = getHistory().filter((item) => item.commitment !== record.commitment);
  history.unshift(record);
  setHistory(history);
}

function patchHistory(commitment: string, patch: Partial<StoredOrder>) {
  const history = getHistory();
  const index = history.findIndex((item) => item.commitment === commitment);
  if (index < 0) return;
  history[index] = { ...history[index], ...patch, updatedAt: Math.floor(Date.now()/1000) };
  setHistory(history);
}

function short(value: string, left = 7, right = 5) {
  if (value.length <= left + right + 2) return value;
  return `${value.slice(0,left)}…${value.slice(-right)}`;
}

function renderStats() {
  const history = getHistory();
  $("statNetwork").textContent = shutterReachable ? "Reachable" : "Checking";
  $("statIntents").textContent = String(history.length);
  $("statVerified").textContent = String(history.filter((x) => ["VERIFIED","EXECUTING","EXECUTED"].includes(x.status)).length);
  $("statExecuted").textContent = String(history.filter((x) => x.status === "EXECUTED").length);
  $("shutterApiState").textContent = shutterReachable ? "Reachable" : "Unavailable";
  $("latestEon").textContent = history[0]?.envelope?.shutter?.eon != null ? String(history[0].envelope.shutter.eon) : "—";
  $("revealCount").textContent = String(history.filter((x) => ["VERIFIED","EXECUTING","EXECUTED"].includes(x.status)).length);
}

function historyRows(items: StoredOrder[]) {
  if (!items.length) return '<div class="empty-state">No confidential intents yet. Create one from Confidential Orders.</div>';
  return `<div class="history-head"><span>Commitment</span><span>Market</span><span>Status</span><span>Reveal</span><span>Settlement</span></div>` +
    items.map((item) => `
      <button class="history-row" data-proof="${item.commitment}">
        <code>${short(item.commitment)}</code>
        <span>${item.envelope.market}</span>
        <span class="status-text ${item.status.toLowerCase()}">${item.status}</span>
        <span>${new Date(item.envelope.revealAt*1000).toLocaleTimeString()}</span>
        <span>${item.signature ? short(item.signature) : "—"}</span>
      </button>`).join("");
}

function renderHistory(filter = "") {
  const history = getHistory();
  const normalized = filter.trim().toLowerCase();
  const filtered = normalized
    ? history.filter((item) => JSON.stringify(item).toLowerCase().includes(normalized))
    : history;
  $("historyTable").innerHTML = historyRows(filtered);
  $("recentOrders").innerHTML = historyRows(history.slice(0, 5));
  document.querySelectorAll<HTMLElement>("[data-proof]").forEach((row) => {
    row.addEventListener("click", () => {
      const commitment = row.dataset.proof || "";
      ($<HTMLInputElement>("proofSearch")).value = commitment;
      switchView("proofs");
      renderProof(commitment);
    });
  });
}

function renderProof(commitment: string) {
  const record = getHistory().find((item) => item.commitment.toLowerCase() === commitment.trim().toLowerCase());
  const target = $("proofResult");
  if (!record) {
    target.className = "proof-result empty";
    target.textContent = "No local proof found for that commitment.";
    return;
  }
  target.className = "proof-result";
  target.innerHTML = `
    <div class="proof-checks">
      <div><b>✓ Confidentiality proof</b><span>Ciphertext committed before reveal</span></div>
      <div><b>✓ Shutter proof</b><span>Identity ${short(record.envelope.shutter.identity)} · Eon ${record.envelope.shutter.eon}</span></div>
      <div><b>${["VERIFIED","EXECUTING","EXECUTED"].includes(record.status) ? "✓" : "○"} Integrity proof</b><span>Status: ${record.status}</span></div>
      <div><b>${record.signature ? "✓" : "○"} Settlement proof</b><span>${record.signature ? `Solana ${short(record.signature)}` : "Not settled"}</span></div>
    </div>
    <div class="proof-table">
      <div><span>Commitment</span><code>${record.commitment}</code></div>
      <div><span>Identity</span><code>${record.envelope.shutter.identity}</code></div>
      <div><span>Reveal</span><code>${new Date(record.envelope.revealAt*1000).toLocaleString()}</code></div>
      <div><span>Adapter</span><code>${record.envelope.settlementAdapter}</code></div>
      <div><span>Ciphertext</span><code>${record.envelope.ciphertext}</code></div>
    </div>`;
}

function switchView(view: ViewName) {
  currentView = view;
  document.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.viewPanel !== view);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  const label = document.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)?.textContent?.trim() || view;
  $("pageTitle").textContent = label;
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderStats();
  renderHistory(($<HTMLInputElement>("explorerSearch")).value || "");
}

document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view as ViewName));
});
document.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.jump as ViewName));
});

function setState(next: DemoState, message = "") {
  state = next;
  $("stateBadge").textContent = next;
  $("actionMessage").textContent = message;
  document.querySelectorAll<HTMLLIElement>(".steps li").forEach((item) => {
    item.classList.toggle("current", item.dataset.step === next);
    const order = ["REGISTERING","ENCRYPTING","SEALED","WAITING","REVEALING","VERIFIED"];
    const currentIndex = order.indexOf(next);
    const itemIndex = order.indexOf(item.dataset.step || "");
    item.classList.toggle("complete", currentIndex > itemIndex || ["VERIFIED","EXECUTING","EXECUTED"].includes(next));
  });
}

function getProvider(): SolanaProvider | null {
  return window.phantom?.solana ?? window.solana ?? null;
}

async function connectWallet() {
  const provider = getProvider();
  if (!provider) throw new Error("No Solana wallet detected. Install Phantom or another compatible wallet.");
  const result = await provider.connect();
  walletProvider = provider;
  walletAddress = result.publicKey.toString();
  ($<HTMLInputElement>("trader")).value = walletAddress;
  walletButton.textContent = `${walletAddress.slice(0,4)}…${walletAddress.slice(-4)}`;
  walletButton.classList.add("connected");
  updateSettlementAvailability();
}

function updateSettlementAvailability() {
  if (state !== "VERIFIED" || !revealed) return;
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

function decodeBase64Transaction(value: string): Transaction | VersionedTransaction {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  try { return VersionedTransaction.deserialize(bytes); }
  catch { return Transaction.from(bytes); }
}

async function settleVerifiedIntent() {
  if (!revealed || !envelope) throw new Error("No verified intent is ready for settlement.");
  if (!walletProvider || !walletAddress) await connectWallet();
  if (!walletProvider || !walletAddress) throw new Error("Wallet connection failed.");

  setState("EXECUTING", "Preparing Mary Jane transaction…");
  patchHistory(envelope.commitment, { status: "EXECUTING" });
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
      cluster: runtimeConfig.solanaCluster,
    }),
  });

  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Mary Jane order preparation failed.");

  const transactionBase64 = body.transactionBase64;
  if (typeof transactionBase64 !== "string" || !transactionBase64) throw new Error("Mary Jane did not return an unsigned transaction.");

  setState("EXECUTING", "Approve the transaction in your wallet…");
  settleButton.textContent = "Approve in wallet";
  const transaction = decodeBase64Transaction(transactionBase64);
  const sent = await walletProvider.signAndSendTransaction(transaction);
  const signature = typeof sent === "string" ? sent : sent.signature;
  if (!signature) throw new Error("Wallet did not return a signature.");

  setState("EXECUTING", "Transaction submitted. Waiting for Solana confirmation…");
  settleButton.textContent = "Confirming…";

  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const result = await solana.getSignatureStatus(signature, { searchTransactionHistory: true });
    if (result.value?.err) throw new Error("Solana transaction failed.");
    if (["confirmed","finalized"].includes(result.value?.confirmationStatus || "")) {
      setState("EXECUTED", `Mary Jane settlement confirmed on Solana ${runtimeConfig.solanaCluster}.`);
      $("settlementStatus").textContent = `Confirmed on Solana ${runtimeConfig.solanaCluster}`;
      settleButton.textContent = "Settled";
      settleButton.disabled = true;
      solanaProofLink.href = runtimeConfig.solanaCluster === "mainnet-beta"
        ? `https://explorer.solana.com/tx/${signature}`
        : `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      solanaProofLink.classList.remove("hidden");
      patchHistory(envelope.commitment, { status: "EXECUTED", signature });
      renderStats();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Settlement submitted but confirmation timed out. Check explorer before retrying.");
}

function renderEnvelope() {
  if (!envelope) return;
  $("commitment").textContent = envelope.commitment;
  $("identity").textContent = envelope.shutter.identity;
  $("eon").textContent = String(envelope.shutter.eon);
  $("revealTime").textContent = new Date(envelope.revealAt * 1000).toLocaleString();
  $("ciphertext").textContent = envelope.ciphertext;
  copyProof.disabled = false;
  renderStats();
}

function updateCountdown() {
  if (!envelope) return;
  const now = Math.floor(Date.now()/1000);
  const left = Math.max(0, envelope.revealAt - now);
  $("countdownText").textContent = left > 0 ? `${left}s until reveal` : "Reveal condition reached";
  if (left === 0 && ["SEALED","WAITING"].includes(state)) void attemptReveal();
}

function beginPolling() {
  if (countdownTimer) window.clearInterval(countdownTimer);
  if (revealTimer) window.clearInterval(revealTimer);
  countdownTimer = window.setInterval(updateCountdown, 1000);
  revealTimer = window.setInterval(() => {
    if (envelope && Math.floor(Date.now()/1000) >= envelope.revealAt && state !== "VERIFIED" && state !== "EXECUTED") {
      void attemptReveal();
    }
  }, 4000);
}

async function attemptReveal() {
  if (!envelope || ["REVEALING","VERIFIED","EXECUTING","EXECUTED"].includes(state)) return;
  const now = Math.floor(Date.now()/1000);
  if (now < envelope.revealAt) return;

  setState("REVEALING", "Requesting threshold decryption key from Shutter…");

  try {
    const key = await shutter.getDecryptionKey(envelope.shutter.identity);
    revealed = await decryptConfidentialIntent(envelope, key.decryption_key);
    const verification = await verifyRevealedIntent(envelope, revealed, now);
    if (!verification.ok) throw new Error(`${verification.code}: ${verification.reason}`);

    setState("VERIFIED", "Threshold reveal complete. Commitment integrity verified.");
    $("verifyBadge").textContent = "VERIFIED";
    $("verifyBadge").classList.add("ok");
    $("lockedState").classList.add("hidden");
    $("revealedState").classList.remove("hidden");
    $("revealedOutcome").textContent = revealed.outcome;
    $("revealedAction").textContent = revealed.action;
    $("revealedPrice").textContent = revealed.priceBps != null ? `${revealed.priceBps} bps` : "Market";
    $("revealedQuantity").textContent = revealed.quantityBaseUnits;
    patchHistory(envelope.commitment, { status: "VERIFIED", intent: revealed });
    updateSettlementAvailability();
    if (revealTimer) window.clearInterval(revealTimer);
  } catch (error) {
    if (error instanceof ShutterApiError && (error.status === 404 || error.retryable)) {
      setState("WAITING", "Reveal condition reached; waiting for Shutter key availability…");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    setState("ERROR", message);
    if (envelope) patchHistory(envelope.commitment, { status: "ERROR", error: message });
  }
}

sealButton.addEventListener("click", async () => {
  if (!["IDLE","ERROR","VERIFIED","EXECUTED"].includes(state)) return;
  sealButton.disabled = true;
  sealButton.textContent = "Registering with Shutter…";
  $("verifyBadge").textContent = "LOCKED";
  $("verifyBadge").classList.remove("ok");
  $("lockedState").classList.remove("hidden");
  $("revealedState").classList.add("hidden");
  solanaProofLink.classList.add("hidden");

  try {
    const now = Math.floor(Date.now()/1000);
    const delay = Math.max(15, Number(($<HTMLInputElement>("delay")).value || 45));
    const revealAt = now + delay;

    intent = {
      version: 1,
      application: "maryjane",
      sourceChain: `solana:${runtimeConfig.solanaCluster}`,
      settlementAdapter: "maryjane-solana-v1",
      market: ($<HTMLInputElement>("market")).value.trim(),
      trader: ($<HTMLInputElement>("trader")).value.trim(),
      kind: "LIMIT_ORDER",
      action: ($<HTMLSelectElement>("action")).value as "BUY"|"SELL",
      outcome: ($<HTMLSelectElement>("outcome")).value,
      priceBps: Number(($<HTMLInputElement>("price")).value),
      quantityBaseUnits: ($<HTMLInputElement>("quantity")).value.trim(),
      collateralAsset: "USDG",
      allowPartialFill: true,
      nonce: createIntentNonce(),
      createdAt: now,
      revealAt,
      expiresAt: revealAt + 300,
      metadata: { protocol: "33hoxo", reference: "maryjane" },
    };

    setState("REGISTERING", "Creating timed Shutter identity on ${runtimeConfig.shutterNetwork === "gnosis" ? "Gnosis" : "Chiado"}…");
    const identityPrefix = randomHex(32);
    const registration = await shutter.registerTimeIdentity({ decryptionTimestamp: revealAt, identityPrefix });

    setState("ENCRYPTING", "Identity registered. Encrypting canonical intent locally…");
    envelope = await encryptConfidentialIntent({
      intent,
      network: runtimeConfig.shutterNetwork,
      encryptionData: {
        eon: registration.eon,
        eonKey: registration.eon_key,
        identity: registration.identity,
        identityPrefix: registration.identity_prefix,
        epochId: registration.epoch_id,
      },
    });

    setState("SEALED", "Real Shutter ciphertext created.");
    upsertHistory({
      commitment: envelope.commitment,
      envelope,
      status: "SEALED",
      createdAt: now,
      updatedAt: now,
    });
    renderEnvelope();
    updateCountdown();
    beginPolling();
    window.setTimeout(() => {
      if (state === "SEALED") {
        setState("WAITING", "Ciphertext sealed. Waiting for threshold reveal.");
        if (envelope) patchHistory(envelope.commitment, { status: "WAITING" });
      }
    }, 700);
  } catch (error) {
    setState("ERROR", error instanceof Error ? error.message : String(error));
  } finally {
    sealButton.disabled = false;
    sealButton.textContent = "Seal another intent";
  }
});

copyProof.addEventListener("click", async () => {
  if (!envelope) return;
  await navigator.clipboard.writeText(JSON.stringify({
    protocol: "33hoxo",
    commitment: envelope.commitment,
    ciphertext: envelope.ciphertext,
    shutter: envelope.shutter,
    revealAt: envelope.revealAt,
  }, null, 2));
  copyProof.textContent = "Copied";
  window.setTimeout(() => { copyProof.textContent = "Copy proof"; }, 1000);
});

walletButton.addEventListener("click", async () => {
  try { await connectWallet(); $("actionMessage").textContent = "Solana wallet connected."; }
  catch (error) { $("actionMessage").textContent = error instanceof Error ? error.message : String(error); }
});

settleButton.addEventListener("click", async () => {
  try { await settleVerifiedIntent(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setState("ERROR", message);
    $("settlementStatus").textContent = "Settlement failed";
    settleButton.disabled = false;
    settleButton.textContent = "Retry settlement";
    if (envelope) patchHistory(envelope.commitment, { status: "ERROR", error: message });
  }
});

$<HTMLInputElement>("explorerSearch").addEventListener("input", (event) => {
  renderHistory((event.target as HTMLInputElement).value);
});
$<HTMLButtonElement>("clearHistory").addEventListener("click", () => {
  if (confirm("Clear local 33HOXO intent history from this browser?")) setHistory([]);
});
$<HTMLButtonElement>("proofLookup").addEventListener("click", () => {
  renderProof(($<HTMLInputElement>("proofSearch")).value);
});

void (async () => {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (response.ok) {
      runtimeConfig = await response.json() as RuntimeConfig;
      shutter = new ShutterApiClient({
        network: runtimeConfig.shutterNetwork,
        fetchImpl: shutterProxyFetch,
      });
      solana = new Connection(
        runtimeConfig.solanaCluster === "mainnet-beta"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com",
        "confirmed",
      );

      const networkLabel = runtimeConfig.shutterNetwork === "gnosis" ? "Gnosis" : "Chiado";
      $("runtimeLabel").textContent =
        `Protocol v1 · Solana ${runtimeConfig.solanaCluster}`;
      $("shutterNetworkName").textContent = networkLabel;

      if (runtimeConfig.solanaCluster === "mainnet-beta" && !runtimeConfig.mainnetEnabled) {
        $("settlementStatus").textContent = "Mainnet beta disabled by safety policy";
      }
    }
  } catch {
    // Keep safe staging defaults if runtime configuration is unavailable.
  }

  const provider = getProvider();
  if (provider) {
    try {
      const trusted = await provider.connect({ onlyIfTrusted: true });
      walletProvider = provider;
      walletAddress = trusted.publicKey.toString();
      ($<HTMLInputElement>("trader")).value = walletAddress;
      walletButton.textContent = `${walletAddress.slice(0,4)}…${walletAddress.slice(-4)}`;
      walletButton.classList.add("connected");
    } catch {}
  }

  try {
    await shutter.checkAuthentication();
    shutterReachable = true;
    $("networkStatus").innerHTML = "<i></i> ${runtimeConfig.shutterNetwork === "gnosis" ? "Shutter Gnosis" : "Shutter Chiado"} · reachable";
    $("sideNetwork").innerHTML = "<i></i> Chiado reachable";
  } catch {
    $("networkStatus").innerHTML = "<i></i> ${runtimeConfig.shutterNetwork === "gnosis" ? "Shutter Gnosis" : "Shutter Chiado"} · unavailable";
    $("sideNetwork").innerHTML = "<i></i> Chiado unavailable";
  }
  renderStats();
})();

setState("IDLE");
renderStats();
renderHistory();
switchView("overview");
