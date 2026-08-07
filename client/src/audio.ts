// The toggle-preview chirp is synthesized with the Web Audio API (no asset
// needed). The theme music, guard-chase siren, and door-opening creak are
// sampled clips — the theme is "Suspense Tension" by AtlasAudio (Pixabay
// Content License: free to use, no attribution required), the other two are
// the specific myinstants clips the user picked.
import themeUrl from "./assets/sfx/suspense-theme.mp3";
import sireneUrl from "./assets/sfx/sirene.mp3";
import portaUrl from "./assets/sfx/porta-abrindo.mp3";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

let musicEnabled = true;
let sfxEnabled = true;
let musicVolume = 0.7; // 0..1, user-configurable

let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 1200;

let themeEl: HTMLAudioElement | null = null;
let sirenEl: HTMLAudioElement | null = null;
let doorEl: HTMLAudioElement | null = null;
let chaseActive = false;
let doorActive = false;
let lastDoorProgress = 0;

function getThemeEl(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!themeEl) {
    themeEl = new Audio(themeUrl);
    themeEl.loop = true;
    themeEl.volume = musicVolume;
  }
  return themeEl;
}

function getSirenEl(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!sirenEl) {
    sirenEl = new Audio(sireneUrl);
    sirenEl.loop = true;
    sirenEl.volume = 0.5;
  }
  return sirenEl;
}

function getDoorEl(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!doorEl) {
    doorEl = new Audio(portaUrl);
    doorEl.loop = true;
  }
  return doorEl;
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  // Browsers start contexts suspended until a user gesture — every call site
  // here only runs in response to a click (start game, toggle button), so
  // this resume() always has a gesture to ride along with.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMusicEnabled(enabled: boolean) {
  musicEnabled = enabled;
  if (!enabled) stopSuspenseMusic();
}

/** 0..100 as shown in the menu's volume stepper. */
export function setMusicVolume(percent: number) {
  musicVolume = clamp01(percent / 100);
  if (themeEl) themeEl.volume = musicVolume;
}

export function setSfxEnabled(enabled: boolean) {
  sfxEnabled = enabled;
  if (!enabled) {
    sirenEl?.pause();
    doorEl?.pause();
  } else {
    // Re-apply whatever state was already active, now that sfx is back on.
    if (chaseActive) setGuardChaseActive(true);
    if (doorActive) setDoorOpening(true, lastDoorProgress);
  }
}

export function isMusicEnabled() {
  return musicEnabled;
}

export function isSfxEnabled() {
  return sfxEnabled;
}

/** Loops the theme track for the whole run, at the user's chosen volume. */
export function startSuspenseMusic() {
  if (!musicEnabled) return;
  const el = getThemeEl();
  if (!el) return;
  el.volume = musicVolume;
  if (el.paused) void el.play().catch(() => {});
}

export function stopSuspenseMusic() {
  themeEl?.pause();
  if (themeEl) themeEl.currentTime = 0;
}

/** Short descending chirp for when a guard's alert light comes on. */
export function playAlertSound() {
  if (!sfxEnabled) return;
  const audio = getContext();
  if (!audio || !masterGain) return;

  const now = audio.currentTime;
  if (now - lastAlertAt < ALERT_COOLDOWN_MS / 1000) return;
  lastAlertAt = now;

  const osc = audio.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.18);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.26);
}

/** Loops the siren sample for as long as any guard has you in their sights. */
export function setGuardChaseActive(active: boolean) {
  chaseActive = active;
  if (!sfxEnabled) return;
  const el = getSirenEl();
  if (!el) return;
  if (active) {
    if (el.paused) void el.play().catch(() => {});
  } else {
    el.pause();
    el.currentTime = 0;
  }
}

/** Loops the door-creak sample while a door is actively being opened, with
 * volume rising alongside progress so it reads as one continuous heave
 * rather than a sample looping at a flat level. */
export function setDoorOpening(active: boolean, progress01: number) {
  doorActive = active;
  lastDoorProgress = progress01;
  if (!sfxEnabled) return;
  const el = getDoorEl();
  if (!el) return;
  if (active) {
    el.volume = clamp01(0.15 + 0.65 * progress01);
    if (el.paused) void el.play().catch(() => {});
  } else {
    el.pause();
    el.currentTime = 0;
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
