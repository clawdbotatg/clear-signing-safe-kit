import { getAddress, toCoinType } from "viem";
// not viem/ens normalize: Next's server build constant-folds it to undefined (Instant Wallet, /api/ens)
import { ens_normalize as normalize } from "@adraffy/ens-normalize";
/**
 * ENS, read through ENS's Universal Resolver on Ethereum (client: an Ethereum client), so names served by a gateway
 * (CCIP-read: *.base.eth, *.wedgie.eth on Base) and a chain's own primary names work. viem answers null for "no name"
 * and throws when the read failed: a failed read is never "no name" (keep the last one shown).
 */
/** The address's primary name on `chain` first, then Ethereum's. A chain's name goes through ENS's gateway for that
 * chain, which can hang (Optimism's took 23 s, 2026-10-21): it gets 3 s, then Ethereum's shows. */
export async function primaryName(client, a, chain) {
    const address = getAddress(a);
    const main = client.getEnsName({ address });
    if (chain && chain !== 1) {
        const n = await Promise.race([client.getEnsName({ address, coinType: toCoinType(chain) }).catch(() => null), new Promise(r => setTimeout(() => r(null), 3000))]);
        if (n) {
            main.catch(() => { });
            return n;
        }
    }
    return main;
}
/** A name's address (any resolver, gateways included), or null. */
export async function nameAddress(client, name) {
    const a = await client.getEnsAddress({ name: normalize(name.trim().toLowerCase()) });
    return a ? getAddress(a) : null;
}
/** Where a name's avatar picture is: its avatar record (https, ipfs, NFTs), else ENS's metadata service. */
export async function avatarUrl(client, name) {
    const u = await client.getEnsAvatar({ name: normalize(name) }).catch(() => null);
    return u || `https://metadata.ens.domains/mainnet/avatar/${encodeURIComponent(name)}`;
}
