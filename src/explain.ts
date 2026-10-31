import { fetchPrebuiltRegistryIndex, format, isFieldGroup } from "@ethereum-sourcify/clear-signing";
import type { DescriptorResolver, ExternalDataProvider, RegistryIndex, TrustedTokens } from "@ethereum-sourcify/clear-signing";
import { type Swap, type Tok, swapWords } from "./uniswap.js";

/**
 * Each call of a Safe tx in words, server side. In order:
 *   1. a Uniswap swap, from its own commands (uniswap.ts): what goes in, the least that comes out
 *   2. clear signing (ERC-7730): the contract team's own words, from the EF registry with ours on top
 *      (clawdbotatg/clear-descriptors show.json: staged there before a registry PR), through Sourcify's formatter.
 *      The same data the wedgie reads (wedgie-dev wire/release.py). A call to the Safe itself reads as the 0x5afe…
 *      "This Safe" binding.
 * null: nothing for that call (the page says what it can itself).
 */
export type Field = { label: string; value: string; address?: string };
export type Told = { what: string; short?: string; fields: Field[]; who?: string; swap?: Pick<Swap, "pay" | "get"> } | null;
export type Call = { to: string; value: string | bigint; data: string };
export type Token = { name: string; symbol: string; decimals: number };

const REGISTRY = "https://raw.githubusercontent.com/ethereum/clear-signing-erc7730-registry/master/";
const OURS = "https://raw.githubusercontent.com/clawdbotatg/clear-descriptors/main/";
const THIS_SAFE = "0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe";

const getJson = (url: string) =>
  fetch(url, { signal: AbortSignal.timeout(10_000) }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  });

/** Our descriptors: the files clear-descriptors' show.json adds, by raw URL. */
async function ours(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const add: string[] = (await getJson(`${OURS}show.json`).catch(() => null))?.add ?? [];
  await Promise.all(
    add.map(async p => {
      const d = await getJson(OURS + p).catch(() => null);
      for (const x of d?.context?.contract?.deployments ?? []) out[`eip155:${x.chainId}:${String(x.address).toLowerCase()}`] = OURS + p;
    }),
  );
  return out;
}

// kept while the server is warm, for an hour: a new descriptor of ours shows up without a deploy
let built: { at: number; r: Promise<DescriptorResolver | undefined> } | null = null;
function resolver() {
  if (built && Date.now() - built.at < 3600_000) return built.r;
  const r = Promise.all([fetchPrebuiltRegistryIndex(), ours()])
    .then(([reg, our]): DescriptorResolver => {
      const lower = Object.fromEntries(Object.entries(reg.calldataIndex).map(([k, v]) => [k.toLowerCase(), v]));
      const index: RegistryIndex = { ...reg, calldataIndex: { ...lower, ...our } };
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
export function explainer(o: { token: (chain: number, a: string) => Promise<Token | null>; chain: (id: number) => { name: string; native: string } | null; trusted?: Record<number, string[]> }) {
  const tokens = new Map<string, Promise<Token | null>>();
  const token = (chain: number, a: string) => {
    const k = `${chain}:${a.toLowerCase()}`;
    if (!tokens.has(k)) tokens.set(k, o.token(chain, a).catch(() => null));
    return tokens.get(k)!;
  };
  const trusted: TrustedTokens = Object.fromEntries(Object.entries(o.trusted ?? {}).map(([c, l]) => [c, Object.fromEntries(l.map(a => [a, "erc20" as const]))]));
  const provider = (chain: number): ExternalDataProvider => ({
    resolveToken: (c, a) => token(c || chain, a),
    resolveChainInfo: async c => {
      const k = o.chain(c);
      return { name: k?.name ?? `chain ${c}`, nativeCurrency: { name: k?.native ?? "Ether", symbol: k?.native ?? "ETH", decimals: 18 } };
    },
  });

  return async function explain(chain: number, safe: string, c: Call): Promise<Told> {
    try {
      const w = await swapWords(chain, c, o.chain(chain)?.native ?? "ETH", a => token(chain, a) as Promise<Tok>);
      if (w) return { what: w.text, fields: [], who: "Uniswap", swap: { pay: w.pay, get: w.get } };
      const res = await resolver();
      if (!res) return null;
      const to = c.to.toLowerCase() === safe.toLowerCase() ? THIS_SAFE : c.to;
      const m = await format(
        { chainId: chain, to, data: c.data as `0x${string}`, value: BigInt(c.value || 0), from: safe },
        { externalDataProvider: provider(chain), descriptorResolverOptions: { type: "custom", resolver: res, trustedTokens: trusted } },
      );
      if (!m.intent && !m.interpolatedIntent) return null;
      if (m.warnings?.some(w => w.code === "NO_DESCRIPTOR" || w.code === "CALLDATA_DECODE_ERROR" || w.code === "NO_FORMAT_MATCH")) return null;
      const fields: Field[] = [];
      for (const f of m.fields || []) for (const x of isFieldGroup(f) ? f.fields : [f]) fields.push({ label: x.label, value: x.value, ...(x.rawAddress ? { address: x.rawAddress } : {}) });
      const intent = typeof m.intent === "string" ? m.intent : m.intent ? (Object.values(m.intent)[0] as string) : "";
      // who it's with: the descriptor's own owner (e.g. "Aave", "Morpho"), else its contract name
      const who = m.metadata?.owner || m.metadata?.contractName;
      // short: the descriptor's plain intent ("Borrow from Morpho Market"), for a headline; what: the full sentence,
      // which can carry every address in the call
      return { what: m.interpolatedIntent || intent, ...(intent ? { short: intent } : {}), fields, ...(who ? { who } : {}) };
    } catch {
      return null;
    }
  };
}
