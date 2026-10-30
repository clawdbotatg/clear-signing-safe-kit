import { MULTISEND_SELECTOR } from "./multisend.js";

/**
 * The clear-signing bundle for the wedgie: the ERC-7730 descriptors and tokens a Safe tx calls, picked from
 * wedgie.dev/clear/<tag>/ (made by wedgie-dev wire/release.py) into what the wedgie's Safe Signer checks and shows
 * (wedgie-safe safe_7730.py). The page only chooses what to send: every structure carries its own Merkle proof to a
 * root built into the app, so leaving one out is all a page can do wrong (the wedgie then says it can't read the
 * call). The bundle is the wire format's eth-sign-request keys 8 (tokens) and 13 (descriptors).
 * review: the clear-review round the wedgie saved (hello's safe_review): its robot-checked structures
 * (/clear/review/<n>/) stand in for the registry's "not audited" ones; the app checks them against it.
 */
export const CLEAR_MAX = 6000; // bytes: what Safe Signer takes (its CLEAR_MAX) when the release doesn't say
// a release for a newer app says more (index.json clearMax), but safe-36 holds 6600 in a buffer made at start: bigger
// ones may not find the memory. The Universal Router's descriptor alone is 5577, so 6000 left out USDC (10-27).
export const CLEAR_BUF = 6600;
const THIS_SAFE = "0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe"; // a call to the Safe itself (wedgie-safe safe_book)
const ANY = "0x7730773077307730773077307730773077307730"; // release.py: descriptors for any token

type Load = (path: string) => Promise<Record<string, string> | null>;
const fromSite =
  (base: string): Load =>
  p =>
    fetch(`${base}${p}.json`)
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null);
let load: Load = fromSite("https://wedgie.dev/clear/");
const files = new Map<string, Promise<Record<string, string> | null>>();
/** Where the files come from: a base URL ("/clear/" on wedgie.dev) or a loader (tests: the disk). */
export function clearFrom(src: string | Load) {
  load = typeof src === "string" ? fromSite(src) : src;
  files.clear();
}

function file(tag: string, chain: number, name: string, path?: string) {
  const k = path ?? `${tag}/${chain}/${name}`;
  if (!files.has(k)) files.set(k, load(k));
  return files.get(k)!;
}

/** A contract's descriptors (selector -> structure): the release's, with the review round's in place of the same. */
async function descs(tag: string, chain: number, addr: string, review: number) {
  const [f, g] = await Promise.all([file(tag, chain, addr), review > 0 ? file(tag, chain, addr, `review/${review}/${chain}/${addr}`) : null]);
  return g ? { ...(f || {}), ...g } : f;
}

/** The calls in a MultiSend batch (hex without 0x): operation, to (no 0x), data (no 0x) each. */
function unbatch(hex: string) {
  const n = parseInt(hex.slice(72, 136), 16) * 2;
  const p = hex.slice(136, 136 + n);
  const out = [];
  for (let o = 0; o + 170 <= p.length; ) {
    const len = parseInt(p.slice(o + 106, o + 170), 16) * 2;
    out.push({ operation: parseInt(p.slice(o, o + 2), 16), to: p.slice(o + 2, o + 42), data: p.slice(o + 170, o + 170 + len) });
    o += 170 + len;
  }
  return out;
}

/** Every 20-byte word the calldata holds the way ABI holds an address (12 zero bytes, then 20), lowercase hex. Any
 * byte offset (a call inside a call is 4 bytes off the outer words), so runs of zeros look like addresses too: those
 * start with 2 zero bytes and are skipped (a Universal Router swap: 474 lookups, a minute, 10-27). */
function addresses(hex: string) {
  const out = new Set<string>();
  for (let i = 8; i + 64 <= hex.length; i += 2) if (/^0{24}/.test(hex.slice(i, i + 24)) && !hex.startsWith("0000", i + 24)) out.add(hex.slice(i + 24, i + 64));
  return out;
}

const head = (n: number) => (n < 24 ? (0x80 + n).toString(16) : n < 256 ? "98" + n.toString(16).padStart(2, "0") : "99" + n.toString(16).padStart(4, "0"));

/** The bundle for a Safe tx (hex, no 0x), or null when the registry has nothing for any call in it. tag: the data the
 * wedgie's app trusts (its hello's safe_clear). safe: the Safe's address (its calls to itself read as THIS_SAFE). */
export async function clearBundle(tag: string, chain: number, t: { to: string; data?: string | null; operation?: number | string; safe?: string }, review = 0): Promise<string | null> {
  const data = (t.data || "0x").slice(2).toLowerCase();
  const calls = +(t.operation || 0) === 1 && data.startsWith(MULTISEND_SELECTOR.slice(2)) ? unbatch(data).filter(c => c.operation === 0) : [{ to: t.to.toLowerCase().slice(2), data }];
  const top: string[] = [];
  const inner: string[] = [];
  const seen = new Set<string>();
  for (const c of calls) {
    if (c.data.length < 8) continue;
    const self = !!t.safe && c.to === t.safe.toLowerCase().slice(2);
    const sel = "0x" + c.data.slice(0, 8);
    // none under its own address: the registry's one for any contract of its kind (ERC-20 transfer, approve)
    const d = (await descs(tag, chain, self ? THIS_SAFE : "0x" + c.to, review))?.[sel] ?? (await descs(tag, chain, ANY, review))?.[sel];
    if (d && !seen.has(d)) {
      seen.add(d);
      top.push(d);
    }
    // a call inside the call (multicall, permitAndCall, a Safe setup): any contract the calldata names, or this one
    // (a multicall into itself), whose selector the calldata carries. All at once, not one after another.
    const found = await Promise.all([...new Set([c.to, ...addresses(c.data)])].map(a => descs(tag, chain, "0x" + a, review)));
    for (const g of found) {
      if (!g) continue;
      for (const [s, x] of Object.entries(g))
        if (!seen.has(x) && c.data.slice(8).includes(s.slice(2))) {
          seen.add(x);
          inner.push(x);
        }
    }
  }
  if (!top.length && !inner.length) return null;
  // the tokens the calldata or a descriptor names (a constant token is only in the descriptor), and the called
  // contract itself (ERC-20 transfer/approve: the token is @.to)
  const toks = await file(tag, chain, "tokens");
  const named = (calls.map(c => c.to + c.data).join("") + top.join("") + inner.join("")).toLowerCase();
  const tk = Object.entries(toks || {})
    .filter(([a]) => named.includes(a.slice(2).toLowerCase()))
    .map(([, s]) => s);
  // as much as fits, most needed first: the calls' own descriptors, the tokens, then the calls inside
  const said = +((await file(tag, 0, "index", `${tag}/index`)) as any)?.clearMax || 0;
  const max = said ? Math.min(said, CLEAR_BUF) : CLEAR_MAX;
  let size = 8;
  const take = (l: string[]) => l.filter(s => size + s.length / 2 <= max && ((size += s.length / 2), true));
  const d = take(top);
  const k = take(tk);
  const i = take(inner);
  if (!d.length && !i.length) return null;
  return "a2" + "08" + head(k.length) + k.join("") + "0d" + head(d.length + i.length) + d.join("") + i.join("");
}
