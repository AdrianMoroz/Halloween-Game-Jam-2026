# Team Lead - Benas Denisovas

# Idea by Benis Denisovas https://github.com/BenasDe

# The Last Disciple — playable prototype v0.2

A static Three.js browser game implementing the supplied Radiant Yang Sect / Yin Ghost General concept. **The Last Disciple is a working title.** This package is a starting implementation, with procedural 3D art and provisional balancing.

There are three playable courtyards, followed by a summit encounter. Sneak past guards or execute them, intercept fleeing witnesses, and survive a horde if a witness escapes. Choose four skills before each level and upgrade HP, movement speed, vision, or casts between levels. Campaign stealth kills determine the grandmaster's strength and the ≥90% immortal branch.

This version includes three music loops and narration for story scenes and guard whispers. Browser voices work by default; your own WAV or MP3 recordings can replace individual scenes or passages through `src/narration.js`. No narration recordings, API keys, or plugin connections are required to play.

The presentation update adds a closer, player-following overhead perspective inspired by classic tactical stealth games. Characters have articulated limbs, layered outfits, armor, and swords; courtyard walls have textured masonry, moss, stone footings, and bevelled tile caps. Press **C** or the camera button beside Pause to switch between the close camera and a wide planning view.

Executions now show a paired grab, sword wind-up, dispatch, and victim collapse during the existing 2.5-second commitment. Spell victims fall or dissolve, corpse disposal kneels and burns with spectral flames, and the summit includes sword swings and terminal falls. These poses preserve the existing damage, kill, and disposal timing and respect pauses and fog.

Fatal damage opens the retry screen immediately. The ordinary collapse remains behind the menu, using the tactical camera. There is no death cutscene.

Watchmen vary their pauses, glance aside, sometimes reverse their patrol, and choose different escape routes. Fleeing pathfinding avoids occupied and reserved actor tiles, so a witness runs around a stationary player instead of waiting for the player to move.

The horde now mixes four recognizable enemy types: red swordsmen, fast green runners with dagger lunges, blue lancers with three-tile spear thrusts, and broad ochre brutes with heavy area sweeps. Attacks mark their fixed danger tiles in red before striking; dodge the marked area. The grandmaster also alternates thrusts, cleaves and surrounding sweeps.

**Spectral Flame** holds you still for **0.7 seconds** before release; **Black Eclipse** takes **1 second**. Their purple target tiles and HUD progress show the commitment. Enemies keep moving during the cast. Damage or a horde alarm interrupts it, and its reserve remains spent. Other skills retain their immediate activation.

[Offline scene preview](docs/images/close-camera-offline.png): this illustrates the camera and model geometry using approximate software lighting. It is not a browser screenshot or a substitute for a WebGL playtest.

[Offline dispatch poses](docs/images/dispatch-offline.png) show the paired grab, wind-up, strike, collapse, and spectral disposal with the same lighting caveat.

[Offline enemy lineup](docs/images/enemy-archetypes-offline.png) shows the swordsman, runner, lancer and brute from left to right. This is a geometry preview with approximate lighting.

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

Default narration uses browser voices, with different pacing and pitch for the narrator, disciples, and grandmaster. Voice quality and availability depend on the browser and operating system. Your own MP3s can replace entire cues or individual passages; the recording script and setup are in `docs/AUDIO.md` and `docs/NARRATION-SCRIPT.md`. Written story text remains available when narration is muted or unsupported. Leaving a scene stops its narration. Pausing or switching tabs suspends sound; recordings resume at the paused position, while browser speech repeats only the interrupted short passage.

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
| 2 — Guards | Varied grid patrols, pauses and scanning turns; StealthGuard tag; directional three-deep / three-wide sight |
| 3 — Corpses | Collision execution, 2.5-second lock, corpse generation/discovery, two-second stationary disposal |
| 4 — Spells | Exactly four equipped skills, global cast reserve, facing-relative patterns, knight strike, wall, advanced area kills with AutoDispose and stationary casting commitments |
| 5 — Chase | Fleeing AI, BFS around occupied/reserved tiles to the nearest reachable boundary, movement/trap interception, stealth exit |
| 6 — Horde | Boundary-triggered alarm, full visibility, locked stealth spells, four enemy archetypes, marked attacks, varied pursuit, HP damage, restart, exit victory |
| 7 — Metagame | Narrative transitions, upgrades, kill bonuses, campaign stealth-guard ratio, boss ratio scaling, immortal ≥90% branch and dialogue |

The invincible branch stays unwinnable. Dying in it offers another attempt at the same immortal grandmaster; no alternative victory or immunity-removal mechanic was added.

## Project structure

| File | Purpose |
| --- | --- |
| `src/content.js` | Maps, patrols, narrative, stats, upgrades, spells and enemy attack profiles |
| `src/grid.js` | Grid rules, breadth-first pathfinding, visibility rays, pattern rotation |
| `src/game.js` | Renderer-independent fixed-step gameplay simulation and campaign accounting |
| `src/view.js` | Three.js scene, instanced map tiles, actors, fog visibility, target previews and effects |
| `src/camera.js` | Close overhead tracking and wide planning view |
| `src/art.js` | Procedural surfaces, shared character rigs, distinct reinforcement weapons, channeling, dispatch, sword, fall and disposal poses |
| `src/main.js` | Menus, input, HUD, transitions, local campaign persistence, frame loop |
| `src/audio.js` | Music crossfades, recorded/speech narration queues, ducking and sound preferences |
| `src/narration.js` | WAV/MP3 cue mappings; preserves the supplied opening WAV |
| `assets/music/` | Original bundled stealth, horde and boss music loops |
| `styles.css` | Layout and interface |
| `tests/` | Gameplay, application-flow, audio-controller and scene-graph tests |
| `scripts/check.mjs` | Syntax, module paths, asset paths and UI binding checks |
| `scripts/generate_music.py` | Optional reproducible music generator; requires NumPy and ffmpeg |
| `serve.py`, `start.bat`, `start.sh` | Local launchers |
| `docs/IMPLEMENTATION.md` | Provisional rules and technical notes |
| `docs/AUDIO.md` | Audio behavior, asset provenance and editing notes |
| `docs/NARRATION-SCRIPT.md` | Cue names, speaker roles and matching recording dialogue |
| `docs/PLAYTEST.md` | Manual browser playtest checklist |
| `vendor/` | Three.js r180 and its MIT license |

## Automated verification

Requires Node.js 20 or newer. No dependency installation is necessary.

```sh
npm test
npm run check
```

At handoff: **127 tests pass**. They exercise stationary-player fleeing, actor reservations, varied patrol decisions, all four enemy attacks and dodges, interrupted and delayed casts, boss attack variety, campaign progression, menu/button flow in a DOM model, and real Three.js scene construction without a GPU. Presentation checks cover tracking, wide framing, shared horde geometry, paired execution stages, falling victims, corpse handoff, spectral disposal, pause behavior, fog hiding, and resource cleanup. Audio tests cover activation, crossfades, recorded/speech queues, exact recording resume offsets, late-load cancellation, failed-file fallback, replay, mute, preferences, and unavailable APIs using controlled audio/speech models. They also check that the bundled music tracks exist.

**A real-browser graphics or audio playtest was not available in the creation environment.** Automated tests do not validate shader compilation, CSS layout, frame rate, speaker output, voice quality, or gameplay feel. The MP3 files were checked for valid decoding, but not assessed by listening. Follow `docs/PLAYTEST.md` before treating this as a finished release.

## Prototype limitations

- Procedural characters and architecture, with authored articulated action poses; no imported character models or motion-captured animation.
- Synthesized prototype music, the supplied opening WAV, and browser narration for unmapped passages. Different devices may sound different.
- Three small authored courtyards; no editor or procedural campaign generator.
- Final-boss moves and balance are provisional. The supplied outline defines scaling and immortality but not a full boss combat loop.
- Save data stays in the current browser. Continuing restarts the current level from its entry, preserving completed levels and purchased upgrades.
- No multiplayer, accounts, or game backend.

See `docs/IMPLEMENTATION.md` for the choices made where the supplied outline left details unspecified.
