import { MULTISEND_CALL_ONLY, type SafeTxLike, callsOf, unbatch } from "./multisend.js";

/**
 * What in a Safe tx could take everything, in plain words. Empty: nothing found. Both apps show these red, above
 * everything else, and never hide them behind a simulation that looks fine.
 *   - a delegatecall that isn't our plain MultiSendCallOnly batch: that contract runs any code as the Safe
 *   - a call to the Safe itself that adds a module, sets a guard or a fallback handler
 * known: modules the app put there itself (a recovery module, a daily limit), lowercase; those aren't warned.
 */
export function dangers(safe: string, tx: SafeTxLike, known: string[] = []): string[] {
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const out: string[] = [];
  if (tx.operation === 1) {
    if (!eq(tx.to, MULTISEND_CALL_ONLY)) return [`Lets ${short(tx.to)} run any code as your wallet. It could take everything. Only sign if you know exactly why.`];
    let inner;
    try {
      inner = unbatch(tx.data);
    } catch {
      return ["A batch that can't be read. Don't sign it."];
    }
    if (!inner.length || inner.some(c => c.operation !== 0)) return ["A batch that runs code as your wallet. It could take everything. Don't sign it."];
  }
  for (const c of callsOf(tx)) {
    if (!eq(c.to, safe)) continue;
    const sel = c.data.slice(0, 10).toLowerCase();
    const arg = (i: number) => "0x" + c.data.slice(10 + 64 * i + 24, 10 + 64 * (i + 1));
    if (sel === "0x610b5925" && !known.includes(arg(0).toLowerCase())) out.push(`Adds ${short(arg(0))} as a module: it could move everything, with no signatures.`);
    if (sel === "0xe19a9dd9" && !/^0x0{40}$/.test(arg(0))) out.push(`Sets ${short(arg(0))} as a guard: it can block every transaction.`);
    if (sel === "0xf08a0323") out.push(`Sets ${short(arg(0))} to answer for your wallet (fallback handler).`);
  }
  return out;
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
