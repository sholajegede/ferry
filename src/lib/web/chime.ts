type Ctor = typeof AudioContext;
let context: AudioContext | null = null;

function ensure() {
  if (context || typeof window === "undefined") return context;
  const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Audio) return null;
  try {
    context = new Audio();
  } catch {
    context = null;
  }
  return context;
}

// Browsers only allow sound after a tap or a key press, so wake the audio on the first one.
export function armChime() {
  const wake = () => {
    const audio = ensure();
    if (audio?.state === "suspended") void audio.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
  return () => {
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
}

export function chime() {
  const audio = ensure();
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime + 0.02;
  [
    [880, 0],
    [1318.5, 0.11],
  ].forEach(([frequency, delay]) => {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start + delay);
    gain.gain.linearRampToValueAtTime(0.14, start + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.5);
    tone.connect(gain).connect(audio.destination);
    tone.start(start + delay);
    tone.stop(start + delay + 0.55);
  });
}
