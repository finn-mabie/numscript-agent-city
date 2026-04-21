# gig_settlement

Pay a gig winner with a platform fee and a reviewer fee, all atomically.

## Numscript feature on display
**Atomic multi-party allotment.** Exactly one `send` produces three postings; they either all commit or all revert. Allotment sums are validated at compile time (schema caps enforce `platform_fee ≤ 20%`, `reviewer_fee ≤ 10%`, which with `remaining` cannot exceed 100%).
