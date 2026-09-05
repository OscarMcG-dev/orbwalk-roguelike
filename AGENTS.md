# Working in this repository

Orbwalk Rogue: an ADC kiting roguelike. Vite + React + TypeScript, Canvas rendering, a headless deterministic
`Simulation` at 120 Hz. Deployed to https://1v5.dev/ from `main` by GitHub Actions.

## Start here

1. `design/PILLARS.md` is the taste authority. Check every mechanic and number against it.
2. `docs/SYSTEM-MAP.md` says where each system lives, its update phase, its readers and its tests. Read the matching
   row and the brief you were given before any broad search. `codex-original/` is historical and excluded from
   routine investigation.
3. `docs/HANDOFF.md` is the current checkpoint: what changed last, what was verified, and the next bounded task.

## Rules

- A mechanic has one authoritative owner, and it lives in `src/game/`. React presents commands and snapshots; it does
  not calculate price eligibility, damage or rewards. `render.ts` reads state and draws; it never mutates the sim.
- Keep public `Simulation` commands stable while extracting code. Preserve the `Arena` event counters until their
  callers are migrated deliberately.
- Use named units in new fields: seconds, radians, units per second, integer currency. New enemy state gets a named
  phase rather than borrowing an unrelated timer's meaning.
- Preserve shot cancellation, class rhythms, shop economics and the existing localStorage keys.
- Keep the sim deterministic. Cosmetic randomness must not change gameplay draws; if a change alters a seeded sequence,
  say so in the handoff and regenerate the pinned baseline rather than loosening assertions.
- Update a map row when ownership changes. Do not write a full-repository summary on every turn.
- Implement one bounded slice per session. Finish it, verify it, and update `docs/HANDOFF.md`.

## Validate

```bash
npm test          # node:test suites against the .ts sources (Node 22.6+)
npm run typecheck
npm run build     # tsc --noEmit && vite build; this is what CI runs before deploy
npm run ab iron easy 20 10   # seeded A/B pilot report for two tuning presets
```
