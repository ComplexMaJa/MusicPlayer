import React from 'react';
import { AudioFormatInfo } from '../../shared/types';

interface FormatBadgeProps {
  format?: AudioFormatInfo | null;
  codec?: string;
  sampleRate?: number;
  bitDepth?: number;
  className?: string;
}

export const FormatBadge: React.FC<FormatBadgeProps> = ({
  format,
  codec,
  sampleRate,
  bitDepth,
  className = '',
}) => {
  const displayCodec = format?.codec || codec || 'FLAC';
  const displayRate = format?.sampleRate ? `${format.sampleRate / 1000}kHz` : sampleRate ? `${sampleRate / 1000}kHz` : '96kHz';
  const displayDepth = format?.bitDepth ? `${format.bitDepth}bit` : bitDepth ? `${bitDepth}bit` : '24bit';
  const isBitPerfect = format?.isBitPerfect ?? (displayCodec === 'FLAC');

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider border transition-all select-none shrink-0 ${
        isBitPerfect
          ? 'bg-[#141416]/80 text-accent font-semibold shadow-sm'
          : 'bg-[#101012] border-[#242428] text-[#A3A3A3]'
      } ${className}`}
      style={
        isBitPerfect
          ? {
              color: 'var(--accent-color, #FF2E55)',
              borderColor: 'var(--accent-glow, rgba(255, 46, 85, 0.35))',
              boxShadow: '0 0 10px var(--accent-glow, rgba(255, 46, 85, 0.15))',
            }
          : undefined
      }
    >
      <span className="font-semibold">{displayCodec}</span>
      <span className="opacity-40">•</span>
      <span>{displayDepth}</span>
      <span className="opacity-40">•</span>
      <span>{displayRate}</span>
    </div>
  );
};
