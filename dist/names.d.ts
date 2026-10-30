import { type Address, type PublicClient } from "viem";
/**
 * ENS, read through ENS's Universal Resolver on Ethereum (client: an Ethereum client), so names served by a gateway
 * (CCIP-read: *.base.eth, *.wedgie.eth on Base) and a chain's own primary names work. viem answers null for "no name"
 * and throws when the read failed: a failed read is never "no name" (keep the last one shown).
 */
/** The address's primary name on `chain` first, then Ethereum's. A chain's name goes through ENS's gateway for that
 * chain, which can hang (Optimism's took 23 s, 2026-10-21): it gets 3 s, then Ethereum's shows. */
export declare function primaryName(client: PublicClient, a: string, chain?: number): Promise<string | null>;
/** A name's address (any resolver, gateways included), or null. */
export declare function nameAddress(client: PublicClient, name: string): Promise<Address | null>;
/** Where a name's avatar picture is: its avatar record (https, ipfs, NFTs), else ENS's metadata service. */
export declare function avatarUrl(client: PublicClient, name: string): Promise<string>;
