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
// kept while the server is warm, for an hour: a new descriptor of ours shows up without a deploy
let built = null;
function resolver() {
    if (built && Date.now() - built.at < 3600_000)
        return built.r;
    const r = Promise.all([fetchPrebuiltRegistryIndex(), ours()])
        .then(([reg, our]) => {
        const lower = Object.fromEntries(Object.entries(reg.calldataIndex).map(([k, v]) => [k.toLowerCase(), v]));
        const index = { ...reg, calldataIndex: { ...lower, ...our } };
        return { index, fetchDescriptor: path => getJson(path.startsWith("https://") ? path : REGISTRY + path) };
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
                return { what: w.text, fields: [], who: "Uniswap", swap: { pay: w.pay, get: w.get } };
            const res = await resolver();
            if (!res)
                return null;
            const to = c.to.toLowerCase() === safe.toLowerCase() ? THIS_SAFE : c.to;
            const m = await format({ chainId: chain, to, data: c.data, value: BigInt(c.value || 0), from: safe }, { externalDataProvider: provider(chain), descriptorResolverOptions: { type: "custom", resolver: res, trustedTokens: trusted } });
            if (!m.intent && !m.interpolatedIntent)
                return null;
            if (m.warnings?.some(w => w.code === "NO_DESCRIPTOR" || w.code === "CALLDATA_DECODE_ERROR" || w.code === "NO_FORMAT_MATCH"))
                return null;
            const fields = [];
            for (const f of m.fields || [])
                for (const x of isFieldGroup(f) ? f.fields : [f])
                    fields.push({ label: x.label, value: x.value, ...(x.rawAddress ? { address: x.rawAddress } : {}) });
            const intent = typeof m.intent === "string" ? m.intent : m.intent ? Object.values(m.intent)[0] : "";
            // who it's with: the descriptor's own owner (e.g. "Aave", "Morpho"), else its contract name
            const who = m.metadata?.owner || m.metadata?.contractName;
            return { what: m.interpolatedIntent || intent, fields, ...(who ? { who } : {}) };
        }
        catch {
            return null;
        }
    };
}
