/**
 * Motion and sound are separate from the colour theme: both are opt-in reductions that
 * must survive a reload, and neither may be required to understand a result.
 *
 * They live outside React (localStorage) and are read through useSyncExternalStore, so a
 * prerendered page never bakes a client preference into its HTML.
 */
export type MotionPreference = "system" | "reduce";

const MOTION_KEY = "quiz-atlas-motion";
const SOUND_KEY = "quiz-atlas-sound";

const motionListeners = new Set<() => void>();
const soundListeners = new Set<() => void>();

const emit = (listeners: Set<() => void>) => {
  for (const listener of listeners) listener();
};

export function subscribeMotion(listener: () => void) {
  motionListeners.add(listener);
  return () => motionListeners.delete(listener);
}

export function getMotionSnapshot(): boolean {
  try {
    return window.localStorage.getItem(MOTION_KEY) === "reduce";
  } catch {
    return false;
  }
}

export const getMotionServerSnapshot = () => false;

export function setMotionReduced(reduced: boolean) {
  const root = document.documentElement;
  if (reduced) root.setAttribute("data-motion", "reduce");
  else root.removeAttribute("data-motion");
  try {
    window.localStorage.setItem(MOTION_KEY, reduced ? "reduce" : "system");
  } catch {
    // Blocked storage: the setting still applies for this page.
  }
  emit(motionListeners);
}

export function subscribeSound(listener: () => void) {
  soundListeners.add(listener);
  return () => soundListeners.delete(listener);
}

export function getSoundSnapshot(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

export const getSoundServerSnapshot = () => false;

export function setSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Ignored: sound is a nicety, not a requirement.
  }
  emit(soundListeners);
}
