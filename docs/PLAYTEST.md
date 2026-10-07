# Manual browser playtest

The creation environment allowed simulation, application-flow, audio-controller and Three.js scene-graph checks, but did not provide a supported real-browser graphics or sound test. Complete these checks on the target browsers and hardware.

## Startup and hosting

- Extract the full project. Run `start.bat` on Windows, or `python3 serve.py` on macOS/Linux.
- Confirm the title, courtyard background, and menu buttons appear in Chrome/Edge and Firefox.
- Open the browser's developer console. Confirm there are no module-loading or shader errors.
- Test the published repository URL, including its `/REPOSITORY/` path.
- Confirm all assets come from that project and no CDN is needed.

## Music and narration

- Load a fresh page. Click Begin your ascent and confirm music and prologue narration start after that interaction.
- Open Sound. Try Test voice, each available voice, independent volume sliders, narration off, and Mute all. Confirm gameplay stays still while the settings are open.
- Skip a passage, then replay it. Leave the story before it finishes and confirm the old narration stops.
- Listen to a guard whisper. Confirm its caption appears and music lowers during speech, then returns to the selected volume.
- Let a witness escape and confirm the horde music crossfade. Reach the summit and confirm the boss track.
- Pause midway through narration, resume, and confirm only the interrupted passage repeats. Switch tabs and confirm sound pauses.
- Refresh and confirm sound preferences persist independently of the campaign.
- Check Chrome/Edge, Firefox, and the intended mobile browser. Voice lists may arrive late or differ by device. Confirm the written story and game still work with speech disabled or unavailable.
- Listen through several repetitions of all three tracks for clipping, loop gaps, and a comfortable balance against narration.

## First courtyard

- Start a new ascent, read the prologue, and launch with four skills equipped.
- Move with WASD and arrows. Hold Shift + direction and confirm facing changes without movement.
- Confirm unseen tiles are black, walls occlude sight, and guards outside vision are hidden.
- Approach a guard from the rear. Confirm movement and casts lock for 2.5 seconds and a corpse appears afterward.
- Stand still for two seconds to burn the corpse. Move away halfway through and confirm the timer resets.
- Let another guard see a corpse. Confirm they flee and can be intercepted.

## Spells and horde

- Hover every equipped skill and compare its tile preview with its actual cast.
- Test every facing. Knight's Strike must land two forward / one right, and Wall must cover three tiles immediately ahead.
- Confirm each cast spends one global reserve point, and exhausted casts cannot fire.
- Let a witness reach an open boundary. Confirm full visibility, locked spell buttons, and reinforcements entering through boundaries.
- Confirm damage and game over at zero HP, and that a surviving player can still reach the exit.
- Confirm any active spell walls or traps expire normally during the horde.

## Campaign and summit

- Clear levels with both bypasses and kills. Confirm point bonuses, upgrades, and newly unlocked skills.
- Restart a failed attempt and confirm kills / points are not duplicated.
- Refresh the page and use Continue: completed levels and purchased upgrades persist; the current attempt restarts at entry.
- Finish an ordinary branch. Confirm Space attacks, spell damage, red attack warnings, and victory.
- Finish a run with 17 or 18 of the 18 disciples killed. Confirm the unique dialogue, IMMORTAL status, unchanged boss HP under attacks, and the nightmare retry flow.

## Presentation and performance

- Resize the window. Check that the board, HUD, loadout cards, and upgrade buttons remain usable.
- Confirm scene visibility updates when fog changes and no tiles / cones unexpectedly disappear.
- Try a horde lasting at least one minute on the intended hardware. Record frame rate and input feel.
- Test pause / resume, switching browser tabs, R restart, and return to title.
- Test mobile touch movement and casting separately. Desktop is the primary interface in this prototype.
