# Handoff

Current checkpoint. Replace this file at the end of each slice; it is not a diary.

**Feature / slice:** Briefs 02 "A coherent machine-world" (slice A) and 03 "Make the release visible" (slice A,
Marksman pilot), built 2026-09-06 on top of the still uncommitted briefs 01, 03/04/05 (Refit 3, Witness, Overdraw,
Armoury; see the previous handoff's symbols in `docs/SYSTEM-MAP.md`). The whole tree is uncommitted. Both slices are
cosmetic: no rule, timing, command, save key, snapshot field or seeded draw changed. Slice B of either brief (other
actors and weapons, shop glyphs, weapon signatures) is deliberately not started; it waits on the bow and Reaver being
accepted in play.

**Read first next session:** `design/PLAYTEST-NOTES.md` (Oscar's feedback), then this file, then `design/STYLE.md`
(the style contract) and the SYSTEM-MAP rows "Attack rhythm", "Visual identity" and "Frame loop / input / audio".

**Changed symbols:**
- `heroes.ts`: `WeaponPresentation`, `WEAPON_PRESENTATION` (per weapon: `recoil` seconds, `kick` units, `hold`
  seconds). The recoil durations are the values `release()` used to hard-code (bow 0.12, blade 0.12, crossbow 0.2,
  garand 0.14, pistols 0.08, cannon 0.18); before, the renderer normalised every non-cannon weapon by 0.12 and the
  pistols by 0.08, so a crossbow kick was drawn at 167% for its first 80 ms. Both sides now read the table.
- `types.ts`: `ShotRecord`. `sim.ts`: `lastShot`, `shotId` (written once per successful `release()`: id, origin,
  `aimAngle` at release, weapon, `runTime`; reset by `start()`), `cancelEvent` (bumped in `cancel()`; `cancelled` is
  still the stat), `proof` flag, `fixture('style')`. `release()` sets `recoil` from the table. Nothing reads
  `lastShot` except the renderer.
- `audio.ts`: bow `shot` is a dry noise transient plus a short falling triangle (was a lone 850 Hz sine);
  `cancelTick()` is a quiet mechanical tick. `arena.ts` diffs `cancelEvent` for it; one shot cue per release as before.
- `arena.ts`: `RenderState.draw` (anticipation 0..1: the real windup fraction while winding, snaps to 0 on a
  release, unwinds over 80 ms real time after a cancel; pause holds it because `windupLeft` holds),
  `RenderState.reducedMotion` (set in `configure`: Screen shake off, or `prefers-reduced-motion`), `saveFrame(name,
  region?)` (dev: posts the canvas, or an arena-unit crop at up to 4x, to the dev server). `vite.config.ts`
  `styleFrames` middleware: POST `/__style-frame` writes `design/style/<name>.png`. Dev server only, like the notes.
- `render.ts`: `MACHINE` materials; `mixAngle`; `drawPlayer` torso and head are now a slate casing plate with an
  off-white edge, a dark inset and a class-coloured identity light (cape, arms and visor keep the class colour);
  launch pose (torso locked to `lastShot.angle` for `hold` seconds, then eased back over the rest of the recoil, on
  simulation time); recoil is `kick * f²` (peaks at once, eases out; 60% under reduced motion); shoulders rotate
  0.1 rad and compress 5% with `rs.draw` (off under reduced motion; feet, cape and collision untouched); the
  whole-body release ring is gone. Bow redrawn as planar parts (straight chamfered limbs, slate riser with a grip
  block, off-white string and shaft, mint head): the bow arm is planted, the drawing hand pulls with `rs.draw` and
  snaps forward on release; the accent is a shivering string and one short tick along the aim, no bloom. Reaver:
  broad slate pentagon (1.25 × 0.95), off-white outline (`ENEMY_COLORS.reaver`, still the hp-bar colour), dark
  inset plate, red only on the eye and wedge, a dark shoulder pivot at (0.2r, −0.35r) with `drawSlabBlade` rigid to
  it (`drawCleaver` removed); blade tip = wedge radius − |pivot| − 7, so it never leaves the painted wedge. Phase
  durations, facing lock, reach and collision untouched. `drawProofInsets` (dev, when `sim.proof`): two 400×236
  panels top-right, colour and `filter: grayscale(1)`, redrawing dangers, orbs, enemies, bolts, player, particles
  and effects with the same functions at 1.6–3× centred between the player and the nearest Reaver.
- `ui/tuning.tsx`: "Style proof" fixture button. `design/STYLE.md`: the contract. `design/style/`: reference frames
  `before-*` / `after-*` (full frame) and `*-crop-*` (Reaver chase / windup / swing, Marksman windup / release).

**Verified:** `npm test` 185 passing (new `tests/attack-feel.test.mjs`, 6 tests: one table with the shipped
durations and `release()` reading it for all six classes; shot record id / origin / angle / time and bolt origin
agreement, one cue per release; move and dash cancel with no bolt, flash, recoil, record or cue; target death mid
windup leaves no orphan release and the next order fires; pause freezes the shot clock and recoil; at 0.5 and 3.0
attacks per second cadence is unchanged and recoil never exceeds the table; the style fixture's contents and
`draw()` being read-only against a Proxy context, insets included). `npm run typecheck` and `npm run build` pass.
Browser (dev server on 5211, 1600×1100 viewport, `?dev`): Style proof staged, frames saved to `design/style/`
before and after; Reaver reads as a blade carrier at 1× and the chase → windup → sweep → recovery beats are
distinct in the crops; the grayscale inset keeps the wedge, the player and the Reaver body separable; reduced motion
flips with the Screen shake toggle (`rs.reducedMotion` true/false checked from the console). No new console errors
(the only entries were Vite's stale "Outdated Optimize Dep" 504s from the config restart). **Not verified:**
particles off / dense in the browser (gameplay is pinned by `tests/determinism.test.mjs`; the player and Reaver
draws do not read `tuning.particles`), sound in the ear (the synth changes are code-reviewed only), the pixel
alternative (not attempted, per the brief it is a separate experiment).

**Known issues / open decisions:**
- The Style proof Reaver hits a standing player for 14 every swing; kite it or, from the console, `__orbwalk.hp =
  1e6`. It never dies (hp 1e6) so the fixture wave never clears; start a new run to leave it.
- The body casing applies to all six classes (one shared torso), while only the bow is redrawn. The other five
  weapons keep their old silhouettes and colours until slice B; expect a mild mismatch on those classes.
- `saveFrame` and the proof insets need the dev server; the middleware and the fixture button are absent in the
  built site, the `proof` flag is simply never set there.
- After an HMR reload of `App.tsx` the console handle `__orbwalk` can point at a torn-down Arena (300×150 canvas);
  reload the page before saving frames.

**Next bounded task:** one bow playtest. Oscar plays Marksman under Iron for a few waves with sound on and says
whether the release now reads (set → unmistakable release → move while the body recovers), whether the cancel tick
is audible without being a shot, and whether the Reaver reads as a blade carrier and its windup is still honest.
Then, if accepted: brief 03 slice B (Arbalest crank recovery, Garand shoulder impulse with the ping kept, per-hand
pistol recoil, cannon barrel impulse, Skirmisher cocked throw; shared grammar, not shared amplitudes; hit-stop
untouched) and brief 02 slice B (drone and archer first, in the proof scene). If rejected, the numbers to move
first are `WEAPON_PRESENTATION.bow.hold` (0.05) and `kick` (5) and the 80 ms unwind in `Arena.frame`.
