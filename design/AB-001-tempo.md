# AB-001: Tempo. Ledger (A) versus Iron (B)

Status: measured with the harness on 2026-09-05, awaiting Oscar's play verdict.

## Question

Does a slower, more committed player against faster, deadlier enemies make positioning matter more without
collapsing the kiting fantasy? Pillars 1 and 2, with the range tension in mind.

## The variants

Both presets live in `src/game/tuning.ts`. Switch in the dev panel or open the game with `?tuning=iron`.

| Knob | A Ledger | B Iron |
| --- | --- | --- |
| Player move speed | 100% | 85% |
| Player attack speed | 100% | 80% |
| Player windup | 100% | 125% |
| Player range | 100% | 85% |
| Enemy speed | 100% | 120% |
| Enemy damage | 100% | 130% |
| Enemy shot speed | 100% | 120% |
| Telegraph window | 100% | 85% |
| Draft (power, cadence, bag) | authored | authored, unchanged on purpose |

## What the player numbers become

| Class | Variant | Walk | Shots / s | Windup ms | Range |
| --- | --- | --- | --- | --- | --- |
| Marksman | A | 325 | 1.30 | 169 | 450 |
| Marksman | B | 276 | 1.04 | 264 | 383 |
| Cannoneer | A | 305 | 0.80 | 375 | 560 |
| Cannoneer | B | 259 | 0.64 | 586 | 476 |
| Skirmisher | A | 350 | 2.00 | 90 | 260 |
| Skirmisher | B | 298 | 1.60 | 141 | 221 |

The Cannoneer's 586 ms windup under B is the number most likely to feel wrong. Its heat mechanic already
lengthens the windup for standing still, so B may double-punish it. Watch for this.

## Kite margin (Marksman walking speed minus enemy speed)

Negative means the enemy catches a walking player. Dashing and shooting are then the only answers.

| Wave | Variant | Drone | Archer | Bomber | Leech |
| --- | --- | --- | --- | --- | --- |
| 1 | A | 184 | 150 | 106 | 70 |
| 1 | B | 107 | 66 | 13 | -30 |
| 4 | A | 166 | 150 | 94 | 55 |
| 4 | B | 85 | 66 | -1 | -48 |
| 6 | A | 154 | 150 | 86 | 45 |
| 6 | B | 71 | 66 | -11 | -60 |
| 10 | A | 130 | 150 | 70 | 25 |
| 10 | B | 42 | 66 | -30 | -84 |
| 12 | A | 118 | 150 | 62 | 15 |
| 12 | B | 28 | 66 | -39 | -96 |

In A, nothing on the roster outruns a walking player, ever. That is the screensaver anti-goal. In B the
leech is a real threat from the first wave and the bomber becomes one from wave 4, while drones remain
something you can walk away from all game. Whether that split is right is the first thing to feel for.

## Harness threat curve

Seeded godmode pilot, 30 runs each to wave 12, standard, Marksman. The pilot never moves or dodges, so
"damage per second" is pressure on a stationary target, not a survival prediction. It is fair for
comparing A with B because both variants meet the same pilot.

| Wave | Seconds A | Seconds B | Damage / s A | Damage / s B |
| --- | --- | --- | --- | --- |
| 1 | 11.1 | 13.0 | 0.3 | 3.7 |
| 2 | 11.8 | 14.4 | 3.4 | 7.5 |
| 3 | 26.6 | 28.3 | 10.4 | 11.4 |
| 4 | 27.7 | 30.5 | 16.3 | 22.2 |
| 5 | 23.7 | 26.0 | 12.4 | 16.8 |
| 6 | 65.8 | 76.7 | 13.9 | 19.9 |
| 7 | 27.2 | 29.7 | 9.5 | 18.3 |
| 8 | 27.7 | 33.9 | 20.7 | 31.6 |
| 9 | 38.4 | 47.7 | 25.1 | 35.6 |
| 10 | 43.7 | 59.3 | 29.4 | 49.0 |
| 11 | 45.1 | 58.0 | 34.7 | 49.8 |

| Run totals, median | A | B |
| --- | --- | --- |
| Damage to the stationary pilot to wave 12 | 6356 | 10649 |
| Run seconds to wave 12 | 332 | 417 |
| Prismatics owned | 2 | 2 |
| Gold earned | 271 | 287 |

Reading: B is about 1.7× as punishing overall and every wave lasts roughly a quarter longer because the
player kills slower. Wave 1 goes from harmless to a real first hit. Waves 10 and 11 climb steeply in B;
if the late game already felt too hard on standard, B will need the enemy scaling flattened past wave 8
to compensate. The draft is untouched, so B's run grows in power at the same rate against a harder floor.
Regenerate with `npm run ab` (arguments: presetA presetB runs targetWave).

## What to play for

Play two or three runs of each on standard with the Marksman, then answer in whatever words come:

1. Under B, does the longer windup make you think before each shot, or does it just feel laggy?
2. Under B, when a leech or bomber catches you, did it feel like your mistake or like the game's?
3. Under B, does the Skirmisher still feel like the fast class?
4. Under either, was there a moment you stood still and shot and it was the right call? That is a pillar 1
   violation and worth noting where it happened.
5. Did waves 1 and 2 under B feel like a good opening, or too sharp before the first draft?

## Verdict (2026-09-05)

Oscar played both and dialled his own numbers from B. The chosen feel, now the shipped **Iron** preset and
the default for new installs:

| Knob | Hypothesis B | Chosen (Iron) |
| --- | --- | --- |
| Player move speed | 85% | 80% |
| Player attack speed | 80% | 65% |
| Player windup | 125% | 95% |
| Player range | 85% | 60% |
| Enemy speed | 120% | 95% |
| Enemy health | 100% | 120% |
| Enemy damage | 130% | 130% |
| Enemy shot speed | 120% | 140% |
| Telegraph window | 85% | 65% |
| Augment power | 100% | 75% |
| Draft every | 1 wave | 2 waves |
| Rarity bag | 13 / 6 / 1 | 22 / 7 / 2 |

Reading the choice: the tempo shift landed on **reach and reaction time**, not raw enemy speed. Enemies are
slightly slower than authored but shoot much faster with much shorter warnings, and the player's reach is
cut to 60 percent. The windup stayed almost authored, so commitment comes from attack speed (0.85 shots per
second on the Marksman) rather than a longer startup. The draft was folded in at the same time: weaker
augments, half as many drafts, and a bag that is 71 percent Silver with two Prismatic marbles in 31.

Under Iron a walking Marksman still outpaces drones and bombers all game; only leeches close in, from wave
6. The hit-stun knockback added alongside this (a small shove and a few frames of freeze per landed bolt)
is the breathing-room tool for the enemies that do catch up.

An **Easy** preset was added at the same time for a player-facing easy mode: halfway back toward Ledger on
every continuous knob, a draft every wave, one Prismatic marble in 23. Both are selectable under FEEL in
the run settings. Ledger stays as the dev reference scale.
