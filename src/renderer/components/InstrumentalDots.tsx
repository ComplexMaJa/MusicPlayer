import React from 'react';
import { colorWithAlpha } from '../utils/colorExtractor';

interface InstrumentalDotsProps {
  active?: boolean;
  isPlaying?: boolean;
  accentColor: string;
  className?: string;
}

/**
 * Inline three-dot interlude shown inside the lyric column. This is the
 * "instrumental" equivalent of a lyric line, not an overlay.
 */
export const InstrumentalDots: React.FC<InstrumentalDotsProps> = ({
  active = false,
  isPlaying = false,
  accentColor,
  className = '',
}) => {
  const safeGlow = colorWithAlpha(accentColor, 0.85);

  return (
    <span
      aria-hidden="true"
      className={`instrumental-dots inline-flex items-center gap-2.5 ${active ? 'is-active' : ''} ${
        isPlaying ? '' : 'is-paused'
      } ${className}`}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="instrumental-dot h-2.5 w-2.5 rounded-full bg-white"
          style={{
            animationDelay: `${index * 0.18}s`,
            boxShadow: `0 0 12px ${safeGlow}, 0 0 24px ${safeGlow}`,
          }}
        />
      ))}
    </span>
  );
};
