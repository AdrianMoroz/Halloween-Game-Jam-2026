"""Synthesize the prototype's original loops. Optional: requires NumPy + ffmpeg.

No recordings or downloaded samples are used. The game plays the bundled MP3s;
players do not need these generation dependencies.
"""
from pathlib import Path
import math
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets" / "music"
SAMPLE_RATE = 32000


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def instrument(note, seconds, kind, rng):
    t = np.arange(round(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    f = frequency(note)
    if kind == "pluck":
        signal = sum((1 / h ** 1.5) * np.sin(2 * np.pi * f * h * t)
                     * np.exp(-t * (1.8 + h * .65)) for h in range(1, 9))
        envelope = np.minimum(1, t / .006)
    elif kind == "flute":
        vibrato = .0035 * np.sin(2 * np.pi * 4.9 * t)
        phase = 2 * np.pi * f * np.cumsum(1 + vibrato) / SAMPLE_RATE
        signal = np.sin(phase) + .16 * np.sin(2 * phase) + .05 * np.sin(3 * phase)
        breath = rng.normal(0, 1, len(t))
        breath = np.convolve(breath, np.ones(7) / 7, "same")
        signal += breath * .07
        envelope = np.minimum(1, t / .22) * np.minimum(1, np.maximum(0, seconds - t) / .4)
    elif kind == "bow":
        signal = sum(np.sin(2 * np.pi * f * h * t + .012 * np.sin(2 * np.pi * 3.2 * t))
                     / h ** 1.9 for h in range(1, 8))
        signal += .12 * np.sin(2 * np.pi * f * 1.003 * t)
        envelope = np.sin(np.pi * t / seconds) ** .7
    elif kind == "drum":
        phase = 2 * np.pi * (55 * t + 43 * .025 * (1 - np.exp(-t / .025)))
        signal = np.sin(phase) * np.exp(-t * 7)
        signal += .25 * np.sin(2 * phase + .5) * np.exp(-t * 12)
        signal += rng.normal(0, 1, len(t)) * .07 * np.exp(-t * 45)
        envelope = np.minimum(1, t / .003)
    elif kind == "tick":
        signal = rng.normal(0, 1, len(t)) * .24 + np.sin(2 * np.pi * 1800 * t) * .05
        envelope = np.minimum(1, t / .002) * np.exp(-t * 40)
    else:
        signal = np.sin(2 * np.pi * f * t)
        envelope = np.sin(np.pi * t / seconds)
    envelope *= np.minimum(1, np.maximum(0, seconds - t) / .02)
    return signal * envelope


def compose(name, bpm, intensity):
    rng = np.random.default_rng({"stealth": 186, "horde": 704, "boss": 901}[name])
    beat = 60 / bpm
    length = 32 * beat
    samples = round(length * SAMPLE_RATE)
    mix = np.zeros((samples, 2), dtype=np.float64)

    def add(start_beat, note, beats, volume, kind="pluck", pan=0):
        sound = instrument(note, beats * beat, kind, rng) * volume
        indices = (round(start_beat * beat * SAMPLE_RATE) + np.arange(len(sound))) % samples
        stereo = [math.sqrt((1 - pan) / 2), math.sqrt((1 + pan) / 2)]
        for channel in range(2):
            np.add.at(mix[:, channel], indices, sound * stereo[channel])

    roots = [50, 48, 46, 45] if name != "boss" else [38, 41, 39, 45]
    for phrase, root in enumerate(roots):
        base = phrase * 8
        for interval, pan in [(0, -.25), (7, .28), (12, -.05)]:
            add(base, root - 12 + interval, 9, .045 + intensity * .012, "bow", pan)
        if name == "stealth":
            pattern = [(0, 12), (1.5, 19), (3, 15), (4.5, 12), (6, 7), (7.25, 10)]
            for step, interval in pattern:
                add(base + step, root + interval, 2.5, .1, "pluck", math.sin(step) * .4)
            for step, interval in [(1, 24), (4.5, 22)]:
                add(base + step, root + interval, 2.7, .04, "flute", .2)
        else:
            motif = [0, 7, 12, 3, 7, 10, 7, 3] if name == "horde" else [0, 12, 1, 7, 3, 12, 7, 1]
            for step in range(16):
                add(base + step / 2, root + motif[step % 8], .8, .07 + .025 * intensity,
                    "pluck", -.35 if step % 2 else .35)
            for step in range(8):
                add(base + step, 38, .8, .24 if step % 2 == 0 else .14, "drum", -.1)
                add(base + step + .5, 80, .2, .035, "tick", .4)
            if name == "boss":
                for step, interval in [(0, 24), (2.5, 27), (5, 25), (6.5, 24)]:
                    add(base + step, root + interval, 2.2, .065, "flute", -.2)

    # Stereo reflections wrap around the loop, preserving tails at the seam.
    dry = mix.copy()
    for delay, gain in [(.13, .16), (.29, .13), (.47, .1), (.73, .075)]:
        mix += np.roll(dry[:, ::-1], round(delay * SAMPLE_RATE), axis=0) * gain
    mix -= mix.mean(axis=0)
    rms = np.sqrt(np.mean(mix ** 2))
    mix *= (.105 if name == "stealth" else .135) / max(rms, 1e-9)
    mix = np.tanh(mix * 1.05)
    fade = round(.016 * SAMPLE_RATE)
    mix[:fade] *= np.linspace(0, 1, fade)[:, None]
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    pcm = (np.clip(mix, -.95, .95) * 32767).astype("<i2")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="disciple-music-") as temporary:
        wav_path = Path(temporary) / f"{name}.wav"
        with wave.open(str(wav_path), "wb") as file:
            file.setnchannels(2); file.setsampwidth(2); file.setframerate(SAMPLE_RATE)
            file.writeframes(pcm.tobytes())
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
                        "-codec:a", "libmp3lame", "-b:a", "112k", "-map_metadata", "-1",
                        str(OUTPUT / f"{name}.mp3")], check=True)
    print(f"{name}: {length:.2f}s, peak {np.max(np.abs(mix)):.3f}, RMS {np.sqrt(np.mean(mix ** 2)):.3f}")


if __name__ == "__main__":
    compose("stealth", 64, 0)
    compose("horde", 96, 1)
    compose("boss", 84, 1.25)
