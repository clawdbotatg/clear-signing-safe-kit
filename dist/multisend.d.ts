/** Safe's MultiSendCallOnly 1.4.1: a batch of plain calls, run as a delegatecall (operation 1). Same address on every chain. */
export declare const MULTISEND_CALL_ONLY = "0x9641d764fc13c8b624c04430c7356c1c7c8102e2";
export declare const MULTISEND_SELECTOR = "0x8d80ff0a";
export type Hex = `0x${string}`;
export type Call = {
    to: string;
    value: bigint;
    data: Hex;
};
export type Inner = Call & {
    operation: number;
};
export type SafeTxLike = {
    to: string;
    value: bigint;
    data: Hex;
    operation: number;
};
/** The calls in a multiSend(bytes) calldata: operation, to, value, data each. Throws on a batch it can't read. */
export declare function unbatch(data: string): Inner[];
/** multiSend(bytes) calldata for these plain calls. */
export declare function batch(calls: Call[]): Hex;
/** The Safe tx for these calls: one call as itself, several as a MultiSendCallOnly batch. */
export declare function asSafeTx(calls: Call[]): SafeTxLike;
/** The calls a Safe tx makes: our plain batch opened up, else the tx as one call. A delegatecall to anything else
 * isn't opened (danger.ts says what it means). */
export declare function callsOf(tx: SafeTxLike): Inner[];
