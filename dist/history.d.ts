export type Rpc = (method: string, params: unknown[]) => Promise<any>;
type Log = {
    address: string;
    topics: string[];
    data: string;
    blockNumber: string;
    blockTimestamp?: string;
    transactionHash: string;
    logIndex: string;
};
type Tok = {
    symbol: string;
    decimals: number;
};
/** Logs for filter f, kept for as long as the page lives: the first read is all of them (logsBack), every later one
 * only the blocks since (a few back too: a block can be replaced), so a re-read costs one small getLogs, not the
 * whole history again. Not fresh: the copy from under a minute ago, as it is. */
type Kept = {
    logs: Log[];
    from: bigint;
    head: bigint;
};
/** The Safe's own logs used here, oldest first (history and "did it run" share them). fresh: read the new blocks now. */
export declare function safeLogs(rpc: Rpc, chain: number, safe: string, enough?: number, fresh?: boolean): Promise<Kept>;
/** The tokens whose transfers in Activity shows on this chain (lowercase address → symbol, decimals). */
export declare function inTokens(chain: number, usdc?: string): Record<string, Tok>;
/** The last `limit` things that happened, newest first, as Safe's all-transactions results. fresh: read the chain's
 * new blocks now (cheap: what was read before is kept), not the copy from under a minute ago. */
export declare function chainHistory(rpc: Rpc, chain: number, safe: string, usdc?: string, limit?: number, fresh?: boolean): Promise<any[]>;
/** safeTxHash h: ran (its transaction hash), or not on chain yet (null). */
export declare function ranOnChain(rpc: Rpc, chain: number, safe: string, h: string, fresh?: boolean): Promise<{
    transactionHash: string;
    isSuccessful: boolean;
} | null>;
/** How the Safe was made, from the chain: its one SafeSetup log is in its creation transaction, and the factory is
 *  whoever logged ProxyCreation for it there. Same answer as Safe's /creation/ (transactionHash, factoryAddress). */
export declare function chainCreation(rpc: Rpc, safe: string): Promise<{
    transactionHash: any;
    factoryAddress: `0x${string}`;
}>;
/** Differences between Safe's all-transactions results and chainHistory's, over the stretch of time both cover.
 *  Lines in () are known and fine: Safe's API shows a token the chain doesn't read, or lists a run as a plain transaction. */
export declare function diffHistory(chain: number, svc: any[], mine: any[], safe: string, usdc?: string): string[];
/**
 * What one past transaction moved in and out of the Safe, from its receipt: each token's Transfer logs to and from it,
 * the coin it received (SafeReceived), and coinOut (the coin it sent: its calls' value; logs don't show it). Same
 * shape as a clear-sim answer's changes, so moves() reads both. token: a token's symbol and decimals (null: unknown).
 */
export declare function moved(rpc: Rpc, safe: string, txHash: string, coinOut: bigint, native: string, token: (a: string) => Promise<{
    symbol: string;
    decimals: number;
} | null>): Promise<{
    ok: "ok" | "reverts";
    block: number;
    changes: {
        token: string;
        symbol: string;
        decimals: number;
        amount: string;
        usd: string;
    }[];
}>;
export {};
