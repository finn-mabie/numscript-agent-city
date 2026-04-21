# subscription_charge

Recurring payment. **The subscriber invokes** to pay the provider for the current period. The engine invokes with `reference = period_ref`, so a replay of the same period is idempotent.

Authorization constraint: the orchestrator's authorization guard requires `subscriber` to equal the acting agent. Providers cannot pull without a subscriber-initiated call — a realistic simplification for v1. A real product would add a pre-authorization token to support provider-initiated charges.

## Numscript feature on display
**Ledger-level `reference` idempotency.** Double-charging a subscription is architecturally impossible — the ledger returns the original tx id if the reference exists.
