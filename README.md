# Team Lead - Benas Denisovas

# Idea by Benis Denisovas https://github.com/BenasDe

# The Last Disciple — playable prototype v0.2

A static Three.js browser game implementing the supplied Radiant Yang Sect / Yin Ghost General concept. **The Last Disciple is a working title.** This package is a starting implementation, with procedural 3D art and provisional balancing.

There are three playable courtyards, followed by a summit encounter. Sneak past guards or execute them, intercept fleeing witnesses, and survive a horde if a witness escapes. Choose four skills before each level and upgrade HP, movement speed, vision, or casts between levels. Campaign stealth kills determine the grandmaster's strength and the ≥90% immortal branch.

This version adds three original music loops and browser-generated narration for story scenes and guard whispers. No narration recordings, API keys, or plugin connections are required.

The presentation update adds a closer, player-following overhead perspective inspired by classic tactical stealth games. Characters have articulated limbs, layered outfits, armor, and swords; courtyard walls have textured masonry, moss, stone footings, and bevelled tile caps. Press **C** or the camera button beside Pause to switch between the close camera and a wide planning view.

[Offline scene preview](docs/images/close-camera-offline.png): this illustrates the camera and model geometry using approximate software lighting. It is not a browser screenshot or a substitute for a WebGL playtest.

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

Node.js is **not required to play**. Three.js r180 is vendored inside `vendor/`, and music is bundled in `assets/music/`. The game and music use no external APIs or CDNs. Narration uses the browser's speech engine; some available voices may rely on the browser provider's online service.

## Music and narration

Click **Begin your ascent** to start playback. Browser autoplay rules require this first interaction. Quiet music accompanies stealth, a faster track enters during Horde Mode, and a third track accompanies the summit. Music lowers while narration speaks.

Open **♪ Sound** to adjust music and voice volumes, choose an available English voice, test it, turn narration off, or mute everything. The adjacent **↻** and **▸|** buttons replay or skip the current narration. Gameplay pauses while sound settings are open. Sound preferences persist separately from the campaign.

Narration is a placeholder using browser voices, with different pacing and pitch for the narrator, disciples, and grandmaster. Voice quality and availability depend on the browser and operating system. Written story text remains available when narration is muted or unsupported. Leaving a scene stops its narration; pausing or switching tabs suspends sound, and resuming repeats only the interrupted short passage.

See `docs/AUDIO.md` for the music source, audio implementation, and asset replacement notes.

## Publish on GitHub Pages

1. Put the **contents** of this project folder in your repository's root. Include `index.html`, `styles.css`, `src/`, `assets/`, `vendor/`, and `.nojekyll`. Do not upload only the ZIP.
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
| C / camera button | Toggle close follow camera / wide planning view |
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
| `src/camera.js` | Close overhead tracking, smooth framing, responsive perspective, and wide planning view |
| `src/art.js` | Original procedural surface textures and shared, articulated character models |
| `src/main.js` | Menus, input, HUD, transitions, local campaign persistence, frame loop |
| `src/audio.js` | Music crossfades, narration queues, voice selection, ducking and sound preferences |
| `assets/music/` | Original bundled stealth, horde and boss music loops |
| `styles.css` | Layout and interface |
| `tests/` | Gameplay, application-flow, audio-controller and scene-graph tests |
| `scripts/check.mjs` | Syntax, module paths, asset paths and UI binding checks |
| `scripts/generate_music.py` | Optional reproducible music generator; requires NumPy and ffmpeg |
| `serve.py`, `start.bat`, `start.sh` | Local launchers |
| `docs/IMPLEMENTATION.md` | Provisional rules and technical notes |
| `docs/AUDIO.md` | Audio behavior, asset provenance and editing notes |
| `docs/PLAYTEST.md` | Manual browser playtest checklist |
| `vendor/` | Three.js r180 and its MIT license |

## Automated verification

Requires Node.js 20 or newer. No dependency installation is necessary.

```sh
npm test
npm run check
```

At handoff: **74 tests pass**. They exercise real gameplay rules, campaign progression, menu/button flow in a DOM model, and real Three.js scene construction without a GPU. Camera and asset checks cover smooth tracking, wide framing on landscape and portrait screens, shared horde geometry, articulated limbs, fog hiding, and resource cleanup. Audio tests cover user activation, track transitions, narration queues, interruption, replay, mute, preferences, and unavailable APIs using controlled audio/speech models. They also check that the bundled tracks exist.

**A real-browser graphics or audio playtest was not available in the creation environment.** Automated tests do not validate shader compilation, CSS layout, frame rate, speaker output, voice quality, or gameplay feel. The MP3 files were checked for valid decoding, but not assessed by listening. Follow `docs/PLAYTEST.md` before treating this as a finished release.

## Prototype limitations

- Original procedural characters and architecture, with simple articulated walking poses; no imported character models or motion-captured animation.
- Synthesized prototype music and browser narration; no recorded voice acting. Different devices may sound different.
- Three small authored courtyards; no editor or procedural campaign generator.
- Final-boss moves and balance are provisional. The supplied outline defines scaling and immortality but not a full boss combat loop.
- Save data stays in the current browser. Continuing restarts the current level from its entry, preserving completed levels and purchased upgrades.
- No multiplayer, accounts, or game backend.

See `docs/IMPLEMENTATION.md` for the choices made where the supplied outline left details unspecified.
