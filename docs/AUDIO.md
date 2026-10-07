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

The game speaks the prologue, courtyard transitions, revelation, ending, death scenes, and environmental whispers. Story text remains visible. Replay restarts the current cue; Skip cancels its remaining passages. Moving to another screen cancels the old cue. Pausing repeats only the interrupted short speech passage when play resumes. Optional recorded narration resumes at its paused playback position.

Voices are supplied by the operating system or browser. Some may use online speech services; the game does not call a narration API or require credentials. Available voices and quality vary by device. If a voice fails, use Test voice, select another voice, or disable narration and read the text.

## Editing the audio

To replace music, use the same three filenames, or update `MUSIC_TRACKS` in `src/audio.js`. Keep assets inside the project and preserve relative paths for GitHub Pages. Prefer tracks prepared for looping; check the loop seam in the target browser.

To regenerate the included score, install Python 3, NumPy, and ffmpeg with MP3 encoding support, then run:

```sh
python3 scripts/generate_music.py
```

These dependencies are only for changing the score. Players need none of them; the generated MP3s are already included.

## Your own MP3 narration

Recorded narration is supported through `NARRATION_CLIPS` in `src/narration.js`. Its default empty object keeps browser narration everywhere and makes no requests for nonexistent recordings. No new narration MP3s are included with this update. Existing music files do not need replacement.

1. Record the matching dialogue in [NARRATION-SCRIPT.md](NARRATION-SCRIPT.md). Use one file per full cue, or one file per numbered passage when using different voices. Keep a little breathing room around the words and check that the recording does not clip.
2. Put your MP3s in a new `assets/narration/` folder. Short filenames such as `opening.mp3` and `transition-lower.mp3` are convenient.
3. Add the desired entries to `src/narration.js`, for example:

```js
const clip = name => new URL('../assets/narration/' + name, import.meta.url).href;

export const NARRATION_CLIPS = {
  opening: clip('opening.mp3'),
  'transition-lower': clip('transition-lower.mp3'),
  revelation: [
    clip('revelation-1.mp3'),
    clip('grandmaster-revelation.mp3'),
    null,
    null,
  ],
};
```

A string plays one recording for the entire cue, with the full script as its caption. An array plays one clip per original passage in order, showing the corresponding caption and speaker. `null` or missing entries use browser speech for that passage. Unconfigured cues also use browser speech. A failed, missing, or stalled recording falls back to the written script and available browser voices. Devices without speech synthesis can still play configured recordings; unrecorded passages remain readable.

| Cue key | Scene | Passages |
| --- | --- | --- |
| `opening` | Prologue | 3 |
| `transition-lower` | After courtyard I | 1 |
| `transition-middle` | After courtyard II | 1 |
| `transition-upper` | After courtyard III | 1 |
| `revelation` | Mortal grandmaster branch | 4 |
| `revelation-immortal` | Immortal grandmaster branch | 6 |
| `wrath` | Immortal boss entry dialogue | 1 |
| `death` | Ordinary game over | 1 |
| `death-immortal` | Nightmare game over | 1 |
| `ending` | Victory | 2 |
| `whisper-lower-1`, `whisper-lower-2` | Lower courtyard whispers | 1 each |
| `whisper-middle-1`, `whisper-middle-2` | Middle pavilion whispers | 1 each |
| `whisper-upper-1`, `whisper-upper-2` | Upper sanctum whispers | 1 each |

Recorded clips use the existing narration volume, narration on/off, music ducking, mute, replay, skip, and scene cancellation controls. They do not loop. Pause resumes a recording where it stopped; Replay begins the cue from the start. Voice selection and Test voice affect browser speech only, and do not alter a recorded actor's voice. Playback requires the same first click/tap as music.

Narration text lives in `src/content.js` and the scene cues in `src/main.js`. There is no audio-generation service integration. If you change the dialogue in your recordings, update the written script and captions to match.
