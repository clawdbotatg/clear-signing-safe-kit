import { clearBundle } from "./clear.js";
import { SIM_DEFAULT, simulate } from "./sim.js";

/**
 * A Safe tx to the wedgie's Safe Signer (clawdbotatg/wedgie-safe), the one way Instant Wallet and wedgie.dev both send
 * it: the clear-signing bundle in pieces, a clear-sim answer asked with the wedgie's own nonce, the data in pieces when
 * the line is too long, then safe_sign. Returns the wedgie's answer to safe_sign (safe_sig, refused or error): the
 * caller checks the hash and makes the signatures. ask: one request on the wedgie's line (USB serial or the drive).
 */
export type WedgieAsk = (msg: Record<string, unknown>, ms: number) => Promise<any>;
export type WedgieTx = {
  chainId: number; safe: string; to: string; value: string; data: string; operation: number; safeTxGas: string;
  baseGas: string; gasPrice: string; gasToken: string; refundReceiver: string; nonce: number;
};
/** What its hello said: safe_chunk (hex chars per piece; none: an app too old for pieces), safe_clear (the clear-signing
 * data it trusts), safe_sim ("p256": it checks a simulation), safe_review (the review round it saved). */
export type WedgieHello = { safe_chunk?: number; safe_clear?: string | null; safe_sim?: string; safe_review?: number };

export const WEDGIE_LINE = 3000; // a safe_sign line over this sends its data in pieces first (a real wedgie, 10-28: a 3.4 KB line, MemoryError)
export const WEDGIE_DATA_MAX = 8000; // bytes of tx data Safe Signer takes

export async function wedgieSign(o: {
  ask: WedgieAsk;
  hello: WedgieHello;
  tx: WedgieTx;
  /** smaller pieces and lines (the phone's drive) */
  chunk?: number;
  lineMax?: number;
  simUrl?: string;
  /** 0..1 while pieces go over; press: the question is up on the wedgie */
  progress?: (p: number) => void;
  press?: () => void;
}): Promise<any> {
  const { ask, hello: h, tx } = o;
  const chunk = Math.min(h.safe_chunk || 0, o.chunk || Infinity) || 0;
  const lineMax = o.lineMax ?? WEDGIE_LINE;
  const n = (tx.data.length - 2) / 2;
  const fits = (t: object) => JSON.stringify({ id: 1000, type: "safe_sign", tx: t }).length <= lineMax;
  if (!fits(tx) && !chunk) throw new Error("This transaction is too big for your wedgie's Safe Signer. Update it at wedgie.dev, then try again.");
  if (!fits(tx) && n > WEDGIE_DATA_MAX) throw new Error(`This transaction is too big for a wedgie (${n} bytes; it takes up to ${WEDGIE_DATA_MAX}).`);
  const fail = (a: any, what: string) => new Error(`Your wedgie didn't take ${what}: ${a?.error || a?.type || "no answer"}`);
  const asked = (m: Record<string, unknown>, ms: number) => ask(m, ms).catch((e: Error) => ({ type: "error", error: e?.message }));

  // what the ERC-7730 registry says about its calls, sent ahead: the wedgie checks it against its own roots. The
  // first piece says the whole size (n): Safe Signer reserves one block for it then.
  const cb = h.safe_clear && chunk ? await clearBundle(h.safe_clear, tx.chainId, tx, h.safe_review || 0).catch(() => null) : null;
  for (let at = 0; cb && at < cb.length; at += chunk) {
    const a = await asked({ type: "safe_clear", at: at / 2, hex: cb.slice(at, at + chunk), ...(at ? {} : { n: cb.length / 2 }) }, 20_000);
    if (a?.type !== "safe_clear") throw fail(a, "what this transaction does");
    o.progress?.((0.3 * (at + chunk)) / cb.length);
  }
  // what it does to the coins, signed by clear-sim with a nonce the wedgie just picked (it checks the signature
  // against its own list). None (offline, too big): the wedgie shows the usual pages.
  let sim = null;
  if (h.safe_sim === "p256") {
    const nn = await asked({ type: "safe_nonce" }, 5000);
    if (nn?.type === "safe_nonce")
      sim = await simulate({ chain: tx.chainId, safe: tx.safe, tx: { to: tx.to, value: BigInt(tx.value), data: tx.data as `0x${string}`, operation: tx.operation },
        url: o.simUrl || SIM_DEFAULT, nonce: nn.nonce, check: false, timeout: 15_000 }).catch(() => null);
  }
  let send: Record<string, unknown> = sim ? { ...tx, sim } : tx;
  if (!fits(send)) {
    if (!chunk) send = tx; // an old app: no pieces, so no room for the simulation
    else {
      const hex = tx.data.slice(2);
      for (let i = 0; i < hex.length; i += chunk) {
        const a = await asked({ type: "safe_data", at: i / 2, hex: hex.slice(i, i + chunk) }, 20_000);
        if (a?.type !== "safe_data") throw fail(a, "the transaction");
        o.progress?.(0.3 + (0.7 * Math.min(i + chunk, hex.length)) / hex.length);
      }
      send = { ...send, data: "@" };
    }
  }
  o.press?.();
  return ask({ type: "safe_sign", tx: send }, 300_000); // a big one takes the wedgie a while to hash
}
