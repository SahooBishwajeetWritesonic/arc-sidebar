const WORD = /[\p{L}\p{N}]/u;

const startsWord = (text: string, at: number) => at === 0 || !WORD.test(text[at - 1]!);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 4 at the start of the text, 3 at a word start, 1 inside a word. */
function exact(haystack: string, word: string): number {
  const at = haystack.indexOf(word);
  if (at === -1) return 0;
  if (at === 0) return 4;
  if (startsWord(haystack, at)) return 3;
  // A later match at a word start beats this one inside a word.
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}`, 'u').test(haystack) ? 3 : 1;
}

/**
 * The letters in order from a word start, close together: "gthb" in GitHub. Under 1 point, so
 * it never outranks a match as typed.
 */
function fuzzy(haystack: string, word: string): number {
  if (word.length < 3) return 0;
  let best = 0;
  for (let start = haystack.indexOf(word[0]!); start !== -1;) {
    if (startsWord(haystack, start)) {
      let at = start;
      let bonus = 0;
      let i = 1;
      for (; i < word.length; i++) {
        const next = haystack.indexOf(word[i]!, at + 1);
        if (next === -1 || next - start >= word.length * 4) break;
        if (next === at + 1 || startsWord(haystack, next)) bonus++;
        at = next;
      }
      if (i === word.length) {
        const quality = bonus / (word.length - 1) / 2 + word.length / (at - start + 1) / 2;
        best = Math.max(best, 0.25 + 0.5 * quality);
      }
    }
    start = haystack.indexOf(word[0]!, start + 1);
  }
  return best;
}

/** 0 when some word of the query is missing; otherwise the sum of each word's points. */
export function score(text: string, query: string): number {
  const haystack = text.toLowerCase();
  let total = 0;
  for (const word of query.toLowerCase().split(/\s+/)) {
    if (!word) continue;
    const points = exact(haystack, word) || fuzzy(haystack, word);
    if (!points) return 0;
    total += points;
  }
  return total;
}

/** Every word found at the start of a word: good enough to come before "Search". */
export const isStrong = (points: number, query: string) =>
  points >= 3 * query.split(/\s+/).filter(Boolean).length;

interface RankOptions<T> {
  /** Counts for order only, never for being strong. */
  bonus?: (item: T) => number;
  tieBreak?: (a: T, b: T) => number;
}

/** Matching items, best first; ties go to `tieBreak`, else the shorter text. */
export function ranked<T extends { text: string }>(
  items: readonly T[],
  query: string,
  { bonus = () => 0, tieBreak = (a, b) => a.text.length - b.text.length }: RankOptions<T> = {},
) {
  return items
    .map((item) => ({ item, points: score(item.text, query) }))
    .filter(({ points }) => points > 0)
    .map((match) => ({ ...match, order: match.points + bonus(match.item) }))
    .sort((a, b) => b.order - a.order || tieBreak(a.item, b.item));
}
