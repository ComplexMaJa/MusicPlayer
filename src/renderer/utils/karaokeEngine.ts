/**
 * Karaoke synchronization and progressive word-level timing engine
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
}

/**
 * Preprocesses synced lyrics lines into detailed syllable/word timing structures
 */
export function processLyricsForKaraoke(lines: LyricLine[]): ProcessedKaraokeLine[] {
  if (!lines || lines.length === 0) return [];

  return lines.map((line, idx) => {
    const nextLine = lines[idx + 1];
    const startTime = line.time;
    const rawText = line.text || '';
    const charCount = rawText.trim().length;

    // Calculate intelligent line end-time
    let endTime: number;
    if (nextLine) {
      const gap = nextLine.time - startTime;
      if (gap > 7.0) {
        // Long pause/interlude: Estimate natural singing time with gentle breath hold
        const estimatedSingingDuration = Math.min(gap - 0.8, Math.max(1.8, charCount * 0.25 + 0.8));
        endTime = startTime + estimatedSingingDuration;
      } else {
        endTime = nextLine.time;
      }
    } else {
      endTime = startTime + Math.max(3.0, charCount * 0.28 + 1.0);
    }

    const lineDuration = Math.max(0.4, endTime - startTime);

    // Split line into words and spacing tokens
    const tokens = rawText.split(/(\s+)/);
    const words: KaraokeWord[] = [];

    // Calculate proportional weights for each token
    let totalWeight = 0;
    const tokenWeights: number[] = [];

    for (const token of tokens) {
      if (!token) continue;
      const isSpace = /^\s+$/.test(token);
      if (isSpace) {
        const weight = 0.2; // Minor pause between words
        tokenWeights.push(weight);
        totalWeight += weight;
      } else {
        const cleanLen = token.replace(/[^\w]/g, '').length || 1;
        let weight = cleanLen * 1.0;

        // Punctuation bonuses for natural vocal phrasing
        if (/[,;\-]/.test(token)) {
          weight += 1.2;
        } else if (/[.!?\)]/.test(token)) {
          weight += 2.0;
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
      text: rawText,
      words,
    };
  });
}

/**
 * Calculates current word progress (0.0 to 1.0) given current playback timestamp
 */
export function getWordProgress(word: KaraokeWord, currentTime: number): number {
  if (currentTime <= word.startSec) return 0;
  if (currentTime >= word.endSec) return 1;
  const duration = word.endSec - word.startSec;
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, (currentTime - word.startSec) / duration));
}
