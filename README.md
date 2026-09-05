# Orbwalk Rogue

A desktop mouse-and-keyboard ADC kiting game. It grew out of the Codex-built **Orbwalk** trainer (kept verbatim in `codex-original/`) and adds a roguelike run on top of the same 120 Hz fixed-step simulation: waves of enemies, permadeath, gold, and an upgrade shop between waves.

## Play

```bash
npm install
npm run dev
```

Open the printed localhost URL. Everything is mouse + keyboard.

| Input | Action |
| --- | --- |
| Right click (hold to steer) | Move |
| `A` then left click | Attack-move. Targets within 220 units of the cursor win, then anything in range, otherwise you walk to the point and engage whatever enters range. Default range is 450 units, adjustable from 350 to 700 in the marksman profile. |
| `E` | Dash toward the cursor. Untouchable for the dash, cancels a windup, 5 s cooldown (reducible). |
| `S` | Stop |
| `Space` / `Esc` | Pause |
| `1`-`4`, `7`-`9`, `F`, `B`, `A`, `R`, `H` | In the shop: pick an augment, buy an anvil shard, fourth offer, banish (then pick), ascend, reroll, heal |
| `Enter` | Start / restart |

Moving before the release cancels the attack. Moving after the release keeps the bolt and the remaining cooldown. That is the whole skill.

### Roguelike run

- **Waves.** Each wave has a spawn budget that grows with the wave number and the threat level. Enemies portal in from the arena edges and are inert until the portal finishes.
- **Enemies.** *Drones* chase and deal contact damage. *Archers* hold range and fire telegraphed line shots. *Bombers* rush you, arm, and detonate a ground burst. From wave 4, *Leeches* sprint in, latch on and drain you while dragging your move speed (kill them on your own body, or dash to shake them off), and *Splitters* divide into two faster halves twice over. From wave 6 the *Bulwark* alternates between planting a tower shield that blocks every bolt arriving inside its frontal arc with its facing frozen, and lumbering forward wide open, so you flank it or wait for the beat; area damage (splash, Tempest, burn) ignores the shield. From wave 7 *Miners* sow proximity mines that arm and then sit, shrinking your kiting space (seven live mines at most). From wave 8 *Hexers* stay far back and cast a miasma that drifts after you and drains anyone standing in it; killing the Hexer dispels its clouds. From wave 3 *Reavers* carry a blade: they chase, and once in reach they lock their facing and wind up while a red wedge fills on the floor in front of them, then swing along that locked line and pause to recover. Step out of the wedge and the swing whiffs (it counts as a dodge); stand in it and it hurts. Each kind is guaranteed to appear on the wave that introduces it.
- **Hit-stun.** Every landed bolt shoves an ordinary enemy a step away from you and freezes it for a few frames. It is deliberately small, enough to buy a stride of breathing room while kiting something faster. Wardens, planted Bulwarks and latched Leeches do not budge; cannon shells shove harder. A *Warden* leads every third wave with spread volleys, ring bursts and ground bursts; every sixth wave it is an oversized *Overseer*.
- **Champions.** From wave 4 ordinary enemies may roll an affix (5 % rising to 22 %), announced with a coloured aura, a label and a low chord. *Swift* is 40 % faster and worth double. *Volatile* detonates a ground burst on death. *Warded* raises a bolt-proof ward for 1.3 s of every 4.5 s. *Gilded* carries a fivefold bounty but flees and escapes after 14 s if you let it.
- **Gold.** Kills drop orbs that fly to you inside your magnet radius. Clearing a wave pays a bonus.
- **Draft (Arena-style).** Clear a wave and choose one of three augments in Silver, Gold or Prismatic tiers. Each slot draws its rarity from a 20-marble bag (13 Silver, 6 Gold, 1 Prismatic) so the randomness has memory rather than being a coin flip. Every fourth wave skips Silver; only waves 12 and 24 are Prismatic-only drafts. The first Prismatic of a run is guaranteed on a hidden wave rolled at the start (somewhere between 4 and 9), so there is no wave to farm towards, and a run holds at most four Prismatics. Offers sharing a tag with augments you already hold are weighted up and marked *synergy*; two dry Silver-only shops in a row guarantee a Gold-or-better offer. Each draft favours tag diversity so three offers rarely come from one lane.
- **Shop economy.** Gold is meant to run out. One reroll is free per run, then rerolls cost 4, 8 and 16 gold within a shop. The heal is one per shop, restores 35 % and costs 8 gold plus 3 per wave. The Stat Anvil sells at most two shards a shop and its price climbs for the whole run (6 gold, then +4 per shard bought, never resetting). Three further sinks compete for the same purse: **Banish** (6 gold) removes an offer from the run's pool for good and redraws the slot; **Fourth Offer** (10 gold plus 2 per wave) reveals one more augment, Gold or better, with its rarity still drawn from the bag; **Ascend** (30 gold plus 4 per wave) makes the next shop a Prismatic draft and is the one big purchase worth saving for. A seeded spend-everything pilot earns about 180 gold to wave 10 and finishes with single digits. Keys in the shop: 1-4 pick, 7-9 anvil, F fourth offer, B then 1-4 banish, A ascend, R reroll, H heal.
- **Augment ecosystem.** The pool branches. *Combo augments* only enter the draft once their prerequisite is owned and are labelled with what unlocked them: Frostbite (Frost Tips), Wildfire (Slow Cooker), Thunderhead (Tempest), Kinetic Rounds (Momentum), Overflow (Vampiric Fletching or Second Wind). *Class augments* are offered to one class only: Overclock lets the Cannoneer's max-heat shell skip the windup drag and hit for +75 %; Quickdraw gives the Marksman a windup-free first bolt at every new target; Riposte refunds the Skirmisher 0.6 s of dash cooldown per enemy cut, up to three. *Quests* come in three kinds and a run holds one: Vow of the Hunt (25 kills), Dodger's Oath (40 dodges) and Marksman's Wager (30 crits). Several prismatics carry real trade-offs: Hunter's Focus ramps damage on one target and resets on a switch, so it fights Split Shot and Ricochet; Last Stand pays out only below half health.
- **Stat Anvil shards** are small permanent stat bumps (damage, attack speed, HP, move speed, range, crit, armour, gold). Attack speed above 2.4 is compressed to 40 % effectiveness before the hard cap of 3, so the Rapid Fire lane cannot run away with the game.
- **Augments.** Silver: Rapid Fire, Longbow, Swift Boots, Heavy Bolts, Iron Skin, Snap Shot, Fleetfoot, Coin Pouch. Gold: Keen Eye, Vampiric Fletching, Second Wind, Phase Step, Frost Tips, Gold Sense, Split Shot, Ricochet, Blast Quiver, Adrenaline, Shatter Point (crits mark the target to take 20 % more), plus the combo and class augments above. Prismatic (build-defining, one stack): Tempest (chain lightning every third attack), Momentum (movement stacks attack speed, standing still bleeds it), Executioner, Twin Step (two dash charges, slower recharge), Scopiest Weapons, Slow Cooker (burn), Hunter's Focus, Last Stand, Overflow (overheal becomes a 40-point shield), and the three quests. See `src/game/upgrades.ts`.
- **Classes.** *Marksman* is the baseline. *Cannoneer* unlocks by reaching wave 4: slow, long-range splashing shells, a recoil hop that jumps AWAY from the cursor, and a heat mechanic where shells fired without moving in between drag out the next windup until you move 40 units to vent. *Skirmisher* unlocks at 200 career kills: short range (260), very fast throwing blades, 90 HP. A blade released within half a second of moving is a **Tempo** shot (+40 % damage, +15 % crit), so the class rewards the step-throw-step cadence the Cannoneer punishes you for skipping. E is a blade dash that cuts every enemy it passes through once, and the class-only Riposte augment refunds dash cooldown per cut. See `src/game/heroes.ts`.
- **Mid-wave events.** From wave 3, up to 75 % of waves hide a surprise that lands 2.5 to 7 s into the fight, announced by a banner and an alarm; from wave 8 a second one may follow at least six seconds later. Threats: *Ambush* (omens ring you at close range for 1.1 s, then portals open there; leeches from wave 4), *Barrage* (wave 4+, seven staggered ground bursts, three on you), *Champion* (wave 5+, an affixed enemy joins). Reward: *Bounty*, a large gold cache across the arena that expires after 9 s. Choices, which make up at least a third of what fires: *Tithe* (wave 4+) is a shrine that pays 10 gold plus 2 per wave if you touch it within 8 s, and then calls three reinforcements at +25 % HP around you; *Cull* (wave 6+) marks three fleeing quarry worth 8 gold each and you take 20 % more damage until every one is dead or has escaped after 12 s. Fairness clause: no threat event fires in the first 1.5 s after you drop below a quarter health. Open omens keep the wave alive; an event never fires into an empty arena.
- **Ramp and enrage.** The spawn budget is linear to wave 8 and then grows a further 5 % per wave; enemy HP gains 6 % per wave past 8. Wardens come every third wave to wave 9, every wave from 10, and in pairs on every sixth wave. Every wave carries an enrage clock (40 s plus 2.5 s per wave of fighting) shown as a bar when it nears; past it, enemies gain 8 % speed and 10 % damage every five seconds. Champion affixes appear on up to 30 % of spawns but pay only modest gold (1.5×, Gilded 3×), so danger no longer pays for itself.
- **Death** ends the run. Best run and career progress (best wave, kills, runs) live in `localStorage` and drive unlocks.

### Design documents and tuning

- `design/PILLARS.md` is the taste document: pillars, anti-goals, reference moments, tuning targets and a vocabulary table. `design/AB-*.md` record each A/B experiment.
- **Feel.** The run settings offer two feels. *Iron* (default) is the intended game: 60 % reach, slow deliberate shots, fast enemy fire with short warnings, weaker augments, a draft every second wave and a rarer Prismatic. *Easy* sits halfway back toward the original kite with a draft every wave. Both are presets over the same authored numbers (`src/game/tuning.ts`); the arena header names anything other than Iron.
- The dev build shows a **Tuning** panel under the run settings (also available in any build with `?tuning=ledger`, `?tuning=iron` or `?tuning=easy` in the URL). Its sliders are live multipliers over the authored numbers in five groups: player tempo (move, attack speed, windup, range), enemy pressure (speed, health, damage, shot speed, telegraph window), feel (bolt speed, dash distance, hit shove, hit freeze, hit-stop, screen shake, combat text size, particles), pace (spawn gap, wave size) and draft (augment power, draft cadence, rarity bag). Changes apply immediately, mid-run included, and persist in `localStorage`. Copy JSON exports the current values.
- `npm run ab [presetA] [presetB] [runs] [targetWave]` runs the seeded harness pilot under two presets and prints a markdown comparison (player numbers per class, kite margins, threat curve).

### Training drill

The original 60-second trainer is still here under **Training drill**: Kite + dodge, Rhythm, and Dodge, with the same tunable marksman profile. Hits do not cost HP there.

## Animations and feedback

**State cues.** A cyan ring expands from the player and the E badge pulses when a dash charge comes back, with a short chime. The inner ring ticks bright when the attack cooldown ends. The range ring turns amber while chasing a target that is out of range. The last enemy of a wave carries a slow gold pulse. A pink edge flash marks a Warden arrival. Dodge streaks announce every fifth dodge, and overkills are called out. Landed hits add a tenth-of-a-second vertical impact bump on top of the screen shake, and kill bursts scale with overkill.

The marksman is an articulated top-down figure: the legs, feet and cape live in run-facing space (stride cycle, foot lift, rippling cape, footstep dust, speed lines on a dash) while the torso, head, quiver and bow rotate separately toward the aim, so you visibly run one way and shoot another. The bow arm draws the string and nocks an arrow through the windup, snaps forward with a muzzle flash on release, and the torso recoils. Hits blink the body white, low health adds a tremble, and death shatters the figure.

Particle bursts on hits, kills and pickups; death shatter; spawn portals with ease-out-back scale; dash ghost trail; projectile and bolt trails; bowstring draw during windup and a muzzle flash on release; squash-and-stretch while running; screen shake and hit-stop on impacts (shake can be toggled); floating damage numbers with crit emphasis; wave banners and a wave-clear celebration; elite health bar; low-HP vignette; a drifting grid and ambient dust that tint with the wave; procedural sound for shots, hurt, kills, pickups, dashes, wave clears, upgrades and death.

## Code layout

```
src/game/types.ts     shared types
src/game/math.ts      arena constants, geometry, seeded RNG, easing
src/game/upgrades.ts  relic pool and stat derivation
src/game/sim.ts       headless simulation: orders, waves, enemy AI, combat, shop
src/game/render.ts    canvas renderer (all visuals live here)
src/game/audio.ts     procedural sound bank
src/game/arena.ts     input, fixed-step loop with hit-stop, sound cue diffing
src/game/webmcp.ts    optional WebMCP tool registration
src/App.tsx           React shell, overlays, settings panel
tests/                node:test suites run directly against the .ts sources
```

The simulation is deterministic (seeded PRNG) and renders nothing, so all mechanics are tested headlessly.

## Develop and validate

```bash
npm test          # 103 tests: original mechanics, roguelike loop, cues, classes, Arena draft, enemy pool, augment ecosystem, Skirmisher, mid-wave events, seeded economy pins
npm run typecheck
npm run build
```

Node 22.6+ is required (tests import `.ts` directly through Node's type stripping).

## Research

`research/candlesan/` holds transcripts pulled with yt-dlp from sixteen Candlesan game-design videos plus `NOTES.md`, a synthesis with prioritised recommendations, and `ECONOMY.md`, a second synthesis on drop economies, pity, punishment and difficulty pacing that drove the meta-economy tuning (measured before and after in `research/BASELINE-v0.3.md`). The tuning deliberately keeps draft variance and instead lowers the guaranteed power floor and prices the answers, because the transcripts are clear that runs punished by the rarity roll itself produce rage-quits rather than tension. The impact bump, marble-bag enemy draws, offer pity, overkill-scaled bursts, dash-ready chime and the Twin Step trade-off came straight from it, as did the champion affixes (rare elite spawns that break autopilot), the per-archetype telegraphs on the new enemies, and the nested difficulty curve where each enemy kind debuts on a fixed wave.

## Differences from the Codex original

The original shipped on the Vinext / Cloudflare / shadcn starter tied to Codex hosting. This clone runs on plain Vite + React with no UI library, and the one-line-per-method source was expanded into readable modules. Attack-move now behaves like the real thing when nothing is in range (walk to the point, engage on the way), and the game loop keeps stepping through a timeout watchdog when `requestAnimationFrame` stalls.

Still an independent game, not a League client simulation: no pathfinding obstacles, latency, or champion-specific scaling.
