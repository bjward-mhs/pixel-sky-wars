# pixel-wars

Pixel Wars is a browser-based 2D trench-warfare prototype built around a tiny tile grid, generated mud, captureable trenches, and advancing armies.

## Current Version

**0.9.0 - Player-Centered Side View**

The version history is kept in `game.js` so each published build can show its update summary.

## Current Prototype

- Fullscreen, straight-on 2D side view with no HUD overlay and a player-centered camera.
- Terraria-style column-generated ground with varied surface height and underground air pockets.
- Mud, timber-supported trenches, rain, destructible terrain, and artillery craters.
- Allied and opposing 2x3 pixel soldiers with team-aware targeting.
- Captureable trenches with a front line that can advance or retreat.

## Controls

- `A` / `D`: Move.
- `W`: Jump.
- `F`: Fire the rifle toward the current facing.
- Left click: Fire the rifle toward the cursor.
- `E`: Enter or leave the artillery machine at the original allied trench.
- Left click while operating artillery: Fire at the cursor.
- `R`: Regenerate the battlefield.

Audio begins after the first keyboard or mouse input because browsers block autoplay.

## Roadmap

1. Add a clear player health and ammunition model.
2. Improve terrain collision so soldiers can climb and shelter in every ditch.
3. Add squad orders, suppression, morale, and smarter trench advances.
4. Add artillery reload, shell travel time, warning markers, and stronger craters.
5. Add a start screen, pause control, and a readable end-of-battle report.
6. Add local persistence for seeds, settings, and campaign progress.

### Version History

- **0.9.0** - Added a two-axis camera that centers the player and reveals hills, ditch walls, and deeper underground terrain.
- **0.8.0** - Reworked the game into a fullscreen side view with generated terrain and a close player-centered camera.
- **0.7.0** - Added captureable trench lines, team-aware soldiers, destructible artillery, and artillery mode.
- **0.6.0** - Added campaign weather and the first rainy terrain prototype.
