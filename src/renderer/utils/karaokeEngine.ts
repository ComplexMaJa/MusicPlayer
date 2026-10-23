/**
 * Ultra-precise Karaoke Timing Engine & Enhanced LRC Parser
 * Single source of truth: audio.currentTime
 */
import { LyricLine } from '../../shared/types';

export interface KaraokeWord {
  text: string;
  isSpace: boolean;
  startSec: number;
  endSec: number;
}

export interface ProcessedKaraokeLine {
  id: number;
  time: number;
  endTime: number;
  text: string;
  words: KaraokeWord[];
  hasWordTimestamps: boolean;
}

/**
 * Parses timestamp string like '01:23.45' or '83.45' to seconds
 */
function parseTimestampToSec(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(':');
  if (parts.length === 2) {
    const min = parseFloat(parts[0]) || 0;
    const sec = parseFloat(parts[1]) || 0;
    return min * 60 + sec;
  }
  return parseFloat(ts) || 0;
}

/**
 * Preprocesses synced lyrics lines into ultra-accurate word timing structures
 * Handles both word-level enhanced LRC tags (<00:12.34> or (00:12.34)) and smart vocal syllable estimation
 */
export function processLyricsForKaraoke(lines: LyricLine[]): ProcessedKaraokeLine[] {
  if (!lines || lines.length === 0) return [];

  return lines.map((line, idx) => {
    const nextLine = lines[idx + 1];
    const startTime = line.time;
    const rawText = line.text || '';

    // Check for enhanced word-level LRC tags: <00:12.34>word or (00:12.34)word
    const enhancedTagRegex = /<(\d{1,2}:\d{2}(?:\.\d{1,3})?)>|\((\d{1,2}:\d{2}(?:\.\d{1,3})?)\)/g;
    const hasWordTags = enhancedTagRegex.test(rawText);

    if (hasWordTags) {
      // Parse enhanced word-level timestamps
      const words: KaraokeWord[] = [];
      const tagWithTextRegex = /(?:<(\d{1,2}:\d{2}(?:\.\d{1,3})?)>|\((\d{1,2}:\d{2}(?:\.\d{1,3})?)\))([^<()]+)/g;
      let match: RegExpExecArray | null;
      let cleanFullText = '';
      let lastEnd = startTime;

      while ((match = tagWithTextRegex.exec(rawText)) !== null) {
        const timeStr = match[1] || match[2];
        const wordText = match[3];
        const wordStart = parseTimestampToSec(timeStr);
        const isSpace = /^\s+$/.test(wordText);

        cleanFullText += wordText;

        // If there was a previous word, set its end time
        if (words.length > 0) {
          words[words.length - 1].endSec = Math.max(words[words.length - 1].startSec + 0.1, wordStart);
        }

        words.push({
          text: wordText,
          isSpace,
          startSec: wordStart,
          endSec: wordStart + Math.max(0.2, wordText.length * 0.08),
        });

        lastEnd = wordStart + Math.max(0.2, wordText.length * 0.08);
      }

      if (words.length > 0) {
        const lineEndTime = nextLine ? Math.min(nextLine.time, lastEnd + 0.5) : lastEnd + 1.0;
        words[words.length - 1].endSec = lineEndTime;

        return {
          id: idx,
          time: startTime,
          endTime: lineEndTime,
          text: cleanFullText || rawText.replace(enhancedTagRegex, ''),
          words,
          hasWordTimestamps: true,
        };
      }
    }

    // Clean any remaining stray tags
    const cleanText = rawText.replace(/<[^>]+>|\([^)]+\)/g, '').trim();
    const charCount = cleanText.length || 1;

    // Calculate natural singing duration
    let lineDuration: number;
    let endTime: number;

    if (nextLine) {
      const gap = Math.max(0.2, nextLine.time - startTime);
      if (gap > 5.5) {
        // Interlude / long rest: vocals finish naturally before the next line
        lineDuration = Math.min(gap - 0.6, Math.max(1.4, charCount * 0.20 + 0.6));
        endTime = startTime + lineDuration;
      } else {
        // Normal continuous phrase: leave ~8% breath room before next line
        lineDuration = gap * 0.92;
        endTime = startTime + lineDuration;
      }
    } else {
      lineDuration = Math.max(2.5, charCount * 0.22 + 0.8);
      endTime = startTime + lineDuration;
    }

    // Split into words and spaces
    const tokens = cleanText.split(/(\s+)/);
    const words: KaraokeWord[] = [];

    // Calculate proportional weights for each word token
    let totalWeight = 0;
    const tokenWeights: number[] = [];

    for (const token of tokens) {
      if (!token) continue;
      const isSpace = /^\s+$/.test(token);
      if (isSpace) {
        const spaceWeight = 0.15;
        tokenWeights.push(spaceWeight);
        totalWeight += spaceWeight;
      } else {
        const cleanLen = token.replace(/[^\w]/g, '').length || 1;
        let weight = Math.max(1, cleanLen);

        // Subtle punctuation pause bonus
        if (/[,;\-]/.test(token)) {
          weight += 0.8;
        } else if (/[.!?\)]/.test(token)) {
          weight += 1.4;
        }

        tokenWeights.push(weight);
        totalWeight += weight;
      }
    }

    if (totalWeight <= 0) totalWeight = 1;

    let accumulatedTime = startTime;
    let tokenIdx = 0;

    for (const token of tokens) {
      if (!token) continue;
      const weight = tokenWeights[tokenIdx] || 1;
      const tokenDuration = (weight / totalWeight) * lineDuration;
      const wordStart = accumulatedTime;
      const wordEnd = accumulatedTime + tokenDuration;
      const isSpace = /^\s+$/.test(token);

      words.push({
        text: token,
        isSpace,
        startSec: wordStart,
        endSec: wordEnd,
      });

      accumulatedTime = wordEnd;
      tokenIdx++;
    }

    return {
      id: idx,
      time: startTime,
      endTime,
      text: cleanText,
      words,
      hasWordTimestamps: false,
    };
  });
}

/**
 * Fast binary search to find the active lyric index in O(log N) time
 * Checks within a 60ms anticipatory window for instant visual snap
 */
export function findActiveLineIndex(lines: ProcessedKaraokeLine[], currentTime: number): number {
  if (!lines || lines.length === 0) return -1;

  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= currentTime + 0.06) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
}

/**
 * Calculates exact progressive word highlight progress (0.0 to 1.0)
 * Derived strictly from audio.currentTime
 */
export function getWordProgress(word: KaraokeWord, currentTime: number): number {
  if (currentTime <= word.startSec) return 0;
  if (currentTime >= word.endSec) return 1;
  const duration = word.endSec - word.startSec;
  if (duration <= 0.001) return 1;
  return Math.max(0, Math.min(1, (currentTime - word.startSec) / duration));
}

export interface InstrumentalSegment {
  start: number;
  end: number;
}

const MIN_INSTRUMENTAL_GAP = 2.5;
const MIN_INTRO_INSTRUMENTAL = 3.5;

/**
 * Detects placeholder lyric lines such as "♪", "Instrumental", or
 * "Instrumental Break" that should be replaced by the interlude animation.
 */
export function isInstrumentalLine(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[♪♫♬♩.·•…]/g, '')
    .replace(/[()[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return true;

  return /^(instrumental|instrumental break|instrumental interlude|interlude|musical break|music break|breakdown|solo)$/.test(
    normalized
  );
}

/**
 * Returns the active instrumental segment for the current playback position.
 * Explicit marker lines are always treated as interludes. Long gaps between
 * the estimated end of a sung line and the next timestamp also qualify.
 */
export function getInstrumentalSegment(
  lines: ProcessedKaraokeLine[],
  currentTime: number,
  duration = 0
): InstrumentalSegment | null {
  if (!lines.length) return null;

  const safeDuration =
    Number.isFinite(duration) && duration > 0 ? duration : 0;
  const firstLine = lines[0];

  if (currentTime < firstLine.time && firstLine.time >= MIN_INTRO_INSTRUMENTAL) {
    return { start: 0, end: firstLine.time };
  }

  const activeIndex = findActiveLineIndex(lines, currentTime);
  if (activeIndex < 0) return null;

  const activeLine = lines[activeIndex];
  const nextLine = lines[activeIndex + 1];
  const lineWindowEnd = nextLine
    ? nextLine.time
    : safeDuration > activeLine.endTime
      ? safeDuration
      : activeLine.endTime;

  if (isInstrumentalLine(activeLine.text)) {
    return {
      start: activeLine.time,
      end: Math.max(activeLine.time + 0.5, lineWindowEnd),
    };
  }

  const breakStart = activeLine.endTime;
  const breakEnd = nextLine
    ? nextLine.time
    : safeDuration > breakStart
      ? safeDuration
      : breakStart;

  if (
    currentTime >= breakStart &&
    currentTime < breakEnd &&
    breakEnd - breakStart >= MIN_INSTRUMENTAL_GAP
  ) {
    return { start: breakStart, end: breakEnd };
  }

  return null;
}
