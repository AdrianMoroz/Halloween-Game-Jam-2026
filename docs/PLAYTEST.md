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
- With a real narration MP3 configured, confirm it replaces the intended cue, displays matching text, lowers music, and respects voice volume, mute, Skip, and Replay. Confirm that pausing resumes at the paused audio position and leaving a scene cancels the clip.
- Configure individual passage clips with a missing entry. Confirm the unrecorded passage uses browser speech in the correct order. Temporarily rename a recording and confirm a missing-file fallback preserves the written story and controls.

## First courtyard

- Start a new ascent, read the prologue, and launch with four skills equipped.
- Move with WASD and arrows. Hold Shift + direction and confirm facing changes without movement.
- Confirm unseen tiles are black, walls occlude sight, and guards outside vision are hidden.
- Approach a guard from the rear. Confirm movement and casts lock for 2.5 seconds and a corpse appears afterward.
- Watch the grab, sword wind-up, strike, and fall from all four approach directions. Player and victim should be separate, and the lying corpse should keep the victim's final orientation. Pause during the strike and confirm the pose holds until resuming.
- Stand still for two seconds to burn the corpse. Move away halfway through and confirm the timer resets.
- Confirm the disposal pose kneels, spectral flames rise, and the corpse shrinks near completion. Cancel disposal and confirm the intact body remains. Spell kills should fall or dissolve without delaying their gameplay effect; fog must hide these animations normally.
- Let another guard see a corpse. Confirm they flee and can be intercepted.

## Spells and horde

- Hover every equipped skill and compare its tile preview with its actual cast.
- Test every facing. Knight's Strike must land two forward / one right, and Wall must cover three tiles immediately ahead.
- Confirm each cast spends one global reserve point, and exhausted casts cannot fire.
- Let a witness reach an open boundary. Confirm full visibility, locked spell buttons, and reinforcements entering through boundaries.
- Confirm damage and game over at zero HP, and that a surviving player can still reach the exit.
- At zero HP, confirm the retry menu and death narration appear immediately. The ordinary fall may finish behind the menu; the camera should remain in its tactical view. Retry must reset this attempt's kills and restore the entry position and selected loadout.
- Stand still directly in a guard's sight, including when you block its shortest escape route. Confirm it begins fleeing immediately and detours around you without a movement key.
- Watch several patrol cycles: pauses, scanning turns and occasional reversals should vary. Sight must follow the new facing immediately, without seeing through walls.
- Confirm reinforcements include red swordsmen, green runners with short daggers, blue lancers with long spears and broad ochre brutes with axes. The types should be identifiable in the close and wide views.
- Dodge each type's red warning. The attack must hit its original tiles after the warning, rather than following your new position. Runners should lunge forward; lancers should hold range; brutes should sweep six tiles and deal two damage.
- Equip Flame and Eclipse after unlocking them. Confirm their casts hold movement and facing for 0.7 and 1 second respectively, show the purple target area and HUD countdown, and allow a moving target to escape before release.
- Take damage during a channel or let a witness escape. Confirm the channel ends without releasing or refunding the spell. Pause and open Sound halfway through a cast: the pose and timer must hold until resumed.
- Confirm any active spell walls or traps expire normally during the horde.

## Campaign and summit

- Clear levels with both bypasses and kills. Confirm point bonuses, upgrades, and newly unlocked skills.
- Restart a failed attempt and confirm kills / points are not duplicated.
- Refresh the page and use Continue: completed levels and purchased upgrades persist; the current attempt restarts at entry.
- Finish an ordinary branch. Confirm Space attacks, spell damage, red attack warnings, and victory.
- Inspect the sword swing on Space, the boss's warning wind-up and attack, and the final fall behind the victory screen. Dodge its thrust, cleave and surrounding sweep. Get killed from one and three tiles away: the normal or nightmare retry screen should open immediately. Terminal animation must not cause additional gameplay updates or damage.
- Finish a run with 17 or 18 of the 18 disciples killed. Confirm the unique dialogue, IMMORTAL status, unchanged boss HP under attacks, and the nightmare retry flow.

## Presentation and performance

- Confirm the close overhead camera follows interpolated movement without rotating when facing changes. Restart and change levels: the camera should begin at the new entry immediately.
- Press C and use the HUD camera button. Confirm wide view fits the full board in landscape and portrait, while fog and visible guards stay unchanged. Switch back and confirm smooth tracking resumes.
- Inspect character outfits, boots, armor, sword silhouettes, and walking limbs at the closer scale. Confirm frozen guards hold still, corpses lie on the paving, and different enemy types remain easy to identify.
- Inspect masonry courses, moss, cap bevels, and stone footings. All wall details must disappear together outside vision; temporary walls should retain clear spell silhouettes.
- Resize the window. Check that the board, HUD, loadout cards, and upgrade buttons remain usable.
- Confirm scene visibility updates when fog changes and no tiles / cones unexpectedly disappear.
- Try a horde lasting at least one minute on the intended hardware. Record frame rate and input feel.
- Test pause / resume, switching browser tabs, R restart, and return to title.
- Test mobile touch movement and casting separately. Desktop is the primary interface in this prototype.
