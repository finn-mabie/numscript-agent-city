# api_call_fee

Caller pays provider for N units. The agent reads the provider's `unit_price` metadata off-ledger, computes `amount = unit_price × units`, and submits the total as a typed param.

## Numscript feature on display
**Typed monetary caps on agent-computed totals.** The `unit_price` lives on-ledger as the provider's declared policy (set via `set_account_meta`, seeded by Task 16), so there's one source of truth. The agent reads it, multiplies by units, and the ledger validates the resulting amount is within `max` bounds before debiting the caller. Unit count is preserved as `set_tx_meta("units", ...)` for auditing.

## Prerequisite
The provider account must have `unit_price` metadata set (e.g. `"USD/2 2"` in Numscript serialized form). Seed script (Task 16) does this for all agents.

## Why not multiply inside Numscript?
Stock Numscript has no `mul()` builtin or `*` operator for monetary × number. Computing the total in the agent keeps the script portable and the math auditable in the calling code path.
