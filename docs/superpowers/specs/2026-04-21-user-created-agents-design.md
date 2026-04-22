# User-created agents — "build your own storefront and try to win"

> Design spec (not yet implemented). Captures the feature so it can be picked up in a future focused session. Implementation plan is separate and will follow the normal spec → plan → execute cadence.

## 1. Summary

Let a visitor create a new agent with its own name, personality, building, and a chosen subset of Numscript templates. The agent joins the live city, ticks alongside the existing roster, and participates in the economy. The visitor can then "push" their agent — broadcast messages, inject prompts into peers, schedule a spending or earning campaign — to try to dominate the city's money flow.

The demo value: turns the demo from "watch 10 scripted agents" into "build an agent and see if you can win." Tweetable outcomes ("I made Ⓚ the Used-Car-Dealer and she drained the treasury in 8 minutes") double the share rate.

## 2. Goals

- **Primary:** a new, shareable interaction — each visitor gets a custom agent with their chosen identity and they compete against the default roster
- **Secondary:** stress-test the 4-layer safety cage with visitor-chosen personalities that may push harder than the default roster
- **Anti-goal:** not a full authoring tool. We don't let visitors write Numscript, invent templates, or change the cage. They compose from the existing primitives.

## 3. Non-negotiable safety invariants

Same as the existing arena (Plan 4):
1. Visitor-supplied text (name, personality, prompts) never reaches the ledger / DB / SQL directly — only as strings in the agent's LLM user-message.
2. The 4-layer cage fires on every action regardless of who owns the agent. A user-created agent cannot transact from another agent's account; cannot exceed schema bounds; cannot invent templates.
3. Creation is rate-limited per IP — hashed salt + sliding window, mirroring `POST /arena`.
4. Hard caps: max 4 concurrent user-created agents; max 3 templates per agent; max 280-char personality.
5. User agents are ejected after 30 minutes of inactivity or on TTL expiry (so the city doesn't balloon indefinitely).

## 4. MVP scope

| Component | In MVP | Deferred |
|---|---|---|
| New agent endpoint (POST /agents) | ✅ | — |
| Backend agent-insertion + balance seed | ✅ | — |
| Per-agent allowed-templates filter in tool list | ✅ | — |
| Name + personality + template picker UI | ✅ | — |
| Zone assignment (pick existing zone or "?" guest zone) | ✅ | Custom zone creation with user ASCII |
| LLM autonomous control (agent ticks normally) | ✅ | Manual "puppet mode" where user types posts |
| Visitor-driven arena pushes targeting ANY agent | ✅ (reuse existing arena) | Campaign goals + leaderboard |
| Agent TTL + max-concurrent cap | ✅ | Custom TTL per agent |
| Sprite assignment (K/L/M/N letters, custom hex) | ✅ | Custom emoji glyphs |

## 5. Data model

### 5.1 Extend `agents` table

Add columns to support dynamic creation:

```sql
ALTER TABLE agents ADD COLUMN personality TEXT;             -- ≤280 chars, injected into system prompt
ALTER TABLE agents ADD COLUMN allowed_templates TEXT;       -- JSON array of template ids; null = all
ALTER TABLE agents ADD COLUMN origin TEXT DEFAULT 'roster'; -- 'roster' | 'user'
ALTER TABLE agents ADD COLUMN created_by_ip_hash TEXT;      -- sha256 hash when origin='user'
ALTER TABLE agents ADD COLUMN expires_at INTEGER;           -- epoch ms; null = no expiry (roster agents)
```

No index changes — dueAt query unchanged.

### 5.2 New HTTP endpoint

`POST /agents` with body:

```json
{
  "name": "Alice's Rival",
  "role": "Street Vendor",
  "tagline": "Deals in goods off the books",
  "personality": "Shrewd, opportunistic, will cut corners. Prefers quick small deals over patient earning. Distrusts Dave on principle.",
  "allowedTemplates": ["p2p_transfer", "gig_settlement"],
  "zone": "MKT",
  "seedAmount": 5000
}
```

Response:
```json
{
  "agentId": "011",
  "letter": "K",
  "glyph": "Ⓚ",
  "hex": "#f5a68c",
  "expiresAt": 1776812345000
}
```

Rate-limited (2/min/IP), caps above enforced, personality neutralized for `[end ...]` sentinels same as arena prompts.

### 5.3 Tool filtering

Extend `toolsForTemplates`:

```typescript
export function toolsForTemplates(
  templates: Template[],
  allowedIds?: string[]
): AnthropicTool[] {
  const filtered = allowedIds
    ? templates.filter((t) => allowedIds.includes(t.schema.id))
    : templates;
  return [...filtered.map(toolFor), POST_OFFER_TOOL, IDLE_TOOL];
}
```

`tickAgent` reads `agent.allowed_templates` (if non-null) and passes through. A user who picked `["p2p_transfer", "gig_settlement"]` sees only those two templates + post_offer + idle in their LLM tool list.

### 5.4 Personality injection

In `buildContext`, after the existing tagline:

```typescript
`You are ${agent.name}, the ${agent.role}. ${agent.tagline}`,
agent.personality ? `\nPersonality: ${agent.personality}` : "",
```

## 6. Frontend

### 6.1 Agent Creator modal

New React component `apps/web/src/components/AgentCreator.tsx`. Opens from a HUD button "+ Build an Agent" (hidden when 4 user agents already live). Fields:

- **Name** — freeform ≤24 chars. Shown as the sprite label.
- **Role** — freeform ≤40 chars. Shown in panels.
- **Tagline** — freeform ≤140 chars. Shown on hover.
- **Personality** — freeform ≤280 chars. The deep character text injected into the LLM system prompt.
- **Templates** — multi-select from the 13 template library with tooltips explaining each.
- **Home zone** — dropdown of existing 6 zones + "?" guest.
- **Seed amount** — slider $10-$100 (capped so user agents don't flood the city with money).

Submit button calls `POST /agents`. On 202, the new agent appears in the canvas within ~2-3s as the next tick picks them up.

### 6.2 Live management panel

Right-side overlay showing the user's active agents. Each row:
- Agent glyph + name + balance + remaining TTL
- "Push" button → opens the existing ArenaBar with target pre-selected
- "Dismiss" button → soft-deletes the agent (sets expires_at = now)

### 6.3 Dynamic zone handling

MVP: existing 6 zones accept an extra agent each. The Glyph scene's slot-assignment logic already handles N occupants by horizontal subdivision; a new agent at an existing zone just gets a slot. No layout change.

Deferred: custom zones with user-supplied ASCII art positioned in the remaining canvas space (right edge, between `?` and the edge).

### 6.4 Glyph/color assignment

User agents get letters K, L, M, N (ids 011-014). Hue generated deterministically from `sha256(name)` mapped to HSL with constrained lightness so it stays legible on the dark emerald background.

## 7. "Push" mechanism

MVP: reuse the existing `POST /arena` endpoint. Visitor's management panel has a "Push peer" button that opens ArenaBar with target-agent pre-filled. The visitor types an adversarial prompt, it injects into the target's next tick context — exactly the Plan 4 flow.

Differentiated visual: arena pushes triggered by user-owned agents render with that agent's signature hue on the incoming pulse, so it reads as "Ⓚ is pushing Ⓓ" rather than an anonymous visitor probe.

Deferred: scheduled campaigns ("push Dave 5 times over 10 minutes"); goal tracking ("get your balance above $300 within 15 min"); leaderboard of top user agents by goal-completion.

## 8. Release gate

1. Visitor creates agent Ⓚ via the modal, agent appears in canvas within 5s
2. Ⓚ ticks alongside roster — posts offers, attempts templates, visible in intent board
3. Visitor pushes peer via arena — injection shows up in target's tick as expected
4. Ⓚ expires after TTL without leaving orphan state
5. Rate limits enforced: 3rd creation attempt within 60s returns 429
6. 5th concurrent user agent rejected with 409

## 9. Open questions

- **Does user agent data leak across sessions?** Probably expire on idle, but allow explicit "link to my session" for share-card purposes
- **How does the "?" unknown zone behave when a user agent claims it?** Currently reserved for Judy; maybe users can't pick it
- **Are user agents visible to the default roster?** Yes — they show in other agents' board/peer-list context; they're first-class participants
- **Sprite animation in the existing canvas already supports any number of agents** — confirmed via the slot-assignment code added in Plan 7
- **Should user agents be able to pick MORE templates than roster defaults?** If a visitor says "I want all 13 templates", that's more powerful than any single roster agent. Cap at 3 or 4 for fairness

## 10. Scope note for future implementer

This is a 2-3 day feature. The longest-pole items are:
1. Frontend creation modal + validation UX (half a day)
2. Dynamic zone visual handling if we do custom zones (half a day)
3. Backend safety hardening + rate limits + tests (half a day)

Everything else rides on patterns already established in Plans 4, 5, 6, 7.

Recommended breakdown when executed:
1. Backend: schema migration, repo insert, POST /agents, tool filter, personality injection (~3 tasks)
2. Frontend: AgentCreator modal, live management panel (~2 tasks)
3. Polish: sprite/hue assignment, TTL sweeper, rate limits, tests (~2 tasks)
