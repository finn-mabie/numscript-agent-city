# commodity_swap

Atomic barter between two agents. Useful for crossing asset boundaries.

## Example

Alice (USD-holder) buys 3 🍓 from Grace for $5:

    agent_a = Alice, agent_b = Grace
    give = USD/2 500     ← Alice gives
    take = STRAWBERRY/0 3 ← Grace gives

Commits atomically — both sides move, or neither.

## Safety

- Both agents' balances are source-bounded (Numscript enforces at ledger level).
- `agent_a` must be the acting agent (self-ownership checked in auth.ts).
- The other side (`agent_b`) implicitly consents by having their LLM not post
  a counter-offer in a previous tick. For explicit negotiation before swap,
  agents should DM first and reference the `swap_ref` in the DM.
