import { type Swap } from "./uniswap.js";
/**
 * Each call of a Safe tx in words, server side. In order:
 *   1. a Uniswap swap, from its own commands (uniswap.ts): what goes in, the least that comes out
 *   2. clear signing (ERC-7730): the contract team's own words, from the EF registry with ours on top
 *      (clawdbotatg/clear-descriptors show.json: staged there before a registry PR), through Sourcify's formatter.
 *      The same data the wedgie reads (wedgie-dev wire/release.py). A call to the Safe itself reads as the 0x5afe…
 *      "This Safe" binding.
 * null: nothing for that call (the page says what it can itself).
 * src: where the words came from: "audited" (an EF registry descriptor an auditor signed: its sigs/ file; the registry
 * drops a signature when the descriptor changes), "ef" (EF registry, unsigned), "ours" (clear-descriptors), "code"
 * (our own reading: the Uniswap swap). Every wallet shows the same mark for each.
 */
export type Src = "audited" | "ef" | "ours" | "code";
export type Field = {
    label: string;
    value: string;
    address?: string;
};
export type Told = {
    what: string;
    short?: string;
    fields: Field[];
    who?: string;
    swap?: Pick<Swap, "pay" | "get">;
    src?: Src;
} | null;
export type Call = {
    to: string;
    value: string | bigint;
    data: string;
};
export type Token = {
    name: string;
    symbol: string;
    decimals: number;
};
/**
 * An explainer for one app. token: a token's name, symbol and decimals (the app's own RPC; null: not a token).
 * chain: a chain's name and coin. trusted: tokens the formatter may name without asking (USDC per chain).
 */
export declare function explainer(o: {
    token: (chain: number, a: string) => Promise<Token | null>;
    chain: (id: number) => {
        name: string;
        native: string;
    } | null;
    trusted?: Record<number, string[]>;
}): (chain: number, safe: string, c: Call) => Promise<Told>;
