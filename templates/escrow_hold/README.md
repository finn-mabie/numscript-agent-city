# escrow_hold

Lock `$amount` of `$payer`'s funds into a per-job escrow account (`@escrow:job:{id}`).

## Numscript feature on display
**Idempotency via `reference`.** The template engine always invokes with `reference = {agent}:{tick_id}`; replaying the same call returns the original tx id instead of double-locking funds. Escrow lives outside the agent tree so wildcard balances on `@agents:` stay accurate.
