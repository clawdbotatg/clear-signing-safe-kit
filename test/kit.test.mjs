import test from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, encodePacked, concat, parseAbi } from "viem";
import { batch, unbatch, asSafeTx, callsOf, dangers, MULTISEND_CALL_ONLY, simulate, moves } from "../dist/index.js";

const ms = parseAbi(["function multiSend(bytes)"]);
const viemBatch = calls => encodeFunctionData({ abi: ms, functionName: "multiSend", args: [concat(calls.map(c => encodePacked(["uint8", "address", "uint256", "uint256", "bytes"], [0, c.to, c.value, BigInt((c.data.length - 2) / 2), c.data])))] });
const SAFE = "0x1111111111111111111111111111111111111111";
const calls = [
  { to: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", value: 0n, data: "0xa9059cbb0000000000000000000000004cfab32186e65e2a39ec0e882e11380cbf2f8a2f0000000000000000000000000000000000000000000000000000000000002710" },
  { to: "0x2222222222222222222222222222222222222222", value: 5n, data: "0x" },
  { to: "0x3333333333333333333333333333333333333333", value: 0n, data: "0x1234" },
];

test("batch matches viem's encoding, and opens back up", () => {
  assert.equal(batch(calls), viemBatch(calls));
  assert.deepEqual(unbatch(batch(calls)).map(c => [c.operation, c.to, c.value, c.data]), calls.map(c => [0, c.to, c.value, c.data]));
  assert.equal(asSafeTx(calls).operation, 1);
  assert.equal(asSafeTx([calls[1]]).operation, 0);
  assert.equal(callsOf(asSafeTx(calls)).length, 3);
});

test("dangers", () => {
  assert.deepEqual(dangers(SAFE, asSafeTx(calls)), []);
  assert.match(dangers(SAFE, { to: "0x4444444444444444444444444444444444444444", value: 0n, data: "0x", operation: 1 })[0], /run any code/);
  const deleg = "0x8d80ff0a" + batch(calls).slice(10).replace(/(0{62}20[0-9a-f]{64})00/, "$101");
  assert.match(dangers(SAFE, { to: MULTISEND_CALL_ONLY, value: 0n, data: deleg, operation: 1 })[0], /runs code/);
  const mod = encodeFunctionData({ abi: parseAbi(["function enableModule(address)"]), functionName: "enableModule", args: ["0x5555555555555555555555555555555555555555"] });
  assert.match(dangers(SAFE, { to: SAFE, value: 0n, data: mod, operation: 0 })[0], /module/);
  assert.deepEqual(dangers(SAFE, { to: SAFE, value: 0n, data: mod, operation: 0 }, ["0x5555555555555555555555555555555555555555"]), []);
  const g = encodeFunctionData({ abi: parseAbi(["function setGuard(address)", "function setFallbackHandler(address)"]), functionName: "setGuard", args: ["0x5555555555555555555555555555555555555555"] });
  assert.match(dangers(SAFE, { to: SAFE, value: 0n, data: g, operation: 0 })[0], /guard/);
});

// live: sim.wedgie.dev, a batch from a real Safe (needs the network)
test("simulate a batch on sim.wedgie.dev, answer checked", { skip: !process.env.LIVE }, async () => {
  globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
  const safe = process.env.LIVE_SAFE;
  const a = await simulate({ chain: 8453, safe, tx: asSafeTx([{ to: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", value: 0n, data: calls[0].data }, { to: "0x2222222222222222222222222222222222222222", value: 0n, data: "0x" }]) });
  assert.ok(a, "verified answer");
  console.log(moves(a, { "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 10000n }), a.ok);
});

// 10-30: Uniswap's ETH in = WRAP_ETH(amount) then a V3 swap of CONTRACT_BALANCE (1 << 255): never show the flag as an amount
test("a swap of the router's whole balance reads the wrapped amount, never 2^255", async () => {
  const { swapWords } = await import("../dist/index.js");
  const { encodeAbiParameters, parseAbiParameters } = await import("viem");
  const WETH = "0x4200000000000000000000000000000000000006";
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const path = encodePacked(["address", "uint24", "address"], [WETH, 500, USDC]);
  const wrap = encodeAbiParameters(parseAbiParameters("address, uint256"), ["0x0000000000000000000000000000000000000002", 10n ** 15n]);
  const swap = encodeAbiParameters(parseAbiParameters("address, uint256, uint256, bytes, bool"), [SAFE, 1n << 255n, 2166912n, path, false]);
  const data = encodeFunctionData({ abi: parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline)"]), functionName: "execute", args: ["0x0b00", [wrap, swap], 9999999999n] });
  const tok = async a => (a.toLowerCase() === USDC ? { symbol: "USDC", decimals: 6 } : { symbol: "WETH", decimals: 18 });
  const w = await swapWords(8453, { to: "0x6ff5693b99212da76ad316178a184ab56d299b43", data, value: 10n ** 15n }, "ETH", tok);
  assert.equal(w.pay.amount, "0.001");
  assert.equal(w.pay.symbol, "ETH");
  assert.equal(w.get.amount, "2.166912");
  // nothing to read it from: say it isn't known
  const bare = encodeFunctionData({ abi: parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline)"]), functionName: "execute", args: ["0x00", [swap], 9999999999n] });
  const u = await swapWords(8453, { to: "0x6ff5693b99212da76ad316178a184ab56d299b43", data: bare }, "ETH", tok);
  assert.equal(u.pay.unknown, true);
  assert.equal(u.pay.amount, "");
  assert.doesNotMatch(u.text, /\d{20}/);
});

// 11-12 (Austin): Uniswap said "5 USDC", we said "Swap USDbC". Its newer router (0xd6145b…) added a per-hop price
// limit to the V4 swap structs; read as the old shape the first hops were dropped (or an offset read as the amount).
// Built here in the newer shapes, as two real Base swaps were (0x1086749a…, 0xab3c8bfe…).
test("a swap on Uniswap's newer router names the token paid, through hops and split routes", async () => {
  const { swapWords } = await import("../dist/index.js");
  const { encodeAbiParameters, parseAbiParameters, zeroAddress } = await import("viem");
  const WETH = "0x4200000000000000000000000000000000000006";
  const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const USDbC = "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca";
  const USDT = "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2";
  const UR2 = "0xd6145b2d3f379919e8cdeda7b97e37c4b2ca9c40";
  const SY = { [USDC]: ["USDC", 6], [USDbC]: ["USDbC", 6], [USDT]: ["USDT", 6], [WETH]: ["WETH", 18] };
  const tok = async a => (SY[a.toLowerCase()] ? { symbol: SY[a.toLowerCase()][0], decimals: SY[a.toLowerCase()][1] } : null);
  const exec = (commands, inputs) => encodeFunctionData({ abi: parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline)"]), functionName: "execute", args: [commands, inputs, 9999999999n] });
  const v4 = (actions, params) => encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [actions, params]);
  // SWAP_EXACT_IN_SINGLE, newer shape: a price limit (uint256) before hookData
  const single = (c0, c1, zeroForOne, amountIn) =>
    encodeAbiParameters(parseAbiParameters("((address,address,uint24,int24,address), bool, uint128, uint128, uint256, bytes)"), [[[c0, c1, 500, 10, zeroAddress], zeroForOne, amountIn, 0n, 0n, "0x"]]);
  const settle = encodeAbiParameters(parseAbiParameters("address, uint256, bool"), [USDC, 5_000_000n, true]);
  const take = encodeAbiParameters(parseAbiParameters("address, address, uint256"), [USDbC, "0x0000000000000000000000000000000000000002", 0n]);
  // 5 USDC in, split: 2 straight to ETH, 3 to USDbC (V4), then that USDbC to WETH (V3, all the router holds), unwrapped
  const hops = v4("0x0b06060e", [settle, single(USDC, USDbC, true, 3_000_000n), single(zeroAddress, USDC, false, 2_000_000n), take]);
  const v3 = encodeAbiParameters(parseAbiParameters("address, uint256, uint256, bytes, bool"), ["0x0000000000000000000000000000000000000002", 1n << 255n, 0n, encodePacked(["address", "uint24", "address"], [USDbC, 500, WETH]), false]);
  const unwrap = encodeAbiParameters(parseAbiParameters("address, uint256"), [SAFE, 2_419_490_000_000_000n]);
  const hop = await swapWords(8453, { to: UR2, data: exec("0x10000c", [hops, v3, unwrap]) }, "ETH", tok);
  assert.equal(hop.text, "Swap 5 USDC for at least 0.00241949 ETH on Uniswap");
  assert.equal(hop.pay.symbol, "USDC");
  assert.equal(hop.pay.amount, "5");
  assert.equal(hop.get.symbol, "ETH");
  // SWAP_EXACT_IN (a path), newer shape: a list of price limits after the path. 500 USDC, not that list's offset
  const many = encodeAbiParameters(parseAbiParameters("(address, (address,uint24,int24,address,bytes)[], uint256[], uint128, uint128)"), [[USDC, [[USDT, 6, 1, zeroAddress, "0x"]], [0n], 500_000_000n, 487_937_000n]]);
  const path = await swapWords(8453, { to: UR2, data: exec("0x10", [v4("0x07", [many])]) }, "ETH", tok);
  assert.equal(path.text, "Swap 500 USDC for at least 487.937 USDT on Uniswap");
  // the older shapes still read
  const old1 = encodeAbiParameters(parseAbiParameters("((address,address,uint24,int24,address), bool, uint128, uint128, bytes)"), [[[USDC, USDT, 6, 1, zeroAddress], true, 7_000_000n, 6_900_000n, "0x"]]);
  const oldN = encodeAbiParameters(parseAbiParameters("(address, (address,uint24,int24,address,bytes)[], uint128, uint128)"), [[USDC, [[USDT, 6, 1, zeroAddress, "0x"]], 500_000_000n, 487_937_000n]]);
  const o1 = await swapWords(8453, { to: UR2, data: exec("0x10", [v4("0x06", [old1])]) }, "ETH", tok);
  assert.equal(o1.text, "Swap 7 USDC for at least 6.9 USDT on Uniswap");
  const oN = await swapWords(8453, { to: UR2, data: exec("0x10", [v4("0x07", [oldN])]) }, "ETH", tok);
  assert.equal(oN.text, "Swap 500 USDC for at least 487.937 USDT on Uniswap");
});

// history: the first read is the whole chain, a fresh one only the blocks since
test("chainHistory: a fresh read asks only for new blocks, and shows what came in", async () => {
  const { chainHistory } = await import("../dist/index.js");
  const { keccak256, toHex, pad } = await import("viem");
  const safe = "0x9999999999999999999999999999999999999999";
  const RECEIVED = keccak256(toHex("SafeReceived(address,uint256)"));
  const got = (block, n) => ({ address: safe, topics: [RECEIVED, pad("0x4cfab32186e65e2a39ec0e882e11380cbf2f8a2f")], data: pad(toHex(n)), blockNumber: toHex(block),
    blockTimestamp: toHex(1_700_000_000 + block), transactionHash: pad(toHex(block)), logIndex: "0x0" });
  let head = 1000, chain = [got(500, 5n)];
  const asked = [];
  const rpc = async (method, [f]) => {
    if (method === "eth_blockNumber") return toHex(head);
    if (method !== "eth_getLogs") throw new Error(method);
    asked.push(f.fromBlock);
    if (Array.isArray(f.address)) return [];
    const from = f.fromBlock === "earliest" ? 0 : Number(f.fromBlock);
    return chain.filter(l => Number(l.blockNumber) >= from);
  };
  assert.equal((await chainHistory(rpc, 8453, safe, undefined, 6)).length, 1);
  assert.deepEqual([...new Set(asked)], ["earliest"]);
  // within the minute and not fresh: nothing asked
  asked.length = 0;
  await chainHistory(rpc, 8453, safe, undefined, 6);
  assert.deepEqual(asked, []);
  // money lands; a fresh read asks from a few blocks under the last head, and has both
  head = 1010;
  chain.push(got(1005, 7n));
  const h = await chainHistory(rpc, 8453, safe, undefined, 6, true);
  assert.deepEqual([...new Set(asked)], [toHex(1000 - 12)]);
  assert.deepEqual(h.map(t => t.transfers[0].value), ["7", "5"]);
  // a block replaced (the 7 is gone, a 9 in its place): the old one doesn't stay
  head = 1012;
  chain = [chain[0], got(1006, 9n)];
  assert.deepEqual((await chainHistory(rpc, 8453, safe, undefined, 6, true)).map(t => t.transfers[0].value), ["9", "5"]);
});
