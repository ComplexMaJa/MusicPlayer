import React from 'react';
import { Volume2, VolumeX, Volume1 } from 'lucide-react';

interface VolumeSliderProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  className?: string;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  className = '',
}) => {
  const currentVal = isMuted ? 0 : volume;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value));
  };

  const Icon = isMuted || currentVal === 0 ? VolumeX : currentVal < 0.5 ? Volume1 : Volume2;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={onToggleMute}
        className="text-[#A3A3A3] hover:text-white p-1.5 rounded-full hover:bg-[#151515] transition-all duration-150 hover:scale-110 active:scale-90 cursor-pointer"
        title={isMuted ? 'Unmute' : 'Mute'}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        <Icon className="w-4 h-4" />
      </button>
      <div className="relative w-20 flex items-center h-4 group cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-[var(--accent-color,#FF2E55)] focus-within:ring-offset-2 focus-within:ring-offset-[#050505]">
        <div className="w-full h-1 group-hover:h-1.5 bg-[#1A1A1A] rounded-full overflow-hidden transition-all duration-150">
          <div
            className="h-full bg-[#EDEDED] transition-all duration-150"
            style={{
              width: `${currentVal * 100}%`,
              backgroundColor: 'var(--accent-color, #FF2E55)',
            }}
          />
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={currentVal}
          aria-label="Volume"
          aria-valuetext={`${Math.round(currentVal * 100)}%`}
          onChange={handleChange}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
    </div>
  );
};
