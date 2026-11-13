/** Safe's MultiSendCallOnly 1.4.1: a batch of plain calls, run as a delegatecall (operation 1). Same address on every chain. */
export const MULTISEND_CALL_ONLY = "0x9641d764fc13c8b624c04430c7356c1c7c8102e2";
export const MULTISEND_SELECTOR = "0x8d80ff0a";
const eq = (a, b) => a.toLowerCase() === b.toLowerCase();
const word = (n, bytes = 32) => BigInt(n).toString(16).padStart(bytes * 2, "0");
/**
 * The calls in a multiSend(bytes) calldata: operation, to, value, data each. Throws on a batch it can't read.
 * Reads it only the way it's always written (audit 11-13): the offset word is 0x20, the length is exactly what's
 * there, the padding is zeros, each entry fits, each operation is 0 or 1. MultiSend itself follows the offset word, so
 * a reader that took the calls from a fixed place could be shown a decoy while the chain ran the calls further on.
 */
export function unbatch(data) {
    const h = data.replace(/^0x/i, "").toLowerCase();
    if (!/^([0-9a-f]{2})*$/.test(h))
        throw new Error("bad multiSend hex");
    if (!h.startsWith(MULTISEND_SELECTOR.slice(2)) || h.length < 136)
        throw new Error("not a multiSend");
    if (BigInt("0x" + h.slice(8, 72)) !== 32n)
        throw new Error("bad multiSend offset");
    const bytes = BigInt("0x" + h.slice(72, 136));
    if (bytes > BigInt(h.length))
        throw new Error("bad multiSend length");
    const n = Number(bytes) * 2;
    if (h.length !== 136 + Math.ceil(n / 64) * 64)
        throw new Error("bad multiSend length"); // nothing missing, nothing extra
    if (/[^0]/.test(h.slice(136 + n)))
        throw new Error("bad multiSend padding");
    const p = h.slice(136, 136 + n);
    const out = [];
    let o = 0;
    while (o < p.length) {
        if (o + 170 > p.length)
            throw new Error("bad multiSend");
        const operation = parseInt(p.slice(o, o + 2), 16);
        if (operation > 1)
            throw new Error("bad multiSend operation");
        const size = BigInt("0x" + p.slice(o + 106, o + 170));
        if (size > BigInt(p.length))
            throw new Error("bad multiSend");
        const len = Number(size) * 2;
        if (o + 170 + len > p.length)
            throw new Error("bad multiSend");
        out.push({ operation, to: "0x" + p.slice(o + 2, o + 42), value: BigInt("0x" + p.slice(o + 42, o + 106)), data: ("0x" + p.slice(o + 170, o + 170 + len)) });
        o += 170 + len;
    }
    if (!out.length)
        throw new Error("empty multiSend");
    return out;
}
/** multiSend(bytes) calldata for these plain calls. */
export function batch(calls) {
    const packed = calls.map(c => "00" + c.to.slice(2).toLowerCase() + word(c.value) + word((c.data.length - 2) / 2) + c.data.slice(2)).join("");
    const pad = "0".repeat((64 - (packed.length % 64)) % 64);
    return (MULTISEND_SELECTOR + word(32) + word(packed.length / 2) + packed + pad);
}
/** The Safe tx for these calls: one call as itself, several as a MultiSendCallOnly batch. */
export function asSafeTx(calls) {
    if (calls.length === 1)
        return { ...calls[0], operation: 0 };
    return { to: MULTISEND_CALL_ONLY, value: 0n, data: batch(calls), operation: 1 };
}
/** The calls a Safe tx makes: our plain batch opened up, else the tx as one call. A delegatecall to anything else
 * isn't opened (danger.ts says what it means). */
export function callsOf(tx) {
    if (tx.operation === 1 && eq(tx.to, MULTISEND_CALL_ONLY)) {
        try {
            return unbatch(tx.data);
        }
        catch {
            return [];
        }
    }
    return [{ to: tx.to, value: tx.value, data: tx.data, operation: tx.operation }];
}
