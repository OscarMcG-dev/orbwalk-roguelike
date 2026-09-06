# Orbwalk Rogue: design pillars

This is the taste document. It says what the game is trying to feel like, what it must never feel like, and
which reference moments to steal from. Every tuning change and every new system should be checked against it.
Claude reads this at the start of every session. Oscar edits it whenever a play session changes his mind.

Companion files: `design/AB-*.md` record each A/B experiment and its verdict. `research/` holds the Candlesan
transcripts and the economy synthesis (`research/candlesan/ECONOMY.md`) that shaped v0.4.

## Pillars

1. **Position first, damage second.** The player wins by being in the right place at the right moment. A
   problem that can be solved by standing still and out-shooting it is a design bug.
2. **Every shot is a commitment.** Windup is a promise. Breaking it to move should cost something you feel.
   The step-shoot-step cadence is the whole skill; the numbers exist to make it matter.
3. **Enemies ask questions, not just deal damage.** Each enemy kind demands a different answer, and the mix on
   the floor forces a priority call. Doom's "combat chess". A wave should read as a sentence, not a crowd.
4. **Legible danger.** Nothing kills you that you could not have seen coming. Telegraphs, projectile shape,
   hit feedback and death cause must all be readable at a glance. Lethal is fine. Unreadable is not.
5. **Power is earned, scarce, and shaped by choice.** Augments are rarer, weaker individually, and the best of
   them are gated behind accepted risk rather than a lucky roll. A strong run should feel authored by the
   player's decisions.
6. **Risk is a contract you sign.** Quests and curses apply the penalty now and pay out later, only if you hold
   up your end. The player should be able to say "I chose this" about every dangerous situation they are in.

## Anti-goals

- Never punish through drop luck alone. A dry shop must have an answer the player can buy (banish, reroll,
  bank gold). Denied power the player could not influence causes rage-quits, not tension.
- Never let base movement trivialise an enemy. If every enemy can be walked away from forever, the kite is a
  screensaver.
- Never make range the whole fantasy. A range advantage should be a margin, not immunity.
- Never stack small percentage taxes. One significant priced decision beats ten micro-costs.
- No unreadable projectiles, no hitboxes larger than the sprite, no damage without a visible source.
- No augment should be a pure stat stick past Silver. Gold changes a rule; Prismatic changes the build.

## Reference moments

Write these as moments, not games. A moment is something Claude can build; a game title is not.

| Source | The moment | What it teaches |
| --- | --- | --- |
| Tiny Rogues | Picking up a weapon changes how you play more than what your numbers say. Rarity means more affixes and stranger ones, not just bigger numbers. Items and weapons sit in different slots and compete for different budgets. | Rarity as *kind* of power, not *amount*. Separate slots for build-defining and stat-shaping loot. |
| Glyphica | A shot connects and the enemy visibly recoils, the floor flashes under it, and the sound is dry and immediate. You never wonder whether you hit. | Hit-stop, hit flash, squash, localised impact feedback. Readability first. |
| Glyphica | Enemies arrive in a rhythm you can feel. A lull is a promise that something is about to happen. | Enemy cadence and roster as a composed sequence, not a spawn rate. |
| Doom (2016) | Every enemy type is a question with a specific answer, and the arena mixes questions so you have to order them. | Enemy roles. Prioritisation as the core skill. |
| Cinderia | Between rooms you see what the next rooms offer and what they cost, and several progression tracks advance at once without stepping on each other. | Previewed, risk-labelled path choice. Orthogonal progression tracks. |
| Shape of Dreams | You accept a curse at a shrine and it hits immediately: drastically more damage taken, or reversed controls. Survive and complete a condition while cursed and it cleanses into a top-tier reward. | Opt-in affliction, cleanse condition, tiered payoff. Risk as a signed contract. |

## Tuning targets

Directions Oscar has asked for, the shipped v0.4 number, and the current hypothesis. "Knob" names are the
sliders in the dev tuning panel (`src/game/tuning.ts`); the source values live in `heroes.ts`, `sim.ts` and
`upgrades.ts`. Bake a number into the source only after it has been played and pinned with a test.

| Target | Direction | v0.4 authored (Marksman) | Shipped "Iron" (chosen after AB-001) | Knob |
| --- | --- | --- | --- | --- |
| Player move speed | Down, significantly | 325 | 260 | playerMove |
| Player attack speed | Down, significantly | 1.30 /s | 0.85 /s | playerAttackSpeed |
| Player windup | Roughly kept | 169 ms | 247 ms (from the slower attack, not a longer fraction) | playerWindup |
| Player range | Down, significantly | 450 | 270 | playerRange |
| Enemy speed | Slightly down | 1.0× | 0.95× | enemySpeed |
| Enemy health | Up | 1.0× | 1.2× | enemyHp |
| Enemy reach (shot speed) | Up, a lot | 1.0× | 1.4× | projectileSpeed |
| Enemy lethality | Up | 1.0× | 1.3× damage, 0.65× telegraph | enemyDamage, telegraph |
| Augment power | Down across the board | 1.0× | 0.75× | augmentPower |
| Draft cadence | Less often | every wave | every second wave | shopEvery |
| Rare augments | Significantly harder to get | 13 / 6 / 1 bag | 22 / 7 / 2 bag | bag knobs |
| Quests | Riskier: penalty now, reward later | passive tracking | Overdraw contract (brief 04): x1.35 damage taken for one wave, +18 gold on clear | overdrawMult, overdrawGold, overdrawFromWave |
| Witness gaze | Attention as a question | not built | 300 u radius, 1.15 s tell (0.85 s floor), 70 degrees either side, 0.35 s stun, 4.5 s cooldown, debut wave 7 | witness* |
| Credits | Earned, not dripped | not built | 4 per cleared wave + 8 per Warden wave, cap 60; case 100; 80 / 19 / 1 | credits*, caseCost, chaseOdds, signatureOdds |

Kite margin is the number to watch: walking speed minus enemy speed. Positive means you can walk away from
it forever. In v0.4 nothing outruns a walking player. Under Iron, drones and bombers still cannot, leeches
can from wave 6, and the Reaver (added 2026-09-05) closes distance at up to 237 against your 260. The
hit-stun shove on every landed bolt is the breathing-room tool against whatever does catch up. Oscar's
choice shifted the pressure onto **reach and reaction time** (40 percent shorter warnings, 40 percent
faster enemy shots, 60 percent player reach) rather than onto enemy movement speed.

## Open tensions

**Range.** Kiting is a range-advantage fantasy. Cutting player range while raising enemy reach can collapse the
kite window entirely and turn the game into a positioning puzzle. Resolution so far: keep a margin, shrink it,
and make enemies dangerous through lunges and burst speed rather than raw base speed.

**Rarity versus the Candlesan stance.** The v0.4 economy follows "do not punish via drop rates" (see
`research/candlesan/ECONOMY.md`, P3). Oscar now wants rares significantly harder to get. Resolution: make
random Prismatics scarce, but make them *earnable* through accepted risk (curses, Ascend, quests with teeth),
so a run without one feels like a choice declined rather than a roll lost. The hidden first-Prismatic
guarantee stays.

## How to give feedback

Oscar does not need the vocabulary. These forms work:

- **A moment.** "When the bomber reached me I had already fired and could not move." Claude turns this into
  a number or a rule.
- **A ratio or an outcome.** "A drone should catch me if I walk without dashing." "I should land about two
  shots per approach."
- **A comparison.** Play preset A, then preset B, then say which felt better and where it fell apart. The
  panel shows which preset is active; the arena header shows it too.
- **A slider position.** Move a slider until it feels right, press Copy JSON, paste it. Claude bakes it in.
- **A death.** "That death felt unfair" is enough. Claude finds out why.

Anti-goals are often sharper than goals. "I never want to feel X" is the most useful sentence in this file.

## Vocabulary (Oscar's words → designer's words)

| You might say | The term | Where it lives |
| --- | --- | --- |
| Slower player, longer windup | Player tempo, commitment, startup | `heroes.ts` profiles, playerWindup knob |
| Faster, deadlier enemies | Enemy pressure, time-to-kill on the player, lethality | `sim.ts` enemy table and hazard damage |
| Enemies reach further | Effective reach: projectile speed × telegraph time, engagement distance | lineDanger speeds, archer ideal distance |
| Reaction time | Telegraph window | danger `delay`, telegraph knob |
| Chunky hits, gamefeel | Hit-stop, hit flash, squash and stretch, impact particles, camera shake | `arena.ts` hitStop, `render.ts`, `sim.ts` impact |
| Enemies come in a rhythm | Cadence, roster, spawn budget, debut rule | `wavePool`, `KIND_COST`, `budget` |
| Augments too strong | Power budget, power curve, compounding | `upgrades.ts` apply functions, augmentPower knob |
| Augments too often | Reward cadence | shopEvery knob, `updateWave` clear state |
| Rares too easy | Rarity weights, marble bag, pity, tier floor | `RARITY_BAG`, `firstPrismaticWave`, `offerTier`, `dryShops` |
| Risky quests | Opt-in affliction, cleanse condition, tiered payoff | quests in `upgrades.ts` (passive today) |
| Choosing the next room | Path selection, previewed rewards, risk labels | not built |
| Systems that overlap | Orthogonal progression tracks | classes, augments, shards, quests |

## Backlog of hypotheses

In rough order. Each becomes an `AB-*.md` when it is tested.

1. **AB-001 Tempo** (done, see `AB-001-tempo.md`): Oscar's chosen numbers shipped as Iron; Easy added.
2. **Curses**: Shrines that apply a penalty immediately (double damage taken, halved range, no dash) with a
   cleanse condition (kill N, survive T, clear the wave untouched) and a tiered payout (Prismatic draft,
   shard bundle, gold). Replaces or reworks the passive quests.
3. **Lunges**: enemy burst speed instead of higher base speed, so the kite margin is a rhythm rather than a
   constant. The Reaver's windup-and-swing is the first enemy built on this idea.
4. **Weapon slot**: a Tiny Rogues-style weapon separate from augments, where rarity adds affixes.
5. **Room choice**: pick the next wave from two or three previewed options with visible risk labels.
6. **Feedback pass, continued**: the bolt glow, longer trail and hit-stun shove landed 2026-09-05. Still to
   do: enemy recoil animation on hit, one-axis vertical shake at 0.1 s, damage numbers that scale with
   overkill.
7. **Bake Iron into the source**: once the numbers stop moving, rewrite the class profiles, enemy table and
   augment values so Iron is the authored scale and the knobs return to 1.

## Decision log

- 2026-09-05: Pillars written from Oscar's notes on Tiny Rogues, Glyphica, Cinderia and Shape of Dreams.
  Tuning panel and presets added. AB-001 measured with the harness; verdict pending play.
- 2026-09-05 (later): AB-001 verdict. Oscar's slider numbers shipped as the Iron preset and made the
  default; Easy preset added as the player-facing easy mode under FEEL. Reaver added (melee, signposted
  windup, locked-facing swing, recovery). Hit-stun shove on landed bolts. Player bolts slowed to 1000 (cannon
  820) with a glow, a longer trail and a diamond head. Ctrl+S no longer opens the browser's save dialog.
- 2026-09-05 (evening): Easy made gentler and given a Pressure slider (0 = floor, 90% = nearly Iron) so the
  easy mode is a range rather than a point. Three weapon classes added, each with its own kiting tempo:
  Arbalest (heavy crossbow: straight piercing quarrel through four bodies, crank rewound only by walking),
  Rifleman (M1 Garand: eight rounds, ping, 1.6 s reload spent moving, R ejects early) and Gunslinger (twin
  Berettas: off-hand shot at a second enemy, thirty rounds, 1.1 s rack). The ammunition systems are the
  first "lunges" on the player side: forced repositioning windows instead of a constant cadence.
- 2026-09-06: Briefs 03, 04 and 05 built in one session. The Witness is the first enemy whose question is about
  attention rather than position ("can you interrupt your firing rhythm for one deliberate turn?"); its facing
  contract (`combatFacing`) is set only by accepted orders so a wrong-looking torso can never be the reason a turn
  was rejected. Overdraw is the first signed contract (pillar 6): chosen in the intermission, priced up front, paid
  once at wave clear, void on death. The Armoury turns pillar 5's "rarity as kind of power" into a meta layer: one
  account currency earned per cleared wave, weapons and parts bought outright or won from one honest case, Finishes
  that touch surfaces only. Class unlocks moved into the same wallet at Oscar's request so the game has one
  progression economy rather than two. All numbers are starting values; the dev panel exposes every one of them and
  the note button (N) is how the verdicts come back.
- 2026-09-06 (later): Visual identity and attack feel, slice A of each. The look is a procedural machine-world
  (`design/STYLE.md`): slate casing, one dark inset, off-white working edges; mint for the player, red for danger
  only, gold for reward. The Marksman, bow and Reaver are the proof; the rest waits on play. The release now reads
  from a pose, not a ring: launch direction held for 50 ms, recoil that peaks at once and eases out, a dry string
  transient, a quiet tick on a cancel. No timing, hit-stop or rule moved (pillar 2 is presented, not re-tuned).
