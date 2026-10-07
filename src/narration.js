// Optional recorded voices. Keep this empty to use browser narration everywhere.
// A cue accepts one MP3 for the whole scene, or an array with one MP3 per passage.
// Missing array entries fall back to the corresponding written passage's voice.
// See docs/AUDIO.md for every cue, its script, and recording instructions.
// Example entry inside the object:
// opening: new URL('../assets/narration/opening.mp3', import.meta.url).href,
export const NARRATION_CLIPS = {};
