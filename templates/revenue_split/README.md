# revenue_split

Pay out a pool's entire balance to all accounts matching a wildcard, proportionally to their own balances.

## Numscript feature on display
**`distribute()` + `accounts("pattern")` wildcard expansion.** One statement does what would otherwise be N agent-side balance queries and N send statements — atomically, without the race.
