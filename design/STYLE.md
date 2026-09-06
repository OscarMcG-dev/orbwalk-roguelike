# Style contract: a coherent machine-world

The compact rules every actor, weapon and menu glyph follows, so later sessions copy the same choices instead of
inventing a new look per enemy. Decided 2026-09-06 from the "visual identity" brief; the Marksman, the bow and the
Reaver are the accepted proof. Reference frames live in `design/style/` (`before-*` and `after-*`, full frame and
`*-crop-*` at up to 4x; save new ones from the dev console with `__orbwalk.saveFrame('name', { x, y, w, h })`).

## Materials (`MACHINE` in `src/game/render.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `casing` | `#3b4652` | Every body plate and riser. The dominant silhouette. |
| `casingLight` | `#6b7682` | Machined working surfaces (blade slabs). |
| `inset` | `#171d23` | One dark inset per actor: a plate, a pivot, a grip, a nock. |
| `edge` | `#e8dfc8` | Warm off-white working edges: outlines, limbs, strings, cutting edges. |

Two or three value levels per actor, one outline scale (1.5 to 2 units on bodies, 1 on parts). Field stays the
existing dark blue-black; grid and dust stay below enemies in contrast.

## Colour carries meaning, shape and motion carry it too

- Mint / cyan: the player and the player's actions (bolt heads, identity light, rings, order markers).
- Red / pink: hostile danger only. On the Reaver that is the eye, the arming light and the floor wedge, never the
  whole weapon. Telegraphs and hurt text stay red.
- Gold: currency and rewards. Rarity keeps its established colours inside menus.
- Class and enemy colours survive as restrained accents: cape, visor, identity light, outline, hp bar. An actor
  must still be identifiable in grayscale by silhouette and pose (the proof scene draws a grayscale inset for this).

## Actor grammar

- Body: one dominant silhouette (a plate or a broad polygon), one dark inset, one small identity light.
- Weapon: flat planar shapes with a visible grip or pivot. Blades are rigid to their pivot; recoil moves the whole
  upper body, never stretches it.
- Continuous facing and smooth position; geometric art does not mean low-frame-rate motion. Prefer a crisp action
  pose (hand snap, planted bow arm, drawn shoulders) over more rings and bloom. The release has no whole-body ring.
- Danger footprint is drawn from the rule that resolves it and never extended for drama (the Reaver's blade tip
  stays inside the painted wedge; the wedge radius comes from `REAVER.reach + radius + PLAYER_R * 0.6`).
- Readability order: imminent danger, player and release, enemies, pickups, scenery.

## Reduced motion

Screen shake off (or the OS preference) sets `RenderState.reducedMotion`: no camera shake or impact bump, no dash
lean or shoulder compression, recoil at 60%. Release and hit signals stay.

## Not yet in the vocabulary (slice B)

Drone, archer, bomber, leech, splitter, bulwark, miner, hexer, warden, witness bodies; the five other weapon
silhouettes; shop glyphs (replace mixed emoji gradually, keep the semantic labels, same stroke family). Extend only
after the Reaver and bow are accepted in play.
