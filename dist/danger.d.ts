import { type SafeTxLike } from "./multisend.js";
/**
 * What in a Safe tx could take everything, in plain words. Empty: nothing found. Both apps show these red, above
 * everything else, and never hide them behind a simulation that looks fine.
 *   - a delegatecall that isn't our plain MultiSendCallOnly batch: that contract runs any code as the Safe
 *   - a call to the Safe itself that adds a module, sets a guard or a fallback handler
 * known: modules the app put there itself (a recovery module, a daily limit), lowercase; those aren't warned.
 */
export declare function dangers(safe: string, tx: SafeTxLike, known?: string[]): string[];
export declare const short: (a: string) => string;
