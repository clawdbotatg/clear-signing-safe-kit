/**
 * Where a transaction step's words came from, as one emoji in place of its step number. The same in every wallet
 * (Instant Wallet, wedgie.dev). The words on hover.
 *   audited  an EF registry descriptor an auditor signed (explain.ts src)
 *   ef       an EF registry descriptor, not signed
 *   ours     our own descriptor (clawdbotatg/clear-descriptors)
 *   code     our own code read the call (approvals, sends, the Uniswap swap, Safe settings)
 *   bot      a model's guess (wedgie.dev only)
 *   raw      nothing could read it
 */
export type Mark = "audited" | "ef" | "ours" | "code" | "bot" | "raw";
export declare const MARKS: Record<Mark, [emoji: string, title: string]>;
