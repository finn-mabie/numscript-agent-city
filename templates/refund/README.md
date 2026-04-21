# refund

Merchant refunds a customer. Idempotent — invoked with `reference = refund:{original_tx_ref}`.

## Numscript feature on display
**Idempotency + typed params.** Schema forces `amount` into minor units with a cap, so LLM-emitted floats or surprise-large refunds are rejected before the ledger sees them.
