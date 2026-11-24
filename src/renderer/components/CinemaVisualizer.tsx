import React, { useEffect, useRef } from 'react';
import { colorWithAlpha, normalizeHexColor } from '../utils/colorExtractor';

interface CinemaVisualizerProps {
  isPlaying: boolean;
  accentColor: string;
  accentGlow: string;
  reducedMotion?: boolean;
  className?: string;
}

interface BarPhysics {
  currentHeight: number;
  targetHeight: number;
  peakHeight: number;
  peakHoldTimer: number;
  frequencyFactor: number;
  phase: number;
}

const BAR_COUNT = 7;

export const CinemaVisualizer: React.FC<CinemaVisualizerProps> = ({
  isPlaying,
  accentColor,
  accentGlow,
  reducedMotion = false,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const reducedMotionRef = useRef(reducedMotion);
  const accentColorRef = useRef(accentColor);
  const accentGlowRef = useRef(accentGlow);
  const rafIdRef = useRef<number | null>(null);
  const renderFrameRef = useRef<((now: number) => void) | null>(null);

  useEffect(() => {
    accentColorRef.current = accentColor;
    accentGlowRef.current = accentGlow;
    if ((!isPlaying || reducedMotion) && renderFrameRef.current) {
      renderFrameRef.current(performance.now());
    }
  }, [accentColor, accentGlow, isPlaying, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = 64;
    const displayHeight = 24;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    const bars: BarPhysics[] = Array.from({ length: BAR_COUNT }, (_, i) => ({
      currentHeight: 3,
      targetHeight: 3,
      peakHeight: 3,
      peakHoldTimer: 0,
      frequencyFactor: 1.2 + i * 0.75 + (i % 2 === 0 ? 0.3 : 0),
      phase: (i * Math.PI) / 3.5,
    }));

    let lastTime = performance.now();

    const render = (now: number) => {
      const deltaSec = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      const t = now * 0.003;

      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const isAudioActive =
        isPlayingRef.current && !document.hidden && !reducedMotionRef.current;
      const currentColor = normalizeHexColor(accentColorRef.current, '#FF2E55');
      const bottomStopColor = colorWithAlpha(currentColor, 0.6);

      const barWidth = 4;
      const barGap = 4;
      const totalWidth = BAR_COUNT * barWidth + (BAR_COUNT - 1) * barGap;
      const startX = (displayWidth - totalWidth) / 2;
      const maxHeight = displayHeight - 4;
      const minHeight = 3;

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = bars[i];

        if (isAudioActive) {
          const wave1 = Math.sin(t * bar.frequencyFactor + bar.phase);
          const wave2 = Math.cos(t * (bar.frequencyFactor * 1.6) + bar.phase * 1.4);
          const wave3 = Math.sin(t * 0.8 + i * 0.9);
          const kick = Math.pow(Math.max(0, Math.sin(t * 2.2)), 3) * 0.45;
          const energy = Math.max(0.05, wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25 + 0.5 + kick);

          const curveMultiplier =
            i === 1 || i === 2 || i === 3 ? 1.0 : i === 0 || i === 4 ? 0.85 : 0.72;
          bar.targetHeight = minHeight + energy * (maxHeight - minHeight) * curveMultiplier;

          if (bar.targetHeight > bar.currentHeight) {
            bar.currentHeight += (bar.targetHeight - bar.currentHeight) * 0.45;
          } else {
            bar.currentHeight -= (bar.currentHeight - bar.targetHeight) * 0.16;
          }
          bar.currentHeight = Math.max(minHeight, Math.min(maxHeight, bar.currentHeight));

          if (bar.currentHeight >= bar.peakHeight) {
            bar.peakHeight = bar.currentHeight;
            bar.peakHoldTimer = 0.22;
          } else if (bar.peakHoldTimer > 0) {
            bar.peakHoldTimer -= deltaSec;
          } else {
            bar.peakHeight -= deltaSec * 35;
            if (bar.peakHeight < bar.currentHeight) {
              bar.peakHeight = bar.currentHeight;
            }
          }
        } else {
          // Resting baseline when paused, hidden, or reduced-motion is enabled
          const restingHeight = minHeight + (i === 2 || i === 4 ? 1.5 : i === 3 ? 2.5 : 0.5);
          bar.targetHeight = restingHeight;
          bar.currentHeight = restingHeight;
          bar.peakHeight = 0;
          bar.peakHoldTimer = 0;
        }

        const x = startX + i * (barWidth + barGap);
        const y = displayHeight - bar.currentHeight;

        ctx.save();
        const gradient = ctx.createLinearGradient(x, y, x, displayHeight);
        gradient.addColorStop(0, currentColor);
        gradient.addColorStop(1, bottomStopColor);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: Function }).roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, bar.currentHeight, [2, 2, 1, 1]);
        } else {
          ctx.rect(x, y, barWidth, bar.currentHeight);
        }
        ctx.fill();

        if (isAudioActive && bar.peakHeight > minHeight + 2) {
          const peakY = Math.max(1, displayHeight - bar.peakHeight - 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          if (typeof (ctx as CanvasRenderingContext2D & { roundRect?: Function }).roundRect === 'function') {
            ctx.roundRect(x, peakY, barWidth, 1.5, [1, 1, 1, 1]);
          } else {
            ctx.rect(x, peakY, barWidth, 1.5);
          }
          ctx.fill();
        }

        ctx.restore();
      }

      if (isPlayingRef.current && !document.hidden && !reducedMotionRef.current) {
        rafIdRef.current = requestAnimationFrame(render);
      } else {
        rafIdRef.current = null;
      }
    };

    renderFrameRef.current = render;

    return () => {
      renderFrameRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const syncLoop = () => {
      isPlayingRef.current = isPlaying;
      reducedMotionRef.current = reducedMotion;
      if (isPlaying && !document.hidden && !reducedMotion) {
        if (rafIdRef.current === null && renderFrameRef.current) {
          rafIdRef.current = requestAnimationFrame(renderFrameRef.current);
        }
      } else {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (renderFrameRef.current) {
          renderFrameRef.current(performance.now());
        }
      }
    };

    syncLoop();
    document.addEventListener('visibilitychange', syncLoop);
    return () => {
      document.removeEventListener('visibilitychange', syncLoop);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isPlaying, reducedMotion]);

  const safeGlow = colorWithAlpha(accentGlow || accentColor, 0.22);

  return (
    <div
      className={`relative flex items-center justify-center p-1 rounded-xl bg-[#0D0D10]/80 border border-[#1E1E24]/80 backdrop-blur-md shadow-lg ${className}`}
      title="Ambient visualizer"
      style={{
        boxShadow: `0 0 16px ${safeGlow}`,
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
