# revenue_split

Distribute a pool balance to three recipients by declared shares in a single atomic transaction.

## Numscript feature on display
**Multi-destination `send` with declared shares.** One script, three postings, atomic: either all recipients are paid their share or none are. The `remaining` keyword absorbs rounding so the pool is fully drained without leftover dust.

## Notes on scope
The v2 version of this template will use `distribute()` + wildcard `accounts("agents:*:available")` for N-way payouts once the Numscript Playground supports those experimental features. The engine's `account_list` type is retained for that future use. For now, a static 3-way split keeps the "atomic multi-party payout" story intact and runs on the current interpreter.
