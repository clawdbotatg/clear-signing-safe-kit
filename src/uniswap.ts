import { type Hex, decodeAbiParameters, decodeFunctionData, formatUnits, parseAbi, parseAbiParameters, zeroAddress } from "viem";

/**
 * A Uniswap Universal Router call (execute) in words: what goes in, what comes out, from its own commands. The V2, V3
 * and V4 swaps, and WETH (un)wrapping so "WETH" out reads as the native coin. Token names come from `token`.
 * null: no swap in it we can read. The minimum often sits after the swap (UNWRAP_WETH, SWEEP, V4 TAKE_ALL), not on it.
 */
export type Tok = { symbol: string; decimals: number } | null;
const ur = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline)", "function execute(bytes commands, bytes[] inputs)"]);
const POOLKEY = "(address,address,uint24,int24,address)";

type Leg = { tin: string; tout: string; amt: bigint; lim: bigint; exactIn: boolean };

/** The tokens at each end of a V3 path (20-byte token, 3-byte fee, 20-byte token, …). */
const v3ends = (p: Hex): [string, string] => ["0x" + p.slice(2, 42), "0x" + p.slice(-40)];

function legs(commands: Hex, inputs: readonly Hex[]): { legs: Leg[]; unwrap: boolean; wrap: boolean; min: bigint } {
  const out: Leg[] = [];
  let min = 0n; // a minimum checked after the swap (UNWRAP_WETH, SWEEP, V4 TAKE_ALL): routes often swap with 0 and check here
  let unwrap = false;
  let wrap = false;
  const cmds = commands.slice(2).match(/../g) ?? [];
  cmds.forEach((c, i) => {
    const t = parseInt(c, 16) & 0x3f;
    const d = inputs[i];
    try {
      if (t === 0x00 || t === 0x01) {
        const [, a, b, path] = decodeAbiParameters(parseAbiParameters("address, uint256, uint256, bytes, bool"), d);
        const [x, y] = v3ends(path);
        out.push(t === 0x00 ? { tin: x, tout: y, amt: a, lim: b, exactIn: true } : { tin: y, tout: x, amt: a, lim: b, exactIn: false });
      } else if (t === 0x08 || t === 0x09) {
        const [, a, b, path] = decodeAbiParameters(parseAbiParameters("address, uint256, uint256, address[], bool"), d);
        out.push({ tin: path[0], tout: path[path.length - 1], amt: a, lim: b, exactIn: t === 0x08 });
      } else if (t === 0x0b) wrap = true;
      else if (t === 0x0c) {
        unwrap = true;
        const [, m] = decodeAbiParameters(parseAbiParameters("address, uint256"), d);
        if (m > min) min = m;
      } else if (t === 0x04) {
        const [, , m] = decodeAbiParameters(parseAbiParameters("address, address, uint256"), d);
        if (m > min) min = m;
      }
      else if (t === 0x10) {
        const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), d);
        (actions.slice(2).match(/../g) ?? []).forEach((a, j) => {
          const k = parseInt(a, 16);
          const p = params[j];
          if (k === 0x06 || k === 0x08) {
            const [[key, zeroForOne, x, y]] = decodeAbiParameters(parseAbiParameters(`(${POOLKEY}, bool, uint128, uint128, bytes)`), p) as any;
            const [c0, c1] = [key[0], key[1]];
            const [tin, tout] = zeroForOne ? [c0, c1] : [c1, c0];
            out.push({ tin, tout, amt: x, lim: y, exactIn: k === 0x06 });
          } else if (k === 0x0f) {
            const [, m] = decodeAbiParameters(parseAbiParameters("address, uint256"), p);
            if (m > min) min = m;
          } else if (k === 0x07 || k === 0x09) {
            const [[cur, path, x, y]] = decodeAbiParameters(parseAbiParameters("(address, (address,uint24,int24,address,bytes)[], uint128, uint128)"), p) as any;
            const end = path.length ? path[path.length - 1][0] : cur;
            const start = path.length ? path[0][0] : cur;
            out.push(k === 0x07 ? { tin: cur, tout: end, amt: x, lim: y, exactIn: true } : { tin: start, tout: cur, amt: x, lim: y, exactIn: false });
          }
        });
      }
    } catch {
      // a command we can't read: the rest still can be
    }
  });
  return { legs: out, unwrap, wrap, min };
}

export type Swap = { text: string; pay: { symbol: string; amount: string; most?: boolean }; get: { symbol: string; amount: string; least?: boolean } };

export async function uniswapWords(data: Hex, native: string, wrapped: string | undefined, token: (a: string) => Promise<Tok>): Promise<Swap | null> {
  let d;
  try {
    d = decodeFunctionData({ abi: ur, data });
  } catch {
    return null;
  }
  const { legs: ls, unwrap, wrap, min } = legs(d.args[0] as Hex, d.args[1] as readonly Hex[]);
  if (!ls.length) return null;
  // a route split over several pools: the first leg's way in, the last's way out, amounts added up
  const first = ls[0];
  const last = ls[ls.length - 1];
  const same = ls.filter(l => l.tin.toLowerCase() === first.tin.toLowerCase() && l.tout.toLowerCase() === last.tout.toLowerCase());
  const amt = same.reduce((s, l) => s + l.amt, 0n);
  let lim = same.reduce((s, l) => s + l.lim, 0n);
  if (first.exactIn && lim < min) lim = min;
  const name = async (a: string, eth: boolean): Promise<Tok> =>
    a.toLowerCase() === zeroAddress || (eth && wrapped && a.toLowerCase() === wrapped.toLowerCase()) ? { symbol: native, decimals: 18 } : token(a);
  const [ti, to] = await Promise.all([name(first.tin, wrap), name(last.tout, unwrap)]);
  if (!ti || !to) return null;
  const f = (v: bigint, t: NonNullable<Tok>) => `${Number(formatUnits(v, t.decimals)).toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${t.symbol}`;
  const u = (v: bigint, t: NonNullable<Tok>) => formatUnits(v, t.decimals);
  if (first.exactIn)
    return {
      text: lim === 0n ? `Swap ${f(amt, ti)} for ${to.symbol} (no minimum)` : `Swap ${f(amt, ti)} for at least ${f(lim, to)}`,
      pay: { symbol: ti.symbol, amount: u(amt, ti) },
      get: { symbol: to.symbol, amount: u(lim, to), least: true },
    };
  return { text: `Swap at most ${f(lim, ti)} for ${f(amt, to)}`, pay: { symbol: ti.symbol, amount: u(lim, ti), most: true }, get: { symbol: to.symbol, amount: u(amt, to) } };
}

// Uniswap's Universal Routers (code checked on each chain, 10-29); any other address is named by its address
export const UNIVERSAL_ROUTERS = [
  "0xd6145b2d3f379919e8cdeda7b97e37c4b2ca9c40",
  "0x6ff5693b99212da76ad316178a184ab56d299b43",
  "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  "0xa51afafe0263b40edaef0df8781ea9aa03e381a3",
  "0x851116d9223fabed8e56c0e6b8ad0c31d98b3507",
  "0x1095692a6237d83c6a72f3f5efedb9a670c49223",
];
// the wrapped coin, so a swap that unwraps reads as ETH
export const WETH: Record<number, string> = {
  1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  8453: "0x4200000000000000000000000000000000000006",
  10: "0x4200000000000000000000000000000000000006",
  42161: "0x82af49447d8af3d9b14fd2be3d6a2f78d6f2e0bb",
};
const EXECUTE = ["0x3593564c", "0x24856bc3"];

/** A call's swap in words ("Swap 2 USDC for at least 0.0008 ETH on Uniswap"), or null when it isn't one. */
export async function swapWords(chain: number, c: { to: string; data: string }, native: string, token: (a: string) => Promise<Tok>): Promise<Swap | null> {
  if (!EXECUTE.includes(c.data.slice(0, 10).toLowerCase())) return null;
  const w = await uniswapWords(c.data as Hex, native, WETH[chain], token);
  if (!w) return null;
  const where = UNIVERSAL_ROUTERS.includes(c.to.toLowerCase()) ? "on Uniswap" : `through ${c.to.slice(0, 6)}…${c.to.slice(-4)}`;
  return { ...w, text: `${w.text} ${where}` };
}
