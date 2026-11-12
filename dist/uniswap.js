import { decodeAbiParameters, decodeFunctionData, formatUnits, parseAbi, parseAbiParameters, zeroAddress } from "viem";
const ur = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline)", "function execute(bytes commands, bytes[] inputs)"]);
const POOLKEY = "(address,address,uint24,int24,address)";
/** Not amounts: the router's flags. CONTRACT_BALANCE (1 << 255, V2/V3/WRAP_ETH) = "all the router holds now";
 * a V4 exact-in of 0 (OPEN_DELTA) = "whatever is owed". The real amount sits in an earlier command (WRAP_ETH,
 * PERMIT2_TRANSFER_FROM) or in the call's value. Shown as a number it read "−57,896,044,618,658,100,000,… ETH" (10-30). */
export const CONTRACT_BALANCE = 1n << 255n;
/** The nth 32-byte word of ABI data, as a number (-1: not there). */
const word = (d, n) => {
    const w = d.slice(2 + 64 * n, 66 + 64 * n);
    return w.length === 64 ? BigInt("0x" + w) : -1n;
};
/** The tokens at each end of a V3 path (20-byte token, 3-byte fee, 20-byte token, …). */
const v3ends = (p) => ["0x" + p.slice(2, 42), "0x" + p.slice(-40)];
function legs(commands, inputs) {
    const out = [];
    let funded = 0n; // what went into the router before the swap (WRAP_ETH, PERMIT2_TRANSFER_FROM): the real amount behind a flag
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
            }
            else if (t === 0x08 || t === 0x09) {
                const [, a, b, path] = decodeAbiParameters(parseAbiParameters("address, uint256, uint256, address[], bool"), d);
                out.push({ tin: path[0], tout: path[path.length - 1], amt: a, lim: b, exactIn: t === 0x08 });
            }
            else if (t === 0x0b) {
                wrap = true;
                const [, m] = decodeAbiParameters(parseAbiParameters("address, uint256"), d);
                if (m < CONTRACT_BALANCE)
                    funded += m;
            }
            else if (t === 0x02) {
                const [, , m] = decodeAbiParameters(parseAbiParameters("address, address, uint160"), d);
                funded += m;
            }
            else if (t === 0x0c) {
                unwrap = true;
                const [, m] = decodeAbiParameters(parseAbiParameters("address, uint256"), d);
                if (m > min)
                    min = m;
            }
            else if (t === 0x04) {
                const [, , m] = decodeAbiParameters(parseAbiParameters("address, address, uint256"), d);
                if (m > min)
                    min = m;
            }
            else if (t === 0x10) {
                const [actions, params] = decodeAbiParameters(parseAbiParameters("bytes, bytes[]"), d);
                (actions.slice(2).match(/../g) ?? []).forEach((a, j) => {
                    const k = parseInt(a, 16);
                    const p = params[j];
                    if (k === 0x06 || k === 0x08) {
                        // the newer router (0xd6145b…, 11-12) put a per-hop price limit before hookData: one more word, so
                        // hookData's offset is 0x140 in the 11th word, not 0x120 in the 10th. Read as the old shape it threw, the
                        // hop was dropped, and a USDC swap that went through USDbC read "Swap USDbC".
                        const shape = word(p, 9) !== 0x120n && word(p, 10) === 0x140n ? `(${POOLKEY}, bool, uint128, uint128, uint256, bytes)` : `(${POOLKEY}, bool, uint128, uint128, bytes)`;
                        const [[key, zeroForOne, x, y]] = decodeAbiParameters(parseAbiParameters(shape), p);
                        const [c0, c1] = [key[0], key[1]];
                        const [tin, tout] = zeroForOne ? [c0, c1] : [c1, c0];
                        out.push({ tin, tout, amt: x, lim: y, exactIn: k === 0x06, open: k === 0x06 && x === 0n });
                    }
                    else if (k === 0x0b) {
                        // SETTLE(currency, amount, payerIsUser): what the user pays in, when it's a number
                        const [, m, user] = decodeAbiParameters(parseAbiParameters("address, uint256, bool"), p);
                        if (user && m > 0n && m < CONTRACT_BALANCE)
                            funded += m;
                    }
                    else if (k === 0x0f) {
                        const [, m] = decodeAbiParameters(parseAbiParameters("address, uint256"), p);
                        if (m > min)
                            min = m;
                    }
                    else if (k === 0x07 || k === 0x09) {
                        // the newer router: a list of per-hop price limits after the path (the path's offset is 0xa0, not 0x80).
                        // Read as the old shape, that list's offset came out as the amount.
                        const PATH = "(address,uint24,int24,address,bytes)[]";
                        const fresh = word(p, 2) === 0xa0n;
                        const r = decodeAbiParameters(parseAbiParameters(fresh ? `(address, ${PATH}, uint256[], uint128, uint128)` : `(address, ${PATH}, uint128, uint128)`), p);
                        const [cur, path, x, y] = fresh ? [r[0][0], r[0][1], r[0][3], r[0][4]] : r[0];
                        const end = path.length ? path[path.length - 1][0] : cur;
                        const start = path.length ? path[0][0] : cur;
                        out.push(k === 0x07 ? { tin: cur, tout: end, amt: x, lim: y, exactIn: true, open: x === 0n } : { tin: start, tout: cur, amt: x, lim: y, exactIn: false });
                    }
                });
            }
        }
        catch {
            // a command we can't read: the rest still can be
        }
    });
    return { legs: out, unwrap, wrap, min, funded };
}
export async function uniswapWords(data, native, wrapped, token, value = 0n) {
    let d;
    try {
        d = decodeFunctionData({ abi: ur, data });
    }
    catch {
        return null;
    }
    const { legs: ls, unwrap, wrap, min, funded } = legs(d.args[0], d.args[1]);
    if (!ls.length)
        return null;
    // A route can be split over pools and hop through other tokens on the way (USDC → USDbC → ETH next to USDC → ETH).
    // What's paid: the token that only ever goes in. What's got: the one that only ever comes out. The coin and its
    // wrapped form count as one. Not one of each (a loop, a route we can't follow): the first hop's way in and the
    // last's way out, as before. Amounts: the hops that start at the paid token, the minimums of the hops that end at
    // the got one.
    const first = ls[0];
    const last = ls[ls.length - 1];
    const norm = (a) => (wrapped && a.toLowerCase() === wrapped.toLowerCase() ? zeroAddress : a.toLowerCase());
    const ins = new Set(ls.map(l => norm(l.tin)));
    const outs = new Set(ls.map(l => norm(l.tout)));
    const onlyIn = [...ins].filter(t => !outs.has(t));
    const onlyOut = [...outs].filter(t => !ins.has(t));
    const payT = onlyIn.length === 1 ? onlyIn[0] : norm(first.tin);
    const getT = onlyOut.length === 1 ? onlyOut[0] : norm(last.tout);
    const from = ls.filter(l => norm(l.tin) === payT);
    const to_ = ls.filter(l => norm(l.tout) === getT);
    const exactIn = from[0].exactIn;
    // an amount that's a flag (all the router holds, the open delta): what went in before it, else the coin sent with the call
    const isFlag = (l) => l.exactIn && (!!l.open || l.amt >= CONTRACT_BALANCE);
    const flagged = from.some(isFlag);
    const sent = funded || (payT === zeroAddress ? value : 0n);
    const amt = exactIn ? (flagged ? (sent > 0n ? sent : null) : from.reduce((s, l) => s + l.amt, 0n)) : to_.reduce((s, l) => s + l.amt, 0n);
    let lim = (exactIn ? to_ : from).reduce((s, l) => s + l.lim, 0n);
    if (exactIn && lim < min)
        lim = min;
    // the wrapped coin reads as the coin when the call wraps it on the way in / unwraps it on the way out
    const name = async (t, legs, end, eth) => t === zeroAddress
        ? eth || !wrapped || legs.some(l => l[end].toLowerCase() === zeroAddress)
            ? { symbol: native, decimals: 18 }
            : token(wrapped)
        : token(legs[0][end]); // the address as the call wrote it
    const [ti, to] = await Promise.all([name(payT, from, "tin", wrap), name(getT, to_, "tout", unwrap)]);
    if (!ti || !to)
        return null;
    const f = (v, t) => `${Number(formatUnits(v, t.decimals)).toLocaleString("en-US", { maximumSignificantDigits: 6 })} ${t.symbol}`;
    const u = (v, t) => formatUnits(v, t.decimals);
    if (exactIn) {
        const paid = amt === null ? ti.symbol : f(amt, ti);
        return {
            text: lim === 0n ? `Swap ${paid} for ${to.symbol} (no minimum)` : `Swap ${paid} for at least ${f(lim, to)}`,
            pay: amt === null ? { symbol: ti.symbol, amount: "", unknown: true } : { symbol: ti.symbol, amount: u(amt, ti) },
            get: { symbol: to.symbol, amount: u(lim, to), least: true },
        };
    }
    if (amt === null)
        return null;
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
export const WETH = {
    1: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    8453: "0x4200000000000000000000000000000000000006",
    10: "0x4200000000000000000000000000000000000006",
    42161: "0x82af49447d8af3d9b14fd2be3d6a2f78d6f2e0bb",
};
const EXECUTE = ["0x3593564c", "0x24856bc3"];
/** A call's swap in words ("Swap 2 USDC for at least 0.0008 ETH on Uniswap"), or null when it isn't one. */
export async function swapWords(chain, c, native, token) {
    if (!EXECUTE.includes(c.data.slice(0, 10).toLowerCase()))
        return null;
    let value = 0n;
    try {
        value = BigInt(c.value ?? 0);
    }
    catch { }
    const w = await uniswapWords(c.data, native, WETH[chain], token, value);
    if (!w)
        return null;
    const where = UNIVERSAL_ROUTERS.includes(c.to.toLowerCase()) ? "on Uniswap" : `through ${c.to.slice(0, 6)}…${c.to.slice(-4)}`;
    return { ...w, text: `${w.text} ${where}` };
}
