# Orbwalk

A desktop mouse-and-keyboard ADC kiting trainer. Canvas 2D renders an original geometric arena; a custom 120 Hz fixed-step simulation handles movement, attack timing, and continuous relative-motion projectile collision. React provides the setup panel through the Sites/Vinext starter.

## Play

- Right-click to move; hold right-click and move the mouse to update the destination.
- A arms attack-move; left-click issues it. Enable one-key mode for A at cursor.
- Attack-move prioritizes targets within 220 units of the cursor, with an in-range fallback. It approaches distant selected targets and repeats attacks until a movement/stop command replaces the order.
- S stops; Space pauses/resumes; Enter starts from the opening or results screen.
- Movement before release cancels windup. Movement after release leaves the projectile and remaining attack cooldown intact.
- Switching tabs/windows pauses the simulation. Fullscreen is available in the arena.
- Sessions last 60 seconds and do not end on damage. Dodge rate counts resolved hazards, not hazards still in flight at the time limit.

## Develop and validate

Run `npm install`, `npm run dev`, and `npm run build`. Run `node --test tests/mechanics.test.mjs` on Node 24 for the simulation suite and `npx tsc --noEmit` for type checking.

Thirteen mechanics and keyboard tests cover cancellation, post-release movement, cooldown enforcement, target acquisition and approach, movement speed, swept collision, ground warning timing, pause/end behavior, and complete sessions at every pressure level. Browser checks verified A shows AIMING and a bright range circle, left-click releases a visible projectile, S interrupts movement, and hotkeys work after a setup button is focused. WebMCP is feature-detected; live registration is visible in the browser; its full contract has not been tested.

## Research and limits

Luna researched Phaser and the attack-timing model. A custom Canvas loop was chosen for this small arena because it offers direct input handling and independent simulation without adding an unused physics or scene stack. Phaser remains suitable for a larger game with animated character assets and richer maps.

- https://docs.phaser.io/
- https://www.leagueoflegends.com/en-sg/news/game-updates/patch-13-22-notes/
- https://wiki.leagueoflegends.com/en-us/Attack_timer

This is an independent trainer, not a reproduction of League's client. Timings are adjustable; champion-specific windup scaling, pathfinding obstacles, latency, target collision radii, damage systems, and champion animations are not modeled. Geometric avatars deliberately prioritize readable timing and hitboxes.
