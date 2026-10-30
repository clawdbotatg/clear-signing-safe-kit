import { type Hex } from "viem";
/**
 * A Uniswap Universal Router call (execute) in words: what goes in, what comes out, from its own commands. The V2, V3
 * and V4 swaps, and WETH (un)wrapping so "WETH" out reads as the native coin. Token names come from `token`.
 * null: no swap in it we can read. The minimum often sits after the swap (UNWRAP_WETH, SWEEP, V4 TAKE_ALL), not on it.
 */
export type Tok = {
    symbol: string;
    decimals: number;
} | null;
export type Swap = {
    text: string;
    pay: {
        symbol: string;
        amount: string;
        most?: boolean;
    };
    get: {
        symbol: string;
        amount: string;
        least?: boolean;
    };
};
export declare function uniswapWords(data: Hex, native: string, wrapped: string | undefined, token: (a: string) => Promise<Tok>): Promise<Swap | null>;
export declare const UNIVERSAL_ROUTERS: string[];
export declare const WETH: Record<number, string>;
/** A call's swap in words ("Swap 2 USDC for at least 0.0008 ETH on Uniswap"), or null when it isn't one. */
export declare function swapWords(chain: number, c: {
    to: string;
    data: string;
}, native: string, token: (a: string) => Promise<Tok>): Promise<Swap | null>;
