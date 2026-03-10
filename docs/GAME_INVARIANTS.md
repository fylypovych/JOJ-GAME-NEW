## Game Invariants

These are the guarantees the codebase is expected to preserve.

1. Hidden information must not leak through `playerView`.
2. `hands`, `legendaryHands`, `deck`, and `legendaryDeck` are secret before `gameover`.
3. Live moves must be atomic: a move either applies fully or rolls back fully.
4. Simulation should follow the same gameplay invariants as live moves.
5. `recruit` is a special rank: its seat limit equals player count.
6. Non-`recruit` seat limits follow player-count scaling from `rankEngine`.
7. All players start with `recruit`.
8. Explicit replacement payment must be validated strictly.
9. Missing resource units can be replaced only by `2` other resource units per missing unit.
10. `syncPlayerNames` may only update the acting player's own name.
11. Legendary special effects must also obey move atomicity.
12. Shared template import must reject malformed JSON without mutating live shared config.
13. Legacy `DECISION` cards are normalized to `COMMAND` on import.
14. Spectators must never see secret card contents before game end.
15. `stalled-no-cards` ending must remain a valid deterministic fallback.
16. Rank promotion and demotion must respect seat limits and recruit exception rules.
17. Admin routes must not run insecurely in production unless explicitly overridden.

## Verification Gates

- `npm run typecheck`
- `npm test`
- `npm run test:invariants`
- `npm run test:config`
- `npm run test:simulation`

## Config Contracts

- Shared deck template exports use a versioned `joj-shared-deck-template` document.
- Shared ranks exports use a versioned `joj-shared-ranks` document.
- Runtime import paths remain backward-compatible with legacy unversioned JSON arrays/objects.
