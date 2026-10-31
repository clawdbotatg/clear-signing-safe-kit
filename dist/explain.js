import { fetchPrebuiltRegistryIndex, format, isFieldGroup } from "@ethereum-sourcify/clear-signing";
import { swapWords } from "./uniswap.js";
const REGISTRY = "https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master/";
const OURS = "https://raw.githubusercontent.com/clawdbotatg/clear-descriptors/main/";
const THIS_SAFE = "0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe";
const getJson = (url) => fetch(url, { signal: AbortSignal.timeout(10_000) }).then(r => {
    if (!r.ok)
        throw new Error(`${r.status} ${url}`);
    return r.json();
});
/** Our descriptors: the files clear-descriptors' show.json adds, by raw URL. */
async function ours() {
    const out = {};
    const add = (await getJson(`${OURS}show.json`).catch(() => null))?.add ?? [];
    await Promise.all(add.map(async (p) => {
        const d = await getJson(OURS + p).catch(() => null);
        for (const x of d?.context?.contract?.deployments ?? [])
            out[`eip155:${x.chainId}:${String(x.address).toLowerCase()}`] = OURS + p;
    }));
    return out;
}
const TREE = (ref) => `https://api.github.com/repos/ethereum/clear-signing-erc7730-registry/git/trees/${ref}?recursive=1`;
/** The registry's files now (path -> blob sha) and its auditor signatures ("<dir>/sigs/<name>.<auditor>.json"). Empty if it can't say. */
async function tree(ref) {
    const t = await getJson(TREE(ref)).catch(() => null);
    return Object.fromEntries((t?.tree ?? []).map((x) => [x.path, x.sha]));
}
// clear-review (our robot check of every EF descriptor: does the screen say what the call really does?), as wedgie.dev
// publishes it: latest.json -> its round (the registry commit it read) -> <chain>/<address>.json, a key per passed selector
const REVIEW = "https://wedgie.dev/clear/review/";
let round = null;
function review() {
    if (round && Date.now() - round.at < 3600_000)
        return round.r;
    const r = (async () => {
        const n = (await getJson(`${REVIEW}latest.json`))?.round;
        const rd = await getJson(`${REVIEW}${n}/round.json`);
        return { n, files: await tree(rd.registry) }; // the files as reviewed: a ✅ holds only while a file is the same
    })().catch(() => null);
    round = { at: Date.now(), r };
    return r;
}
const passes = new Map();
/** Did clear-review pass this function, on this exact file? */
async function checked(chain, to, sel, path, now) {
    const rv = await review();
    if (!rv || !now[path] || rv.files[path] !== now[path])
        return false;
    const k = `${rv.n}/${chain}/${to.toLowerCase()}`;
    if (!passes.has(k))
        passes.set(k, getJson(`${REVIEW}${k}.json`).catch(() => ({})));
    return sel.toLowerCase() in (await passes.get(k));
}
/** Where a descriptor path's words come from. */
async function srcOf(path, now, chain, to, sel) {
    if (path?.startsWith(OURS))
        return "ours";
    if (!path)
        return "ef"; // a generic ERC descriptor (ercs/: ERC-20, ERC-721): the registry's, not per contract
    const i = path.lastIndexOf("/");
    const pre = `${path.slice(0, i)}/sigs/${path.slice(i + 1).replace(/\.json$/, "")}.`;
    if (Object.keys(now).some(p => p.startsWith(pre)))
        return "audited";
    return (await checked(chain, to, sel, path, now).catch(() => false)) ? "checked" : "ef";
}
// kept while the server is warm, for an hour: a new descriptor of ours shows up without a deploy
let built = null;
function resolver() {
    if (built && Date.now() - built.at < 3600_000)
        return built.r;
    const r = Promise.all([fetchPrebuiltRegistryIndex(), ours(), tree("master")])
        .then(([reg, our, now]) => {
        const lower = Object.fromEntries(Object.entries(reg.calldataIndex).map(([k, v]) => [k.toLowerCase(), v]));
        const index = { ...reg, calldataIndex: { ...lower, ...our } };
        return { index, now, fetchDescriptor: (path) => getJson(path.startsWith("https://") ? path : REGISTRY + path) };
    })
        .catch(() => {
        built = null;
        return undefined;
    });
    built = { at: Date.now(), r };
    return r;
}
/**
 * An explainer for one app. token: a token's name, symbol and decimals (the app's own RPC; null: not a token).
 * chain: a chain's name and coin. trusted: tokens the formatter may name without asking (USDC per chain).
 */
export function explainer(o) {
    const tokens = new Map();
    const token = (chain, a) => {
        const k = `${chain}:${a.toLowerCase()}`;
        if (!tokens.has(k))
            tokens.set(k, o.token(chain, a).catch(() => null));
        return tokens.get(k);
    };
    const trusted = Object.fromEntries(Object.entries(o.trusted ?? {}).map(([c, l]) => [c, Object.fromEntries(l.map(a => [a, "erc20"]))]));
    const provider = (chain) => ({
        resolveToken: (c, a) => token(c || chain, a),
        resolveChainInfo: async (c) => {
            const k = o.chain(c);
            return { name: k?.name ?? `chain ${c}`, nativeCurrency: { name: k?.native ?? "Ether", symbol: k?.native ?? "ETH", decimals: 18 } };
        },
    });
    return async function explain(chain, safe, c) {
        try {
            const w = await swapWords(chain, c, o.chain(chain)?.native ?? "ETH", a => token(chain, a));
            if (w)
                return { what: w.text, fields: [], who: "Uniswap", swap: { pay: w.pay, get: w.get }, src: "code" };
            const res = await resolver();
            if (!res)
                return null;
            const to = c.to.toLowerCase() === safe.toLowerCase() ? THIS_SAFE : c.to;
            const m = await format({ chainId: chain, to, data: c.data, value: BigInt(c.value || 0), from: safe }, { externalDataProvider: provider(chain), descriptorResolverOptions: { type: "custom", resolver: res, trustedTokens: trusted } });
            if (!m.intent && !m.interpolatedIntent)
                return null;
            if (m.warnings?.some(w => w.code === "NO_DESCRIPTOR" || w.code === "CALLDATA_DECODE_ERROR" || w.code === "NO_FORMAT_MATCH"))
                return null;
            // a call inside the call (multicall, a batch: the formatter reads it with its own descriptor): its words, never
            // its bytes. Its intent stands in for the outer one ("Uniswap" -> "Swap").
            const fields = [], inner = [];
            const said = (i) => (typeof i === "string" ? i : i ? Object.values(i)[0] : "");
            const walk = (fs) => {
                for (const f of fs || [])
                    for (const x of isFieldGroup(f) ? f.fields : [f]) {
                        const e = x.embeddedCalldata?.display;
                        if (e) {
                            inner.push({ what: e.interpolatedIntent || said(e.intent), short: said(e.intent) });
                            walk(e.fields);
                        }
                        else
                            fields.push({ label: x.label, value: x.value, ...(x.rawAddress ? { address: x.rawAddress } : {}) });
                    }
            };
            walk(m.fields);
            const outer = said(m.intent);
            const intent = inner.length ? inner.map(x => x.short).filter(Boolean).join(" · ") : outer;
            // who it's with: the descriptor's own owner (e.g. "Aave", "Morpho"), else its contract name
            const who = m.metadata?.owner || m.metadata?.contractName;
            // short: the descriptor's plain intent ("Borrow from Morpho Market"), for a headline; what: the full sentence,
            // which can carry every address in the call
            const src = await srcOf(res.index.calldataIndex[`eip155:${chain}:${to.toLowerCase()}`], res.now, chain, to, c.data.slice(0, 10));
            const what = inner.length ? inner.map(x => x.what).filter(Boolean).join(" · ") : m.interpolatedIntent || outer;
            return { what: what || outer, ...(intent ? { short: intent } : {}), fields, ...(who ? { who } : {}), src };
        }
        catch {
            return null;
        }
    };
}
