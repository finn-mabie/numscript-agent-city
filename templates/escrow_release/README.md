# escrow_release

Sweep the full escrow balance to the winner, atomically.

## Numscript feature on display
**`send [ASSET *]` wildcard** drains the exact balance without needing to pre-compute — avoids a race where balance queried on the app side drifts before commit.
