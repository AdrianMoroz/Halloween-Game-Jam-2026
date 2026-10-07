# Implementation notes

The supplied seven stages remain the design baseline. The earlier design suggestions were not substituted for them: escaping guards use map boundaries, Horde Mode locks spells, starting HP is 1, and a ≥90% kill ratio creates an unkillable boss.

The following values and combat details fill gaps in the outline and are provisional rather than changes to its premise.

## Timing and grid authority

- Real-time simulation at a fixed 60 Hz; rendering interpolates between grid positions.
- Four cardinal directions only. Actors reserve destinations to stop player/guard swaps.
- Player starts at 4 tiles/second; patrol guards start at 1.25–1.5 tiles/second.
- Fleeing speed is patrol speed × 1.55.
- Execution lasts 2.5 seconds, within the specified 2–3 seconds.
- Disposal lasts exactly 2 stationary seconds. Moving, casting, or taking damage resets the current disposal timer.
- Other entities continue moving during execution. The target guard is captured immediately when the player commits to moving onto its tile; the execution begins on arrival. That guard stops movement and perception. A corpse appears after execution completes. Rendering samples the same execution timer for both participants: grab, wind-up, strike, and collapse, followed by an identical oriented corpse pose.
- Guard vision covers the next three forward rows, with three tiles in each row. Walls block both guard and player sight. Diagonal wall corners cannot be seen through.
- Fog uses current vision only: out-of-sight tiles return to black, and hidden actors and wall meshes are removed from visibility.

## Spells

The global reserve begins at 8 casts per level. A valid cast costs one, even if it hits no enemy. An entirely invalid / out-of-map pattern costs nothing. Casts have a 0.22-second input cooldown.

Offsets in `content.js` are `[forward, right]`, rotated by the current facing.

| Spell | Unlock | Effect |
| --- | --- | --- |
| Shadow Miasma | Start | Conceals the player's current tile for 6 seconds |
| Bone Snare | Start | Lethal trap two tiles ahead, lasting up to 18 seconds; leaves a corpse |
| Yin Frost | Start | Freezes guards in the next three forward tiles for 5 seconds |
| Bone Wall | Start | Three tiles across immediately ahead; lasts 7 seconds |
| Knight's Strike | After courtyard 1 | Instant kill two forward / one right; leaves a corpse |
| Spectral Flame | After courtyard 1 | Six-tile area ahead; instant kills with AutoDispose; also burns existing corpses in its area |
| Black Eclipse | After courtyard 2 | Eight surrounding tiles; instant kills with AutoDispose |

The first level has exactly four unlocked skills. Later loadouts add actual selection choices. Spell walls are opaque and affect pathfinding. They cannot materialize inside an occupied or reserved actor tile. If walls temporarily block all escape routes, a witness remains in Flee and retries pathfinding until a route becomes available. Existing spell effects persist through the horde transition until they expire; new casts are locked.

## Horde

Only walkable boundary tiles spawn reinforcements. Every selected spawn must currently have a reachable path to the player. Spawn interval begins at 0.9 seconds and accelerates to 0.3 seconds. Enemy count is capped at 70 to bound rendering and pathfinding costs. Horde speed increases slowly, capped at 3 tiles/second.

Contact deals one HP of damage. A 0.7-second damage cooldown prevents one contact or a stack of enemies consuming multiple HP on the same simulation tick. Opposing movement swaps also register contact.

The player can still execute original stealth guards in Horde Mode; those guards retain the StealthGuard tag and count toward the campaign ratio. HordeEnemy entities never count toward it. This prototype provides no attack for killing horde enemies; their role is the specified pursuit hazard on the way to the exit.

## Progression and accounting

- Every cleared courtyard awards 2 upgrade points plus `floor(stealth kills / 2)` bonus points.
- One upgrade costs one point: HP +1, speed +0.5 tiles/second, vision radius +1, casts +2.
- Provisional caps: HP 8, speed 7, vision 9, casts 20.
- HP and casts refill when a new level or retry starts.
- The denominator includes every authored stealth guard in each completed courtyard, whether seen, killed, or bypassed. There are 18 across this prototype.
- Kills and rewards commit only on a completed attempt. Restarting / dying resets that level's entities and uncommitted kills. A level's reward cannot commit twice.
- Browser save data records the current level entry and between-level purchases, not live actor positions or partial kills. Saves are versioned and validated before loading.

## Final encounter

The original outline leaves the boss's attack controls and moves unspecified. To make this prototype playable:

- At the summit, **Space** performs a free basic soul strike on the next forward tile. Damage: 3; cooldown: 0.4 seconds.
- Offensive spells deal 6 boss damage when their patterns hit. Boss frost lasts 2 seconds. Trap hits also deal 6 damage.
- The final arena is illuminated by the Bagua formation. It is a separate boss phase, so Horde Mode's spell lock does not apply there. The level-entry cast refill applies normally.
- The grandmaster pursues and telegraphs a three-deep / three-wide frontal attack with red tiles.
- The ordinary attack warning lasts 0.85 seconds; the immortal warning lasts 0.5 seconds.
- The summit exit does not bypass the encounter.

For `r = StealthGuardsKilled / TotalStealthGuards`, the implementation follows ratio multiplication with minimum valid values:

```text
MaxHP  = max(1, ceil(48 × r))
Damage = max(1, ceil(4 × r))
Speed  = max(0.5, 3.2 × r)
DamageImmunity = (r >= 0.9)
```

The floors prevent an all-spared run from producing a boss with zero HP and zero speed. This literal scaling makes a completely spared campaign's ordinary boss very weak; balance should be reviewed with the idea's owner. It is deliberately not replaced with a different scaling design here.

Immortality prevents all player damage and preserves HP. The unique dialogue and nightmare death/retry screen are retained. There is no win condition in that branch.

## Rendering and deployment

The default view is a close perspective camera with a 40-degree vertical field of view looking down at the player from a stable overhead angle. It follows the interpolated position with a small facing-based look-ahead and exponential smoothing; it does not rotate when the player turns. C or the HUD camera button switches to a wide, map-fitting view. Portrait framing maintains a useful horizontal field. Both views use the same fog and simulation.

`src/art.js` builds original masonry, paving, roof-tile, and fabric data textures without network or canvas dependencies. Map walls use instanced bodies, bevelled caps, footings, and trim. Characters have distinct outfits and articulated limbs. Static pieces are merged by material inside each moving segment; geometries and surface textures are shared by actors and retained across level changes, while per-actor color materials are released. Floor texture seams emphasize the actual movement grid. Contact discs anchor characters to the paving without a costly dynamic shadow pass.

Three.js r180 is vendored with its original MIT license. Tiles and map walls use instancing. Basic geometry, materials and generated seal artwork avoid external graphics requests. Dynamic instance culling is disabled for visibility-changing map / overlay batches so stale bounds cannot hide new instances. Transient materials and instance buffers are released on level changes.

### Death cutscene

Fatal damage records the player's interpolated position and an immutable attacker snapshot. Horde contact identifies the enemy that caused the hit, including opposing movement crossings; a lethal hit stops subsequent horde updates in that tick. A boss hit identifies the grandmaster in both mortal and immortal branches. The game remains dead throughout the cinematic, so damage, AI, movement, rewards, and spell timers do not advance.

`src/cutscene.js` supplies a 4.6-second render clock. The attacker follows through, the player recoils and drops to a knee, the body collapses by 2.55 seconds, and the frame fades to black during the last 0.75 seconds. Contact enemies separate visually into available paving to prevent overlapping silhouettes; their simulation positions remain unchanged. Other actors hold their poses and gameplay overlays disappear.

The cinematic camera dollies from the current perspective into a close side angle, then drifts slightly toward the body. It fits both characters' bounds within the viewport and letterbox, checks candidate angles against visible map walls, active spell walls, and the gate's posts, lintel, plaque, and roof, and raises the camera where necessary. It retains fog and wall geometry. Reduced-motion preferences cut immediately to a steady shot. Resizing preserves the cinematic; a retry or new scene clears it.

Space, Escape, or the focused touch-accessible Skip cutscene button settles the final pose and opens the existing retry screen. Sound settings, document visibility, and window focus gate the render clock. The original `death` / `death-immortal` narration cues begin at the retry screen, so existing WAV or MP3 mappings remain valid. No additional media files or animation libraries are required.

## Audio

The v0.2 audio layer preserves the gameplay rules. `AudioManager` lazily creates and resumes an AudioContext from a user interaction, fetches the bundled MP3s using relative URLs, caches decoded buffers, and crossfades looping sources over 1.2 seconds. Narration ducks the music to 24% of its selected volume.

Browser speech synthesis reads the existing story and whispers. Short chunks keep cancellation responsive; scene changes cancel queued speech. A generation token prevents callbacks from a canceled utterance advancing a later scene. Pause cancels the current utterance but retains its position so only the interrupted chunk repeats on resume. Start and completion watchdogs restore normal music volume if the speech engine stalls.

Optional MP3 cue mappings in `src/narration.js` accept a whole-scene recording or one recording per original passage. One-shot Web Audio sources use a separate narration gain and the existing ducking state. Pause saves the source offset before stopping it; resume creates a new source at that offset. Queue identity and generation tokens discard stale loads and end callbacks. Failed or stalled loads fall back to speech without changing story text. Recordings decode lazily, are cached by URL, and are not required by the default build.

Dispatch poses live in `src/art.js`. Cosmetic death metadata is captured before clearing a victim's movement, so a spell fall starts at the interpolated visual position while the guard is already dead in the simulation. For 0.65 seconds the view retains that actor, then hands it off to its corpse or removes an auto-dispatched victim. Corpses remain available to gameplay immediately. Disposal poses sample the two-second timer and reset visually if interrupted. Sword trails and corpse flames reuse cached geometry; per-entity materials are released together. A separate terminal render timer finishes fatal falls without stepping gameplay, and pause/help/sound settings pass zero render delta.

The sound popover freezes simulation while allowing sound adjustments. Background tabs and game pause suspend audio. Voice selection, enable/mute states, and independent music/narration volumes use the separate `last-disciple-sound-v1` localStorage key. If storage or either audio API is unavailable, the game and written story remain usable.

The application is a buildless set of static files with relative paths and `.nojekyll`. It can be served from a repository subpath on GitHub Pages. Local-only implementation was used because the requested publishing destination is GitHub Pages; no other hosting service was created or used.

The original concept did not specify a working title, concrete starting casts, individual spell durations, upgrade costs/caps, map layouts, or full boss combat. Those are editable defaults in this implementation.
