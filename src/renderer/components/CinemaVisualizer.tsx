import React, { useEffect, useRef } from 'react';

interface CinemaVisualizerProps {
  isPlaying: boolean;
  accentColor: string;
  accentGlow: string;
  className?: string;
}

interface BarPhysics {
  currentHeight: number;
  targetHeight: number;
  peakHeight: number;
  peakHoldTimer: number;
  speed: number;
  frequencyFactor: number;
  phase: number;
}

const BAR_COUNT = 7;

export const CinemaVisualizer: React.FC<CinemaVisualizerProps> = ({
  isPlaying,
  accentColor,
  accentGlow,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const accentColorRef = useRef(accentColor);
  const accentGlowRef = useRef(accentGlow);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    accentColorRef.current = accentColor;
    accentGlowRef.current = accentGlow;
  }, [isPlaying, accentColor, accentGlow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // High-DPI Canvas resolution handling
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 64;
    const displayHeight = 24;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    // Initialize physical bars with harmonic spectrum profiles
    const bars: BarPhysics[] = Array.from({ length: BAR_COUNT }, (_, i) => ({
      currentHeight: 3,
      targetHeight: 3,
      peakHeight: 3,
      peakHoldTimer: 0,
      speed: 0.12 + Math.random() * 0.05,
      frequencyFactor: 1.2 + i * 0.75 + (i % 2 === 0 ? 0.3 : 0),
      phase: (i * Math.PI) / 3.5,
    }));

    let rafId: number;
    let lastTime = performance.now();

    const render = (now: number) => {
      const deltaSec = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.003;

      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const isAudioActive = isPlayingRef.current;
      const currentColor = accentColorRef.current || '#FF2E55';

      const barWidth = 4;
      const barGap = 4;
      const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * barGap;
      const startX = (displayWidth - totalWidth) / 2;
      const maxHeight = displayHeight - 4;
      const minHeight = 3;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = bars[i];

        if (isAudioActive) {
          // Multi-frequency harmonic synthesis: rhythmic beat modulation with varied band resonances
          const wave1 = Math.sin(t * bar.frequencyFactor + bar.phase);
          const wave2 = Math.cos(t * (bar.frequencyFactor * 1.6) + bar.phase * 1.4);
          const wave3 = Math.sin(t * 0.8 + (i * 0.9)); // Sub-bass pump

          // Rhythmic kick multiplier (rises periodically)
          const kick = Math.pow(Math.max(0, Math.sin(t * 2.2)), 3) * 0.45;
          const energy = Math.max(0.05, (wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25 + 0.5) + kick);

          // Center and mid-bass bias for natural spectrum curve
          const curveMultiplier = i === 1 || i === 2 || i === 3 ? 1.0 : i === 0 || i === 4 ? 0.85 : 0.72;
          bar.targetHeight = minHeight + energy * (maxHeight - minHeight) * curveMultiplier;
        } else {
          // Resting idle state when paused
          const idleWave = Math.sin(t * 1.5 + bar.phase) * 0.5 + 0.5;
          bar.targetHeight = minHeight + idleWave * 1.5;
        }

        // Fast attack (instant rise), smooth exponential gravity decay (smooth fall)
        if (bar.targetHeight > bar.currentHeight) {
          bar.currentHeight += (bar.targetHeight - bar.currentHeight) * 0.45;
        } else {
          bar.currentHeight -= (bar.currentHeight - bar.targetHeight) * 0.16;
        }

        bar.currentHeight = Math.max(minHeight, Math.min(maxHeight, bar.currentHeight));

        // Peak hold dot physics
        if (bar.currentHeight >= bar.peakHeight) {
          bar.peakHeight = bar.currentHeight;
          bar.peakHoldTimer = 0.22; // hold for 220ms
        } else {
          if (bar.peakHoldTimer > 0) {
            bar.peakHoldTimer -= deltaSec;
          } else {
            // Peak drops slowly under gravity
            bar.peakHeight -= deltaSec * 35;
            if (bar.peakHeight < bar.currentHeight) {
              bar.peakHeight = bar.currentHeight;
            }
          }
        }

        const x = startX + i * (barWidth + barGap);
        const y = displayHeight - bar.currentHeight;

        // Draw frequency bar with rounded capsule shape
        ctx.save();
        const gradient = ctx.createLinearGradient(x, y, x, displayHeight);
        gradient.addColorStop(0, currentColor);
        gradient.addColorStop(1, `${currentColor}99`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(x, y, barWidth, bar.currentHeight, [2, 2, 1, 1]);
        } else {
          ctx.rect(x, y, barWidth, bar.currentHeight);
        }
        ctx.fill();

        // Draw floating luminous peak indicator
        if (isAudioActive && bar.peakHeight > minHeight + 2) {
          const peakY = Math.max(1, displayHeight - bar.peakHeight - 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(x, peakY, barWidth, 1.5, [1, 1, 1, 1]);
          } else {
            ctx.rect(x, peakY, barWidth, 1.5);
          }
          ctx.fill();
        }

        ctx.restore();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className={`relative flex items-center justify-center p-1 rounded-xl bg-[#0D0D10]/80 border border-[#1E1E24]/80 backdrop-blur-md shadow-lg ${className}`}
      title="Audio Spectrum Engine (GPU Accelerated)"
      style={{
        boxShadow: `0 0 16px ${accentGlow}22`,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: 64,
          height: 24,
          display: 'block',
        }}
        className="will-change-transform transform-gpu"
      />
    </div>
  );
};
