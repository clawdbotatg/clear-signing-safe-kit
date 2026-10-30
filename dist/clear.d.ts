/**
 * The clear-signing bundle for the wedgie: the ERC-7730 descriptors and tokens a Safe tx calls, picked from
 * wedgie.dev/clear/<tag>/ (made by wedgie-dev wire/release.py) into what the wedgie's Safe Signer checks and shows
 * (wedgie-safe safe_7730.py). The page only chooses what to send: every structure carries its own Merkle proof to a
 * root built into the app, so leaving one out is all a page can do wrong (the wedgie then says it can't read the
 * call). The bundle is the wire format's eth-sign-request keys 8 (tokens) and 13 (descriptors).
 * review: the clear-review round the wedgie saved (hello's safe_review): its robot-checked structures
 * (/clear/review/<n>/) stand in for the registry's "not audited" ones; the app checks them against it.
 */
export declare const CLEAR_MAX = 6000;
export declare const CLEAR_BUF = 6600;
type Load = (path: string) => Promise<Record<string, string> | null>;
/** Where the files come from: a base URL ("/clear/" on wedgie.dev) or a loader (tests: the disk). */
export declare function clearFrom(src: string | Load): void;
/** The bundle for a Safe tx (hex, no 0x), or null when the registry has nothing for any call in it. tag: the data the
 * wedgie's app trusts (its hello's safe_clear). safe: the Safe's address (its calls to itself read as THIS_SAFE). */
export declare function clearBundle(tag: string, chain: number, t: {
    to: string;
    data?: string | null;
    operation?: number | string;
    safe?: string;
}, review?: number): Promise<string | null>;
export {};
