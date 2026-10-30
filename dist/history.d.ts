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
export declare function safeLogs(rpc: Rpc, chain: number, safe: string, enough?: number, fresh?: boolean): Promise<{
    logs: Log[];
    from: bigint;
}>;
/** The last `limit` things that happened, newest first, as Safe's all-transactions results. */
export declare function chainHistory(rpc: Rpc, chain: number, safe: string, usdc?: string, limit?: number): Promise<any[]>;
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
