import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../shared/types';
import { TrackRow } from './TrackRow';

// Keep in sync with TrackRow's fixed h-[50px] root class.
const ROW_HEIGHT = 50;
const ROW_GAP = 4;
const ROW_PITCH = ROW_HEIGHT + ROW_GAP;
const OVERSCAN = 6;
const INITIAL_WINDOW = 24;

interface VirtualTrackListProps {
  tracks: Track[];
  queueContext?: Track[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  renderRowExtra?: (track: Track) => React.ReactNode;
}

/**
 * Fixed-height windowed renderer for large track lists. The parent scroll
 * container is measured directly, so the list can sit anywhere in a page
 * (after headers or other sections) without changing the page layout.
 */
export const VirtualTrackList: React.FC<VirtualTrackListProps> = ({
  tracks,
  queueContext,
  scrollRef,
  renderRowExtra,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState(() => ({
    start: 0,
    end: Math.min(tracks.length, INITIAL_WINDOW),
  }));

  // A passive effect is required here: layout effects run before an ancestor
  // host element's ref is attached, so scrollRef.current would still be null.
  useEffect(() => {
    const scrollElement = scrollRef.current;
    const listElement = listRef.current;
    if (!scrollElement || !listElement) return;

    let frame = 0;

    const updateRange = () => {
      frame = 0;
      const viewportTop = scrollElement.getBoundingClientRect().top;
      const listTop = listElement.getBoundingClientRect().top;
      const scrolledPastTop = Math.max(0, viewportTop - listTop);
      const viewportHeight = scrollElement.clientHeight;
      const total = tracks.length;

      const nextStart = Math.max(
        0,
        Math.floor(scrolledPastTop / ROW_PITCH) - OVERSCAN
      );
      const nextEnd = Math.min(
        total,
        Math.ceil((scrolledPastTop + viewportHeight) / ROW_PITCH) + OVERSCAN
      );

      const boundedStart = Math.min(nextStart, total);
      const boundedEnd = Math.max(boundedStart, nextEnd);

      setRange((previous) =>
        previous.start === boundedStart && previous.end === boundedEnd
          ? previous
          : { start: boundedStart, end: boundedEnd }
      );
    };

    const scheduleUpdate = () => {
      // requestAnimationFrame is paused while the window is hidden or occluded.
      // Fall back to a synchronous measurement so the window stays correct.
      if (document.hidden) {
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        updateRange();
        return;
      }
      if (frame) return;
      frame = requestAnimationFrame(updateRange);
    };

    updateRange();
    scrollElement.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    document.addEventListener('visibilitychange', scheduleUpdate);

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(scrollElement);
    resizeObserver.observe(listElement);

    return () => {
      scrollElement.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('visibilitychange', scheduleUpdate);
      resizeObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollRef, tracks.length]);

  const start = Math.min(range.start, tracks.length);
  const end = Math.min(range.end, tracks.length);
  const visibleTracks = tracks.slice(start, end);

  return (
    <div
      ref={listRef}
      className="flex flex-col"
      style={{
        paddingTop: start * ROW_PITCH,
        paddingBottom: Math.max(0, (tracks.length - end) * ROW_PITCH),
        overflowAnchor: 'none',
      }}
    >
      {visibleTracks.map((track, offset) => (
        <div
          key={track.id}
          className="relative group"
          style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP, flexShrink: 0 }}
        >
          <TrackRow
            track={track}
            index={start + offset}
            queueContext={queueContext}
          />
          {renderRowExtra?.(track)}
        </div>
      ))}
    </div>
  );
};

VirtualTrackList.displayName = 'VirtualTrackList';
