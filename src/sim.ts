import { formatUnits } from "viem";
import type { SafeTxLike } from "./multisend.js";

/**
 * clear-sim (github.com/clawdbotatg/clear-sim, SPEC.md): runs a Safe tx on the latest block and signs what goes in and
 * out with its P-256 key. Asked from the browser, so anyone can point their wallet at their own simulator. A page
 * checks each answer against the key that simulator gave the first time this browser used it (pinned per URL); the
 * wedgie checks it against its own list instead (pass the wedgie's nonce, check: false).
 */
export const SIM_DEFAULT = "https://sim.wedgie.dev";

export type Change = { token: string; symbol: string; decimals: number; amount: string; usd: string };
export type SimAnswer = { block: number; ok: "ok" | "reverts"; tx: string; changes: Change[]; nonce: string; sig: string; r: string; s: string };
export type SimKey = { x: string; y: string };
/** One coin moved: formatted amount (no sign), dollars (no sign) when priced. */
export type Move = { token: string; symbol: string; amount: string; usd?: number };
export type Moves = { pay: Move[]; get: Move[]; fails?: string; block?: number };

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)));
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const clean = (u: string) => u.replace(/\/+$/, "");

/** clear-sim's tx hash: what the answer is about (SPEC.md). */
export function simTxHash(safe: string, t: SafeTxLike) {
  return sha256(`${safe.toLowerCase()}\n${t.to.toLowerCase()}\n${t.value}\n${t.data.toLowerCase()}${t.operation ? "\n1" : ""}`);
}

/** A simulator's public key, as it says it (GET /). */
export async function simKey(url: string): Promise<SimKey & { name?: string }> {
  const k = await fetch(clean(url), { signal: AbortSignal.timeout(10_000) }).then(r => r.json());
  if (!/^[0-9a-f]{64}$/.test(k?.x) || !/^[0-9a-f]{64}$/.test(k?.y)) throw new Error("simulator: no key");
  return k;
}

/** The key pinned for this simulator in this browser (localStorage[store]), pinned now if it's the first time. A
 * changed key = a different simulator: its answers fail the check. */
export async function pinnedKey(url: string, store = "csk.simKeys"): Promise<SimKey> {
  url = clean(url);
  let pins: Record<string, SimKey> = {};
  try {
    pins = JSON.parse(localStorage.getItem(store) || "{}");
  } catch {}
  if (pins[url]) return pins[url];
  const k = await simKey(url);
  pins[url] = { x: k.x, y: k.y };
  try {
    localStorage.setItem(store, JSON.stringify(pins));
  } catch {}
  return pins[url];
}

/** Is this answer about our tx and nonce, signed by key? (SPEC.md "Checking it") */
export async function checkAnswer(a: SimAnswer, key: SimKey, chain: number, tx: string, nonce: string) {
  if (a.tx !== tx || a.nonce !== nonce) return false;
  const text = ["clear-sim v1", nonce, chain, tx, a.block, a.ok, ...a.changes.map(c => [c.token, c.symbol, c.decimals, c.amount, c.usd].join(","))].join("\n");
  const b64 = (h: string) => btoa(String.fromCharCode(...bytes(h))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const k = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: b64(key.x), y: b64(key.y) }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, bytes(a.r + a.s), new TextEncoder().encode(text));
}

/**
 * Run a Safe tx on the simulator. nonce: the wedgie's, when it will check the answer itself (then pass check: false);
 * else a fresh one. key: the key to check against (default: the one pinned for url). null: no answer we can trust.
 */
export async function simulate(o: { chain: number; safe: string; tx: SafeTxLike; url?: string; nonce?: string; key?: SimKey; check?: boolean; store?: string; timeout?: number }): Promise<SimAnswer | null> {
  const url = clean(o.url || SIM_DEFAULT);
  const nonce = o.nonce ?? hex(crypto.getRandomValues(new Uint8Array(16)));
  const t = o.tx;
  const check = o.check !== false;
  const [k, a] = await Promise.all([
    check ? (o.key ? Promise.resolve(o.key) : pinnedKey(url, o.store)) : Promise.resolve(null),
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: o.chain, from: o.safe.toLowerCase(), to: t.to.toLowerCase(), value: t.value.toString(), data: t.data.toLowerCase(), nonce, ...(t.operation ? { operation: 1 } : {}) }),
      signal: AbortSignal.timeout(o.timeout ?? 20_000),
    }).then(r => r.json() as Promise<SimAnswer>),
  ]);
  if (!a?.r) return null;
  if (k && !(await checkAnswer(a, k, o.chain, await simTxHash(o.safe, t), nonce))) return null;
  return a;
}

/** The answer as coins out and in. fees: what the tx pays a relay, per token (lowercase address, "eth" = the coin),
 * taken out of pay (shown on its own line). */
export function moves(a: Pick<SimAnswer, "ok" | "block" | "changes">, fees: Record<string, bigint> = {}): Moves {
  if (a.ok !== "ok") return { pay: [], get: [], fails: "reverts", block: a.block };
  const pay: Move[] = [];
  const get: Move[] = [];
  for (const c of a.changes) {
    let n = BigInt(c.amount);
    const all = n;
    const fee = fees[c.token] ?? 0n;
    if (n < 0n && fee) n += fee > -n ? -n : fee;
    if (n === 0n) continue;
    const usd = c.usd === "" ? undefined : Math.abs(Number(c.usd) * (all ? Number(n) / Number(all) : 1));
    const abs = n < 0n ? -n : n;
    (n < 0n ? pay : get).push({ token: c.token, symbol: c.symbol, amount: c.decimals >= 0 ? formatUnits(abs, c.decimals) : abs.toString(), usd });
  }
  return { pay, get, block: a.block };
}
