"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./AmbientSoundtrack.module.css";

const MUSIC_PREFERENCE_KEY = "fashion-maze:music";
const MUSIC_VOLUME = 0.2;
const FADE_IN_MS = 1_600;
const FADE_OUT_MS = 420;

function readMusicPreference() {
  try {
    return window.localStorage.getItem(MUSIC_PREFERENCE_KEY);
  } catch {
    return null;
  }
}

function writeMusicPreference(value: "on" | "off") {
  try {
    window.localStorage.setItem(MUSIC_PREFERENCE_KEY, value);
  } catch {
    // Storage can be unavailable in private or tightly restricted browsers.
  }
}

export function AmbientSoundtrack() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeFrameRef = useRef<number | null>(null);
  const enabledRef = useRef(true);
  const playPendingRef = useRef(false);
  const mountedRef = useRef(false);
  const [enabled, setEnabled] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);

  const fadeTo = useCallback(
    (targetVolume: number, durationMs: number, onComplete?: () => void) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (fadeFrameRef.current !== null) {
        cancelAnimationFrame(fadeFrameRef.current);
      }

      const startVolume = audio.volume;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / durationMs);
        const eased = 1 - (1 - progress) ** 3;
        audio.volume =
          startVolume + (targetVolume - startVolume) * eased;

        if (progress < 1) {
          fadeFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        fadeFrameRef.current = null;
        onComplete?.();
      };

      fadeFrameRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  const beginPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !enabledRef.current || playPendingRef.current) return;

    playPendingRef.current = true;
    if (audio.paused) audio.volume = 0;

    const playAttempt = audio.play();
    void playAttempt
      .then(() => {
        playPendingRef.current = false;
        if (!mountedRef.current || !enabledRef.current) {
          audio.pause();
          return;
        }
        setPlaying(true);
        fadeTo(MUSIC_VOLUME, FADE_IN_MS);
      })
      .catch(() => {
        playPendingRef.current = false;
        if (!mountedRef.current) return;
        enabledRef.current = false;
        setEnabled(false);
        setPlaying(false);
      });
  }, [fadeTo]);

  const handlePlaybackError = useCallback(() => {
    if (fadeFrameRef.current !== null) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
    playPendingRef.current = false;
    enabledRef.current = false;
    audioRef.current?.pause();
    setAvailable(false);
    setEnabled(false);
    setPlaying(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const storedPreference = readMusicPreference();
    if (storedPreference === "off") {
      enabledRef.current = false;
      setEnabled(false);
    }

    return () => {
      mountedRef.current = false;
      if (fadeFrameRef.current !== null) {
        cancelAnimationFrame(fadeFrameRef.current);
      }
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    const startFromPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const startButton = target.closest<HTMLButtonElement>(".enter-button");
      if (!startButton || startButton.disabled) return;
      beginPlayback();
    };

    const startFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const focused = document.activeElement;
      if (!(focused instanceof HTMLButtonElement)) return;
      if (!focused.matches(".enter-button") || focused.disabled) return;
      beginPlayback();
    };

    document.addEventListener("pointerdown", startFromPointer, true);
    document.addEventListener("keydown", startFromKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", startFromPointer, true);
      document.removeEventListener("keydown", startFromKeyboard, true);
    };
  }, [beginPlayback]);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio || !available) return;

    if (enabledRef.current && playing) {
      enabledRef.current = false;
      setEnabled(false);
      writeMusicPreference("off");
      fadeTo(0, FADE_OUT_MS, () => {
        audio.pause();
        if (mountedRef.current) setPlaying(false);
      });
      return;
    }

    enabledRef.current = true;
    setEnabled(true);
    writeMusicPreference("on");
    beginPlayback();
  };

  const label = !available
    ? "Music unavailable"
    : playing
      ? "Music on"
      : enabled
        ? "Music ready"
        : "Music off";

  return (
    <>
      <audio
        ref={audioRef}
        className={styles.audio}
        loop
        preload="auto"
        aria-hidden="true"
        onCanPlay={() => setAvailable(true)}
        onError={handlePlaybackError}
      >
        <source
          src="/audio/the-fashion-maze-loop.ogg"
          type='audio/ogg; codecs="opus"'
        />
        <source src="/audio/the-fashion-maze-loop.m4a" type="audio/mp4" />
      </audio>

      <button
        className={`${styles.toggle} ${playing ? styles.isPlaying : ""}`}
        type="button"
        onClick={toggleMusic}
        disabled={!available}
        aria-pressed={enabled && playing}
        aria-label={
          !available
            ? "Background music unavailable"
            : playing
              ? "Turn background music off"
              : "Play background music"
        }
        title="Original soundtrack · Velvet Threshold"
      >
        <span className={styles.meter} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.label}>{label}</span>
      </button>
    </>
  );
}
