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
/** Not amounts: the router's flags. CONTRACT_BALANCE (1 << 255, V2/V3/WRAP_ETH) = "all the router holds now";
 * a V4 exact-in of 0 (OPEN_DELTA) = "whatever is owed". The real amount sits in an earlier command (WRAP_ETH,
 * PERMIT2_TRANSFER_FROM) or in the call's value. Shown as a number it read "−57,896,044,618,658,100,000,… ETH" (10-30). */
export declare const CONTRACT_BALANCE: bigint;
/** `unknown`: the amount can't be read from the call (`amount` is then ""); say so, never show a number. */
export type Swap = {
    text: string;
    pay: {
        symbol: string;
        amount: string;
        most?: boolean;
        unknown?: boolean;
    };
    get: {
        symbol: string;
        amount: string;
        least?: boolean;
    };
};
export declare function uniswapWords(data: Hex, native: string, wrapped: string | undefined, token: (a: string) => Promise<Tok>, value?: bigint): Promise<Swap | null>;
export declare const UNIVERSAL_ROUTERS: string[];
export declare const WETH: Record<number, string>;
/** A call's swap in words ("Swap 2 USDC for at least 0.0008 ETH on Uniswap"), or null when it isn't one. */
export declare function swapWords(chain: number, c: {
    to: string;
    data: string;
    value?: string | bigint;
}, native: string, token: (a: string) => Promise<Tok>): Promise<Swap | null>;
