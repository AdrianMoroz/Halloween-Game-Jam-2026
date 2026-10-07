# Audio in v0.2

The game includes three original synthesized music loops. They were composed and rendered by the bundled `scripts/generate_music.py` script from oscillators, generated noise, envelopes, and stereo reflections. No third-party songs, recordings, or samples were used. The tracks are prototype assets, not recordings of traditional instruments.

| Asset | Use | Approximate loop length |
| --- | --- | --- |
| `assets/music/stealth.mp3` | Menus and stealth courtyards | 30 seconds |
| `assets/music/horde.mp3` | Horde Mode | 20 seconds |
| `assets/music/boss.mp3` | Revelation and summit | 23 seconds |

Music playback uses Web Audio. Tracks load only after a user interaction and are decoded once per session. Mode changes crossfade over 1.2 seconds. Voice playback lowers music automatically. Bundled tracks add about 1 MB to the project.

## Narration without recordings

`src/audio.js` uses the browser's speech synthesis API. It selects an available English voice, or accepts the player's choice in Sound. The narrator, disciple, and grandmaster roles use different pacing and pitch; they share the selected voice. This is temporary narration rather than separate voice actors.

The game speaks the prologue, courtyard transitions, revelation, ending, death scenes, and environmental whispers. Story text remains visible. Replay restarts the current cue; Skip cancels its remaining passages. Moving to another screen cancels the old cue. Pausing repeats only the interrupted short passage when play resumes.

Voices are supplied by the operating system or browser. Some may use online speech services; the game does not call a narration API or require credentials. Available voices and quality vary by device. If a voice fails, use Test voice, select another voice, or disable narration and read the text.

## Editing the audio

To replace music, use the same three filenames, or update `MUSIC_TRACKS` in `src/audio.js`. Keep assets inside the project and preserve relative paths for GitHub Pages. Prefer tracks prepared for looping; check the loop seam in the target browser.

To regenerate the included score, install Python 3, NumPy, and ffmpeg with MP3 encoding support, then run:

```sh
python3 scripts/generate_music.py
```

These dependencies are only for changing the score. Players need none of them; the generated MP3s are already included.

Narration text lives in `src/content.js` and the scene cues in `src/main.js`. Recorded voice files could replace speech synthesis later through the audio controller. This version includes no recorded narration and no audio-generation service integration.
