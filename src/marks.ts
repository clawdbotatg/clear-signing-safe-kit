/**
 * Where a transaction step's words came from, as one emoji in place of its step number. The same in every wallet
 * (Instant Wallet, wedgie.dev). The words on hover.
 *   audited  an EF registry descriptor an auditor signed (explain.ts src)
 *   checked  an EF registry descriptor our robot review passed (clear-review: it says what the call really does),
 *            unchanged since that review
 *   ef       an EF registry descriptor, not signed, not checked
 *   ours     our own descriptor (clawdbotatg/clear-descriptors)
 *   code     our own code read the call (approvals, sends, the Uniswap swap, Safe settings)
 *   bot      a model's guess (wedgie.dev only)
 *   raw      nothing could read it
 */
export type Mark = "audited" | "checked" | "ef" | "ours" | "code" | "bot" | "raw";
export const MARKS: Record<Mark, [emoji: string, title: string]> = {
  audited: ["🛡️", "EF registry descriptor, signed by an auditor"],
  checked: ["✅", "EF registry descriptor, checked by our robot review: it says what the call does"],
  ef: ["🔏", "EF registry descriptor, not audited or checked"],
  ours: ["📝", "Our own descriptor, not in the EF registry yet"],
  code: ["🛠️", "Read by our own code, no descriptor"],
  bot: ["🤖", "A robot's guess"],
  raw: ["⚠️", "Nothing could read this"],
};
