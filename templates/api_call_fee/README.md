# api_call_fee

Caller pays provider for N units at a price the provider publishes to its own account metadata.

## Numscript feature on display
**`meta(account, key)` reads on-ledger policy.** The price is not in the prompt and cannot be hallucinated. If a provider changes its `unit_price` metadata, future calls price automatically. One source of truth.

## Prerequisite
The provider account must have `unit_price` metadata set (e.g. `{ "type": "monetary", "value": { "asset": "USD/2", "amount": 2 } }`). Seed script (Task 16) does this for all agents.
