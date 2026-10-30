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
