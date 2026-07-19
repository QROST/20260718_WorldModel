# The Fashion Maze soundtrack

`Velvet Threshold` is an original, deterministic 72-second ambient loop made
for The Fashion Maze. It uses synthesized tones and noise only: no recordings,
samples, third-party music, or Reactor credits.

- 80 BPM, 24 bars, D-minor palette
- silk pad, sparse glass piano, soft bass, brushed-air texture
- designed to sit quietly beneath the live Reactor experience

Regenerate the source WAV and browser assets from the repository root:

```sh
node tools/generate-background-music.mjs /tmp/the-fashion-maze-loop.wav
ffmpeg -y -i /tmp/the-fashion-maze-loop.wav -af "loudnorm=I=-21:TP=-1.5:LRA=7" -ar 48000 -c:a libopus -b:a 96k public/audio/the-fashion-maze-loop.ogg
ffmpeg -y -i /tmp/the-fashion-maze-loop.wav -af "loudnorm=I=-21:TP=-1.5:LRA=7" -ar 48000 -c:a aac -b:a 128k -movflags +faststart public/audio/the-fashion-maze-loop.m4a
```
