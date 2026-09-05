# Handoff

Current checkpoint. Replace this file at the end of each slice; it is not a diary.

**Feature / slice:** Brief 01 slices A and B, and Brief 02 slices A and B (intermission: explicit departure and the
zoned shop overlay). Completed 2026-09-05 on top of `8214446`. Awaiting Oscar's playtest of the intermission.

**Changed symbols:** `sim.ts` `fx`, `FX_SEED_SALT`, `burst`, `puff` (cosmetic draws), `draftClaimed`, `claimedOffer`,
`choose` (claim only), `continueWave`, `nextShopWave`, `healAmount`, `anvilPreview`, `buyEvent`, post-claim guards on
`reroll` / `buyFourth` / `toggleBanish` / `banish`; `types.ts` `Snapshot` (+6 fields); `arena.ts` Enter departs, `buy`
cue; `audio.ts` `Synth.buy`; `webmcp.ts` `continue` action; new `ui/ShopOverlay.tsx` replaces the inline overlay in
`App.tsx`; `styles.css` `.si-*` rules; `tests/harness.mjs` departs explicitly. Polish pass: `render.ts` `drawHud` draws health,
shield, gold and dash pips bottom-left of the canvas (visible at 720p and in fullscreen, where the React metrics are not);
the intermission overlay starts below the arena header, its lower row is anvil | repair | reserve so it fits a 720p arena
once claimed; the topbar tag shows the active feel (IRON / EASY n%) instead of the stale LEDGER label; reduced-motion
covers all overlays. Dev builds expose `window.__orbwalk` (the Arena).

**Seed sequence:** intentional change. Cosmetic draws no longer consume gameplay RNG. Every existing seeded economy
pin still held, so no baseline was regenerated.

**Verified:** `npm test` 136 passing; `npm run build` (tsc + vite) passing. `tests/determinism.test.mjs` fails on the
pre-change sim and passes after. Browser check of the intermission at 1280x720 pending Oscar's session.

**Known issues:**
- `Simulation.rng` is still seeded with the constant 7 in the browser; only tests choose a seed.
- Orb count and scatter on kill still use the gameplay RNG on purpose (pickup timing is gameplay).
- Brief 02 slice B copy and layout have not been playtested; expect wording and spacing notes.
- Before the claim, the anvil / repair / reserve row still needs a small scroll at 720p; wallet and departure stay fixed.
- The canvas HUD duplicates the React metrics row below the arena; consider trimming that row once the HUD has been played.

**Next bounded task:** Brief 03 slice A (Reaver blade art) once the intermission passes Oscar's playtest. If the
intermission needs changes, iterate on `ui/ShopOverlay.tsx` and `styles.css` only; rules live in `sim.ts`.
