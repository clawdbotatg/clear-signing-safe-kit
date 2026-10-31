import { clearBundle } from "./clear.js";
import { SIM_DEFAULT, simulate } from "./sim.js";
export const WEDGIE_LINE = 3000; // a safe_sign line over this sends its data in pieces first (a real wedgie, 10-28: a 3.4 KB line, MemoryError)
export const WEDGIE_DATA_MAX = 8000; // bytes of tx data Safe Signer takes
// hex chars per piece at most, whatever its hello says (safe_chunk 4000): a real wedgie's heap is broken into holes and
// a 4 KB line didn't fit when the third piece of a swap's bundle came (10-30, safe-49: MemoryError, it answered "bad json")
export const WEDGIE_CHUNK = 2000;
export async function wedgieSign(o) {
    const { ask, hello: h, tx } = o;
    const chunk = Math.min(h.safe_chunk || 0, o.chunk || WEDGIE_CHUNK) || 0;
    const raw = o.askRaw && h.safe_raw ? Math.min(h.safe_raw, 4096) * 2 : 0; // hex chars per raw piece
    const step = raw || chunk;
    const lineMax = o.lineMax ?? WEDGIE_LINE;
    const n = (tx.data.length - 2) / 2;
    const fits = (t) => JSON.stringify({ id: 1000, type: "safe_sign", tx: t }).length <= lineMax;
    if (!fits(tx) && !step)
        throw new Error("This transaction is too big for your wedgie's Safe Signer. Update it at wedgie.dev, then try again.");
    if (!fits(tx) && n > WEDGIE_DATA_MAX)
        throw new Error(`This transaction is too big for a wedgie (${n} bytes; it takes up to ${WEDGIE_DATA_MAX}).`);
    const fail = (a, what) => new Error(`Your wedgie didn't take ${what}: ${a?.error || a?.type || "no answer"}`);
    const asked = (m, ms) => ask(m, ms).catch((e) => ({ type: "error", error: e?.message }));
    // hex in pieces: raw bytes after each line, or hex in it. first: what the first piece also says.
    const pieces = async (type, hex, first, what, p0, p1) => {
        for (let at = 0; at < hex.length; at += step) {
            const part = hex.slice(at, at + step);
            const m = { type, at: at / 2, ...(at ? {} : first) };
            const a = raw
                ? await o.askRaw({ ...m, raw: part.length / 2 }, hexBytes(part), 20_000).catch((e) => ({ type: "error", error: e?.message }))
                : await asked({ ...m, hex: part }, 20_000);
            if (a?.type !== type)
                throw fail(a, what);
            o.progress?.(p0 + ((p1 - p0) * Math.min(at + step, hex.length)) / hex.length);
        }
    };
    // what the ERC-7730 registry says about its calls, sent ahead: the wedgie checks it against its own roots. The
    // first piece says the whole size (n): Safe Signer reserves one block for it then.
    const cb = h.safe_clear && step ? await clearBundle(h.safe_clear, tx.chainId, tx, h.safe_review || 0).catch(() => null) : null;
    if (cb)
        await pieces("safe_clear", cb, { n: cb.length / 2 }, "what this transaction does", 0, 0.3);
    // what it does to the coins, signed by clear-sim with a nonce the wedgie just picked (it checks the signature
    // against its own list). None (offline, too big): the wedgie shows the usual pages.
    let sim = null;
    if (h.safe_sim === "p256") {
        const nn = await asked({ type: "safe_nonce" }, 5000);
        if (nn?.type === "safe_nonce")
            sim = await simulate({ chain: tx.chainId, safe: tx.safe, tx: { to: tx.to, value: BigInt(tx.value), data: tx.data, operation: tx.operation },
                url: o.simUrl || SIM_DEFAULT, nonce: nn.nonce, check: false, timeout: 15_000 }).catch(() => null);
    }
    let send = sim ? { ...tx, sim } : tx;
    if (!fits(send)) {
        if (!step)
            send = tx; // an old app: no pieces, so no room for the simulation
        else {
            await pieces("safe_data", tx.data.slice(2), {}, "the transaction", 0.3, 1);
            send = { ...send, data: "@" };
        }
    }
    o.press?.();
    return ask({ type: "safe_sign", tx: send, ...(o.fresh ? { fresh: 1 } : {}) }, 300_000); // a big one takes the wedgie a while to hash
}
const hexBytes = (h) => Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16));
