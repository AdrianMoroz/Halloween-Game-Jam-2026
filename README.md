# The Last Disciple — first playable prototype

A static Three.js browser game implementing the supplied Radiant Yang Sect / Yin Ghost General concept. **The Last Disciple is a working title.** This package is a starting implementation, with procedural 3D art and provisional balancing.

There are three playable courtyards, followed by a summit encounter. Sneak past guards or execute them, intercept fleeing witnesses, and survive a horde if a witness escapes. Choose four skills before each level and upgrade HP, movement speed, vision, or casts between levels. Campaign stealth kills determine the grandmaster's strength and the ≥90% immortal branch.

## Play locally on Windows

1. Extract the entire ZIP into a folder.
2. Double-click **start.bat**. Python 3 must be installed; the launcher supports `py` and `python`.
3. The launcher starts a local server and opens the game in your default browser. Keep its terminal window open while playing.

Alternatively, open the folder in VS Code and use Live Server on `index.html`.

**Opening `index.html` directly by double-click does not work:** browsers restrict JavaScript module loading over `file://`. Use the launcher or a web server. GitHub Pages serves the modules normally.

## Play locally on macOS / Linux

```sh
python3 serve.py
```

For a manually opened browser:

```sh
python3 serve.py --no-browser
```

Open the printed URL, normally `http://localhost:8000/`. If that port is occupied, the launcher selects a free port up to 8010. You can choose another range with `--port 9000`.

Node.js is **not required to play**. Three.js r180 is vendored inside `vendor/`; there are no CDN, font, texture, API, or runtime network dependencies after the static files load.

## Publish on GitHub Pages

1. Put the **contents** of this project folder in your repository's root. `index.html`, `styles.css`, `src/`, `vendor/`, and `.nojekyll` must sit at that root. Do not upload only the ZIP.
2. Commit and push to the repository's publishing branch, commonly `main`.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Choose your publishing branch and **/ (root)**, then save.
6. Open the URL GitHub provides after deployment.

All asset and module paths are relative. The same files work at a project URL such as `https://USERNAME.github.io/REPOSITORY/`; no base-path rewrite or build is needed.

GitHub Pages documentation: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

Python is only a local development convenience. The deployed game is entirely static and does not run Python on GitHub Pages.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move on the grid |
| Shift + direction | Face without moving |
| 1–4 | Cast an equipped skill |
| Hover a skill button | Preview target tiles |
| Space, at the summit | Basic soul strike, one tile ahead |
| Esc | Pause / resume |
| Shift + / (`?`) | Open controls |
| R | Restart the current attempt |
| Touch direction buttons | Move on devices with a coarse pointer |
| Touch skill buttons | Cast |

Move onto a guard from outside their sight to begin a 2.5-second execution. Movement and spell input are locked until it finishes. A corpse then appears. Stand still on it for two seconds to dispose of it.

If a guard sees you or a corpse, they flee to the nearest reachable walkable boundary tile. Intercept every fleeing witness before one escapes. A witness reaching the boundary starts Horde Mode: the whole map becomes visible, stealth spells lock, and reinforcements chase you. The glowing exit remains available.

Desktop keyboard controls are the primary interface. Touch movement and casting are included, but dedicated touch-only facing controls and mobile balance are unfinished.

## Implementation coverage

| Supplied stage | Implemented |
| --- | --- |
| 1 — Engine and stats | Grid, obstacle tiles, exits, facing, interpolated movement, HP starting at 1, upgradeable speed/vision/casts, wall-occluded fog |
| 2 — Guards | Grid patrols, StealthGuard tag, directional three-deep / three-wide sight |
| 3 — Corpses | Collision execution, 2.5-second lock, corpse generation/discovery, two-second stationary disposal |
| 4 — Spells | Exactly four equipped skills, global cast reserve, facing-relative patterns, knight strike, wall, advanced area kills with AutoDispose |
| 5 — Chase | Fleeing AI, BFS to the nearest reachable boundary, movement/trap interception, stealth exit |
| 6 — Horde | Boundary-triggered alarm, full visibility, locked stealth spells, edge spawns, pursuit, HP damage, restart, exit victory |
| 7 — Metagame | Narrative transitions, upgrades, kill bonuses, campaign stealth-guard ratio, boss ratio scaling, immortal ≥90% branch and dialogue |

The invincible branch stays unwinnable. Dying in it offers another attempt at the same immortal grandmaster; no alternative victory or immunity-removal mechanic was added.

## Project structure

| File | Purpose |
| --- | --- |
| `src/content.js` | Maps, patrols, narrative, stats, upgrades, spell patterns and unlocks |
| `src/grid.js` | Grid rules, breadth-first pathfinding, visibility rays, pattern rotation |
| `src/game.js` | Renderer-independent fixed-step gameplay simulation and campaign accounting |
| `src/view.js` | Three.js scene, instanced map tiles, actors, fog visibility, target previews and effects |
| `src/main.js` | Menus, input, HUD, transitions, local campaign persistence, frame loop |
| `styles.css` | Layout and interface |
| `tests/` | Gameplay, application-flow and scene-graph tests |
| `scripts/check.mjs` | Syntax, module paths, asset paths and UI binding checks |
| `serve.py`, `start.bat`, `start.sh` | Local launchers |
| `docs/IMPLEMENTATION.md` | Provisional rules and technical notes |
| `docs/PLAYTEST.md` | Manual browser playtest checklist |
| `vendor/` | Three.js r180 and its MIT license |

## Automated verification

Requires Node.js 20 or newer. No dependency installation is necessary.

```sh
npm test
npm run check
```

At handoff: **44 tests pass**. They exercise real gameplay rules, campaign progression, menu/button flow in a DOM model, and real Three.js scene construction without a GPU. They cover fog hiding, execution/disposal timers, spells, fleeing paths, horde contact and exits, kill accounting on retries, upgrades, both boss branches, and scene resource cleanup.

**A real-browser visual playtest was not available in the creation environment.** Automated tests do not validate shader compilation, CSS layout, frame rate, or gameplay feel on a real GPU. Follow `docs/PLAYTEST.md` before treating this as a finished release.

## Prototype limitations

- Procedural low-detail characters and architecture; no authored animations, audio, or production assets yet.
- Three small authored courtyards; no editor or procedural campaign generator.
- Final-boss moves and balance are provisional. The supplied outline defines scaling and immortality but not a full boss combat loop.
- Save data stays in the current browser. Continuing restarts the current level from its entry, preserving completed levels and purchased upgrades.
- No multiplayer, accounts, external services, or backend.

See `docs/IMPLEMENTATION.md` for the choices made where the supplied outline left details unspecified.
