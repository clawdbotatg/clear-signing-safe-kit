/**
 * A Safe tx to the wedgie's Safe Signer (clawdbotatg/wedgie-safe), the one way Instant Wallet and wedgie.dev both send
 * it: the clear-signing bundle in pieces, a clear-sim answer asked with the wedgie's own nonce, the data in pieces when
 * the line is too long, then safe_sign. Returns the wedgie's answer to safe_sign (safe_sig, refused or error): the
 * caller checks the hash and makes the signatures. ask: one request on the wedgie's line (USB serial or the drive).
 */
export type WedgieAsk = (msg: Record<string, unknown>, ms: number) => Promise<any>;
export type WedgieTx = {
    chainId: number;
    safe: string;
    to: string;
    value: string;
    data: string;
    operation: number;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
    nonce: number;
};
/** What its hello said: safe_chunk (hex chars per piece; none: an app too old for pieces), safe_clear (the clear-signing
 * data it trusts), safe_sim ("p256": it checks a simulation), safe_review (the review round it saved). */
export type WedgieHello = {
    safe_chunk?: number;
    safe_clear?: string | null;
    safe_sim?: string;
    safe_review?: number;
};
export declare const WEDGIE_LINE = 3000;
export declare const WEDGIE_DATA_MAX = 8000;
export declare function wedgieSign(o: {
    ask: WedgieAsk;
    hello: WedgieHello;
    tx: WedgieTx;
    /** smaller pieces and lines (the phone's drive) */
    chunk?: number;
    lineMax?: number;
    simUrl?: string;
    /** 0..1 while pieces go over; press: the question is up on the wedgie */
    progress?: (p: number) => void;
    press?: () => void;
}): Promise<any>;
