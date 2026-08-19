import React, { useState } from 'react';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentTime,
  duration,
  onSeek,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  const displayTime = isDragging ? dragValue : currentTime;
  const percentage = duration > 0 ? (displayTime / duration) * 100 : 0;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = parseFloat(e.target.value);
    const targetSeconds = (pct / 100) * duration;
    setDragValue(targetSeconds);
    if (!isDragging) {
      onSeek(targetSeconds);
    }
  };

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLInputElement>) => {
    const targetSeconds = (parseFloat(e.currentTarget.value) / 100) * duration;
    onSeek(targetSeconds);
    setIsDragging(false);
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className={`flex items-center gap-3 w-full text-xs font-mono text-[#666666] ${className}`}>
      <span className="w-9 text-right shrink-0 select-none">{formatTime(displayTime)}</span>
      <div className="relative flex-1 flex items-center h-4 group cursor-pointer">
        <div className="w-full h-1 group-hover:h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden transition-all duration-150">
          <div
            className="h-full transition-all duration-150"
            style={{
              width: `${Math.min(100, Math.max(0, percentage))}%`,
              backgroundColor: 'var(--accent-color, #FF2E55)',
              boxShadow: '0 0 10px var(--accent-glow, rgba(255, 46, 85, 0.4))',
            }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="0.01"
          value={percentage || 0}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          onChange={handleChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp as any}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      <span className="w-9 shrink-0 select-none">{formatTime(duration)}</span>
    </div>
  );
};
