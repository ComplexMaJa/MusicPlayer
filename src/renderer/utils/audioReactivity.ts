/**
 * Non-intrusive audio visualizer synthesizer that does NOT hijack HTMLAudioElement
 * Safe for custom protocols (maja-audio://) and bit-perfect streaming
 */

export function getAudioEnergy(isPlaying: boolean, time: number): { energy: number; frequencyBins: number[] } {
  if (!isPlaying) {
    return { energy: 0, frequencyBins: [0.15, 0.2, 0.15, 0.25, 0.18] };
  }

  // Rhythmic smooth sine modulation simulating natural musical cadence
  const t = time * 2.2;
  const b1 = (Math.sin(t * 1.5) * 0.5 + 0.5) * 0.7 + 0.2;
  const b2 = (Math.cos(t * 2.0) * 0.5 + 0.5) * 0.85 + 0.15;
  const b3 = (Math.sin(t * 3.1 + 1.2) * 0.5 + 0.5) * 0.9 + 0.1;
  const b4 = (Math.cos(t * 1.8 + 0.8) * 0.5 + 0.5) * 0.75 + 0.2;
  const b5 = (Math.sin(t * 2.5 + 2.1) * 0.5 + 0.5) * 0.8 + 0.15;

  const energy = (b1 + b2 + b3 + b4 + b5) / 5;

  return {
    energy: energy * 0.6,
    frequencyBins: [b1, b2, b3, b4, b5],
  };
}
