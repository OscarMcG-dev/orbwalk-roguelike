# System map

Where each mechanic lives, who reads it, and what pins it. Read the row you need, then the brief; do not sweep the
repository. Search by symbol, not line number. `codex-original/` is the historical Next.js port and is out of scope.

**Shape.** `Simulation` (`src/game/sim.ts`) is the headless, deterministic, 120 Hz owner of every rule. `Arena`
(`src/game/arena.ts`) subclasses it to add pointer/keyboard input, the fixed-step frame loop with hit-stop, audio cue
diffing and `notify(snapshot)`. React (`src/App.tsx`, `src/ui/*.tsx`) only sends commands and renders `Snapshot`;
`src/game/render.ts` reads live `Simulation` fields for the canvas. Tests import the `.ts` sources directly.

## Update order (one `Simulation.update(dt)` step, `status === 'running'` only)

1. Timers and flashes: adrenaline, drain print, reload clock, dash recharge and ready cue.
2. `updateWave(dt)`: `banner -> spawning -> fighting -> clear -> none`, then `openShop()` or `beginWave(n+1)`.
3. Omens count down (`resolveOmen`); fairness clause (low-HP timer) bookkeeping.
4. `updateEnemy(e, dt)` for every live enemy (AI, contact damage, hazards they emit).
5. Attack timing: windup, `release()`, cooldown, attack-ready cue.
6. Dash movement, then walking movement and hero mechanics driven by movement (crank, momentum, Tempo).
7. Ghosts, bolts (`landBolt`, `stepPierce`), beams.
8. Drill hazard spawner (drill mode only), then dangers resolve (`takeHit`, `drain`).
9. Gold orbs (pickup), then particles and effects decay.

## Systems

| System | Owner (file / symbols) | Commands | State | Phase | Readers | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Movement / orders | `sim.ts` `move`, `stop`, `cancel`, `dash`, `effectiveMoveSpeed` | `move(p)`, `stop()`, `dash(p)`; `Arena.handleKey` (S, A, E) and pointer | `player`, `destination`, `dashing`, `dashCharges`, `dashCd`, `momentum` | 6 | `render.ts` (`destination`, `dashing`), snapshot `dashCd`/`dashCharges` | `mechanics`, `skirmisher-events` |
| Attack rhythm | `sim.ts` `attack`, `acquire`, `canFire`, `release`, `rollDamage`, `fireAt`, `effectiveWindup`, `effectiveAttackSpeed` | `attack(p)`; right-click / A in `Arena` | `target`, `windupLeft`, `cooldown`, `attackOrder`, `fired`, `cancelled` | 5 | `render.ts` (`windupLeft`, `armed`, `recoil`), `arena.ts` `shotEvent` | `mechanics`, `weapons` |
| Weapons / classes | `heroes.ts` `HEROES`, `Hero.profile`, `Weapon`; `sim.ts` `startReload`, `reload`, `firePierce`, `stepPierce`, `tempest`, `landBolt` | `reload()` (R) | `ammo`, `reloadLeft`, `crank`, `heat`, `tempoShots`, `focusStacks`, `latched` | 5, 6, 7 | `render.ts` (`heat`, `crank`, `ammo`, `reloadLeft`), `arena.ts` ping / rack / loaded cues | `weapons`, `expansion`, `skirmisher-events`, `arena-upgrades` |
| Player damage / death | `sim.ts` `hazardDamage`, `absorb`, `hurt`, `drain`, `takeHit`, `contactHit`, `heal`, `die` | none (internal) | `hp`, `shield`, `invulnerable`, `hurtFlash`, `dead`, `lowHpTimer` | 4, 8 | `render.ts` `drawHud` (in-arena vitals: health, shield, gold, dash pips), snapshot `hp` / `shield`, `arena.ts` `hitEvent` | `mechanics`, `roguelike`, harness `damageByWave` |
| Enemy roster / spawn | `sim.ts` `KIND_COST`, `DIFF`, `wavePool`, `budget`, `beginWave`, `drawKind`, `spawnPoint`, `spawnEnemy`, `makeEnemy`, `applyAffix`, `drawAffix`, `splitEnemy`, `wardenCount` | `beginWave(n)` (wave flow only) | `bag`, `spawnQueue`, `spawnTimer`, `affixBag`, `enemies` | 2 | `render.ts` (`enemies`, `spawnQueue`), snapshot `enemiesLeft` | `expansion`, `roguelike`, `reaver` |
| Enemy AI / combat | `sim.ts` `updateEnemy` (per-kind branches), `flee`, `knock`, `damageEnemy`, `blocks`, `kill`, `REAVER` | none | per-enemy fields on `types.ts` `Enemy` (`phase`, `cooldown`, `wobble`, `burn`, `pattern`) | 4 (AI), 7 (bolt hits) | `render.ts` per-kind draw, `arena.ts` kill / block / swing / cut cues | `expansion`, `reaver`, `mechanics` |
| Hazards | `sim.ts` `lineDanger`, `circleDanger`, `mineDanger`, `cloudDanger`, `telegraph`, `spawnDrillHazard`, `MINE_CAP`, `CLOUD_CAP` | none (emitted by enemies and events) | `dangers`, `nextDanger` | 4 (emit), 8 (resolve) | `render.ts` (`dangers`), snapshot `dodged` | `mechanics`, `expansion` |
| Wave flow / events | `sim.ts` `updateWave`, `scheduleEvents`, `scheduleEvent`, `fireEvent`, `announce`, `resolveOmen`, `takeTithe`, `farPoint`, `EVENT_LABEL` | none | `wave`, `waveState`, `waveTimer`, `fightTime`, `pendingEvents`, `omens`, `eventBanner`, `cullIds` | 2, 3 | `render.ts` (`waveState`, `eventBanner`, `enrage`), snapshot `event` / `cull` / `enrageIn` | `skirmisher-events`, `roguelike`, `economy` |
| Draft / shop / economy | `sim.ts` `openShop`, `rollOffers`, `drawAugment`, `drawRarity`, `resolveRarity`, `toOffer`, `rollAnvil`, `choose`, `reroll`, `buyHeal`, `buyShard`, `buyFourth`, `toggleBanish`, `banish`, `ascend`, `continueWave`, `nextShopWave`, `healAmount`, `anvilPreview`, `recomputeStats`; `upgrades.ts` `UPGRADES`, `eligible`, `offerTier`, `computeStats`, `SHARD_POOL`, `PRISMATIC_CAP` | `choose(i)`, `reroll()`, `buyHeal()`, `buyShard(i)`, `buyFourth()`, `toggleBanish()`, `banish(i)`, `ascend()`, `continueWave()`; keys 1-4, 7-9, R, H, F, B, A, Enter (depart) | `status === 'choosing'`, `draftClaimed`, `claimedOffer`, `offers`, `offerTier`, `anvil`, `gold`, `relics`, `shards`, `rarityBag`, `firstPrismaticWave`, `dryShops`, `banished`, `ascendNext` | 2 (opens on `clear -> none`) | `ui/ShopOverlay.tsx` (presentation only) via snapshot prices and previews (`rerollCost`, `healCost`, `healAmount`, `anvilCost`, `anvilPreview`, `fourthCost`, `banishCost`, `ascendCost`, `nextWave`, `nextShopWave`); `webmcp.ts`; `arena.ts` `buyEvent` cue | `intermission`, `economy` (seeded pins), `arena-upgrades`, `roguelike`, `tuning` |
| Quests | `upgrades.ts` `activeQuest`; `sim.ts` `advanceQuest` | none | `questProgress`, `questDone` | 4, 7 (on kill / crit / dodge) | snapshot `questProgress` / `questNeed`, `arena.ts` `questEvent` | `arena-upgrades`, `roguelike` |
| Gold orbs | `sim.ts` `kill` (drop), orb loop in `update` | none | `orbs`, `gold` | 9 | `render.ts`, `arena.ts` `pickupEvent` | `economy`, `roguelike` |
| Tuning | `tuning.ts` `Tuning`, `DEFAULT_TUNING`, `TUNING_KNOBS`, `TUNING_PRESETS`, `easyBlend`, `normaliseTuning`, `rarityBag`, `scaleAugments`, `kiteMargins`; `sim.ts` `setTuning` | `setTuning(patch)` | `tuning` (read at use sites, never copied into entities) | all | `ui/tuning.tsx` panel, `App.tsx`, `render.ts` | `tuning`, `tests/ab-report.mjs` |
| Cosmetics (particles, effects, shake) | `sim.ts` `burst`, `puff`, `ring`, `effect`, `MAX_PARTICLES`; all randomness via `fx` | none | `particles`, `effects`, `beams`, `ghosts`, `shake`, `impact`, `flash` pulses | 9 | `render.ts` only | `determinism` (particles on/off gives identical gameplay) |
| RNG / determinism | `math.ts` `Rng` (`seed` is public); `sim.ts` `rng = new Rng(7)` at construction, not reseeded by `start()`; `fx = new Rng(rng.seed ^ FX_SEED_SALT)` in `start()` for cosmetics only | tests set `sim.rng.seed` before `start()` (`tests/harness.mjs`) | `rng.seed`, `fx.seed` | all | none | `economy` pins depend on the exact gameplay draw sequence; `determinism` pins the split |
| Frame loop / input / audio | `arena.ts` `frame`, `schedule`, `handleKey`, `point`, `configure`, `pause`, `togglePause`, `destroy`; `hotkeys.ts` `browserChord`; `audio.ts` `Synth` | `configure(settings)`, `start()`, `pause()`, `togglePause()` | `acc`, `hitStop`, `rs: RenderState`, `*Event` counters on `Simulation` | outside the sim (wraps steps 1-9) | `render.ts` `draw(sim, canvas, ctx, alpha, rs)` | `arena-upgrades` (Arena draft), `hotkeys` |
| Persistence | `App.tsx` `BEST_KEY`, `PROGRESS_KEY`, `TUNING_KEY`, `EASY_KEY` via `loadJson` / `saveJson`; `heroes.ts` `Progress`, `isUnlocked` | none in the sim | localStorage only; the sim holds no persistent state | on `status` change notify | `App.tsx` | `expansion` (unlock rules) |
| WebMCP / trainer | `webmcp.ts` `registerTrainerTools` | wraps `start`, `pause`, `togglePause`, `choose`, `reroll`, `buyHeal`, `buyShard`, `snapshot` | none | n/a | external agents | none |

## Integration checklist

**New enemy:** `EnemyKind` in `types.ts`; `KIND_COST`, the colour table and the `wavePool` debut in `sim.ts`; a stats
branch in `spawnEnemy`; a named `phase` on `Enemy` if it has states; behaviour in `updateEnemy`; a draw branch in
`render.ts`; an optional cue counter diffed in `Arena.frame`; a test in `tests/expansion.test.mjs` or its own file.

**New shop command:** a method on `Simulation` guarded by `status === 'choosing'`, gold and (if it edits the draft)
`!draftClaimed`; its price and any preview exposed through `snapshot()`; `buyEvent++` if it is a purchase; a key in
`Arena.handleKey`; a button in `ui/ShopOverlay.tsx` calling `g?.command()`; an optional `webmcp.ts` action; a pin in
`tests/intermission.test.mjs`, then re-run `tests/economy.test.mjs`.

## Validation

`npm test` (node:test, 136 tests at 2026-09-05), `npm run typecheck`, `npm run build`, `npm run ab A B runs wave`.
CI (`.github/workflows/deploy.yml`) runs test and build on push to `main`, then deploys `dist/` to GitHub Pages at 1v5.dev.
