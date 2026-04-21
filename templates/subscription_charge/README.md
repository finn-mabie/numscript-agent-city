# subscription_charge

Recurring payment. The engine invokes with `reference = period_ref`, so a replay of the same period is idempotent.

## Numscript feature on display
**Ledger-level `reference` idempotency.** Double-charging a subscription is architecturally impossible — the ledger returns the original tx id if the reference exists.
