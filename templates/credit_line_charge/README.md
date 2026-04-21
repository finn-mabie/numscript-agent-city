# credit_line_charge

Draw from a bounded credit line first (up to `$credit_limit`), then fall back to main balance.

## Numscript feature on display
**Bounded overdraft as a feature.** The same primitive that refuses theft (unbounded overdraft → MissingFundsErr) enables legitimate credit when the caller explicitly bounds the negative range. Dave the Lender uses this to extend credit to trusted peers.
