import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  className?: string;
  trackClassName?: string;
  fillColor?: string;
  fillGlow?: string;
}

const formatTime = (secs: number) => {
  if (!secs || !Number.isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentTime,
  duration,
  onSeek,
  className = '',
  trackClassName = 'bg-[#1A1A1A]',
  fillColor = 'var(--accent-color, #FF2E55)',
  fillGlow = '0 0 10px var(--accent-glow, rgba(255, 46, 85, 0.4))',
}) => {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime =
    Number.isFinite(currentTime) && currentTime > 0
      ? Math.min(currentTime, safeDuration || currentTime)
      : 0;

  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const isDraggingRef = useRef(false);
  const didDragChangeRef = useRef(false);
  const dragValueRef = useRef(0);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (didDragChangeRef.current) {
      didDragChangeRef.current = false;
      onSeekRef.current(dragValueRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    window.addEventListener('blur', finishDrag);
    return () => {
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      window.removeEventListener('blur', finishDrag);
    };
  }, [isDragging, finishDrag]);

  const displayTime = isDragging ? dragValue : safeCurrentTime;
  const percentage = safeDuration > 0 ? Math.min(100, Math.max(0, (displayTime / safeDuration) * 100)) : 0;

  const handlePointerDown = () => {
    isDraggingRef.current = true;
    didDragChangeRef.current = false;
    dragValueRef.current = safeCurrentTime;
    setDragValue(safeCurrentTime);
    setIsDragging(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    if (!Number.isFinite(pct) || safeDuration <= 0) return;
    const targetSeconds = (Math.min(100, Math.max(0, pct)) / 100) * safeDuration;
    dragValueRef.current = targetSeconds;
    setDragValue(targetSeconds);
    if (isDraggingRef.current) {
      didDragChangeRef.current = true;
    } else {
      onSeek(targetSeconds);
    }
  };

  return (
    <div className={`flex items-center gap-3 w-full text-xs font-mono text-[#666666] ${className}`}>
      <span className="w-9 text-right shrink-0 select-none">{formatTime(displayTime)}</span>
      <div className="relative flex-1 flex items-center h-4 group cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-[var(--accent-color,#FF2E55)] focus-within:ring-offset-2 focus-within:ring-offset-[#050505]">
        <div className={`w-full h-1 group-hover:h-1.5 ${trackClassName} rounded-full overflow-hidden transition-[height] duration-150`}>
          <div
            className="h-full w-full origin-left will-change-transform"
            style={{
              transform: `scaleX(${percentage / 100})`,
              backgroundColor: fillColor,
              boxShadow: fillGlow,
            }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="0.01"
          value={percentage}
          aria-label="Seek playback position"
          aria-valuetext={`${formatTime(displayTime)} of ${formatTime(safeDuration)}`}
          onPointerDown={handlePointerDown}
          onChange={handleChange}
          onPointerUp={finishDrag}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      <span className="w-9 shrink-0 select-none">{formatTime(safeDuration)}</span>
    </div>
  );
};
