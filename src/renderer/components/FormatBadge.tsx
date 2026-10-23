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
  const displayCodec = format?.codec || codec || 'AUDIO';
  const resolvedRate = format?.sampleRate || sampleRate;
  const resolvedDepth = format?.bitDepth || bitDepth;

  const displayRate = resolvedRate
    ? `${(resolvedRate / 1000) % 1 === 0 ? resolvedRate / 1000 : (resolvedRate / 1000).toFixed(1)}kHz`
    : null;
  const displayDepth = resolvedDepth ? `${resolvedDepth}bit` : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider border bg-[#101012] border-[#242428] text-[#A3A3A3] transition-all select-none shrink-0 ${className}`}
    >
      <span className="font-semibold">{displayCodec}</span>
      {displayDepth && (
        <>
          <span className="opacity-40">•</span>
          <span>{displayDepth}</span>
        </>
      )}
      {displayRate && (
        <>
          <span className="opacity-40">•</span>
          <span>{displayRate}</span>
        </>
      )}
    </div>
  );
};
