# clear-signing-safe-kit

What a Safe transaction does, in plain English. Shared by [Instant Wallet](https://instantwallet.io) and [wedgie.dev](https://wedgie.dev), so both say the same thing.

- `sim`: ask [clear-sim](https://github.com/clawdbotatg/clear-sim) what goes out and comes in, check its P-256 signature against the key pinned for that simulator. Point it at your own simulator with `url`.
- `dangers`: what could take everything (a delegatecall that isn't a plain batch, a new module, guard or fallback handler).
- `swapWords`: a Uniswap Universal Router swap: what you pay, the least you get.
- `clearBundle`: the ERC-7730 bundle the wedgie checks and shows.
- `multisend`: open and build MultiSendCallOnly batches.
- `chainHistory`, `moved`: a Safe's past from its own chain (no Safe API), spam and look-alike transfers left out; what each one moved.
- `clear-signing-safe-kit/explain` (server): each call in words: a swap, else the ERC-7730 registry through Sourcify's formatter.

Use it as a git dependency pinned to a commit: `"clear-signing-safe-kit": "github:clawdbotatg/clear-signing-safe-kit#<sha>"`. `dist/` is committed; run `npm run build` after a change.

Test: `npm test`; `LIVE=1 LIVE_SAFE=0x… npm test` also asks sim.wedgie.dev.
