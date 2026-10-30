import type { SafeTxLike } from "./multisend.js";
/**
 * clear-sim (github.com/clawdbotatg/clear-sim, SPEC.md): runs a Safe tx on the latest block and signs what goes in and
 * out with its P-256 key. Asked from the browser, so anyone can point their wallet at their own simulator. A page
 * checks each answer against the key that simulator gave the first time this browser used it (pinned per URL); the
 * wedgie checks it against its own list instead (pass the wedgie's nonce, check: false).
 */
export declare const SIM_DEFAULT = "https://sim.wedgie.dev";
export type Change = {
    token: string;
    symbol: string;
    decimals: number;
    amount: string;
    usd: string;
};
export type SimAnswer = {
    block: number;
    ok: "ok" | "reverts";
    tx: string;
    changes: Change[];
    nonce: string;
    sig: string;
    r: string;
    s: string;
};
export type SimKey = {
    x: string;
    y: string;
};
/** One coin moved: formatted amount (no sign), dollars (no sign) when priced. */
export type Move = {
    token: string;
    symbol: string;
    amount: string;
    usd?: number;
};
export type Moves = {
    pay: Move[];
    get: Move[];
    fails?: string;
    block?: number;
};
/** clear-sim's tx hash: what the answer is about (SPEC.md). */
export declare function simTxHash(safe: string, t: SafeTxLike): Promise<string>;
/** A simulator's public key, as it says it (GET /). */
export declare function simKey(url: string): Promise<SimKey & {
    name?: string;
}>;
/** The key pinned for this simulator in this browser (localStorage[store]), pinned now if it's the first time. A
 * changed key = a different simulator: its answers fail the check. */
export declare function pinnedKey(url: string, store?: string): Promise<SimKey>;
/** Is this answer about our tx and nonce, signed by key? (SPEC.md "Checking it") */
export declare function checkAnswer(a: SimAnswer, key: SimKey, chain: number, tx: string, nonce: string): Promise<boolean>;
/**
 * Run a Safe tx on the simulator. nonce: the wedgie's, when it will check the answer itself (then pass check: false);
 * else a fresh one. key: the key to check against (default: the one pinned for url). null: no answer we can trust.
 */
export declare function simulate(o: {
    chain: number;
    safe: string;
    tx: SafeTxLike;
    url?: string;
    nonce?: string;
    key?: SimKey;
    check?: boolean;
    store?: string;
    timeout?: number;
}): Promise<SimAnswer | null>;
/** The answer as coins out and in. fees: what the tx pays a relay, per token (lowercase address, "eth" = the coin),
 * taken out of pay (shown on its own line). */
export declare function moves(a: SimAnswer, fees?: Record<string, bigint>): Moves;
