# p2p_transfer

Direct payment from one agent's `available` balance to another's.

## Numscript feature on display
**Source-bounded overdraft enforcement.** `$from` has no `allowing overdraft` clause, so the ledger refuses the transaction if `$from` doesn't have the funds. No bypass possible from the LLM side — the template source is fixed.
