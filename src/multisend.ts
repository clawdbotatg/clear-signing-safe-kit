/** Safe's MultiSendCallOnly 1.4.1: a batch of plain calls, run as a delegatecall (operation 1). Same address on every chain. */
export const MULTISEND_CALL_ONLY = "0x9641d764fc13c8b624c04430c7356c1c7c8102e2";
export const MULTISEND_SELECTOR = "0x8d80ff0a";

export type Hex = `0x${string}`;
export type Call = { to: string; value: bigint; data: Hex };
export type Inner = Call & { operation: number };
export type SafeTxLike = { to: string; value: bigint; data: Hex; operation: number };

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const word = (n: bigint | number, bytes = 32) => BigInt(n).toString(16).padStart(bytes * 2, "0");

/** The calls in a multiSend(bytes) calldata: operation, to, value, data each. Throws on a batch it can't read. */
export function unbatch(data: string): Inner[] {
  const h = data.replace(/^0x/, "").toLowerCase();
  if (!h.startsWith(MULTISEND_SELECTOR.slice(2))) throw new Error("not a multiSend");
  const n = parseInt(h.slice(72, 136), 16) * 2;
  const p = h.slice(136, 136 + n);
  if (p.length !== n) throw new Error("short multiSend");
  const out: Inner[] = [];
  let o = 0;
  while (o < p.length) {
    if (o + 170 > p.length) throw new Error("bad multiSend");
    const len = parseInt(p.slice(o + 106, o + 170), 16) * 2;
    if (o + 170 + len > p.length) throw new Error("bad multiSend");
    out.push({ operation: parseInt(p.slice(o, o + 2), 16), to: "0x" + p.slice(o + 2, o + 42), value: BigInt("0x" + p.slice(o + 42, o + 106)), data: ("0x" + p.slice(o + 170, o + 170 + len)) as Hex });
    o += 170 + len;
  }
  return out;
}

/** multiSend(bytes) calldata for these plain calls. */
export function batch(calls: Call[]): Hex {
  const packed = calls.map(c => "00" + c.to.slice(2).toLowerCase() + word(c.value) + word((c.data.length - 2) / 2) + c.data.slice(2)).join("");
  const pad = "0".repeat((64 - (packed.length % 64)) % 64);
  return (MULTISEND_SELECTOR + word(32) + word(packed.length / 2) + packed + pad) as Hex;
}

/** The Safe tx for these calls: one call as itself, several as a MultiSendCallOnly batch. */
export function asSafeTx(calls: Call[]): SafeTxLike {
  if (calls.length === 1) return { ...calls[0], operation: 0 };
  return { to: MULTISEND_CALL_ONLY, value: 0n, data: batch(calls), operation: 1 };
}

/** The calls a Safe tx makes: our plain batch opened up, else the tx as one call. A delegatecall to anything else
 * isn't opened (danger.ts says what it means). */
export function callsOf(tx: SafeTxLike): Inner[] {
  if (tx.operation === 1 && eq(tx.to, MULTISEND_CALL_ONLY)) {
    try {
      return unbatch(tx.data);
    } catch {
      return [];
    }
  }
  return [{ to: tx.to, value: tx.value, data: tx.data, operation: tx.operation }];
}
