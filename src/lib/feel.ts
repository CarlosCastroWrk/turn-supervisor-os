// The feel layer: tiny tactile confirmations that make the app respond like a
// native tool. A tab tap gives back three things at once — a visual spring
// (CSS), a haptic tick (Android/PWA; iOS Safari ignores vibrate), and a very
// quiet audio tick (everywhere, after first user gesture). Failures are all
// silent: feel is seasoning, never a blocker.

let audioContext: AudioContext | undefined;

const softTick = (): void => {
  try {
    type AudioWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Ctor) return;
    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1750, now);
    // Very quiet and very short — a fingertip tick, not a beep.
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // No audio available (permissions, autoplay policy) — skip silently.
  }
};

export const tapFeel = (): void => {
  try {
    navigator.vibrate?.(8);
  } catch {
    // Vibration blocked — fine.
  }
  softTick();
};
