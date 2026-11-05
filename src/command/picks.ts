import type { Result } from './types';

/** As Chrome's address bar learns: pick Gmail twice after typing "gm", and "gm" puts it first. */
export interface LearnedPick {
  input: string;
  target: string;
  count: number;
  last: number;
}

const KEEP = 300;
const FRESH = 60 * 86_400_000;
const TRUSTED = 2;

const normal = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Pins, spaces and actions by id; pages by address, as tab ids change. Searches aren't learned. */
export function pickTarget(result: Result): string | null {
  const [kind] = result.key.split(':');
  if (kind === 'pin' || kind === 'space' || kind === 'action') return result.key;
  if (kind === 'tab' || kind === 'history' || kind === 'link' || kind === 'archive') {
    return result.url ? `url:${result.url}` : null;
  }
  return null;
}

export function learnPick(
  picks: readonly LearnedPick[],
  typed: string,
  target: string,
  now: number,
): LearnedPick[] {
  const input = normal(typed);
  if (!input) return [...picks];
  const old = picks.find((pick) => pick.input === input && pick.target === target);
  const next = { input, target, count: (old?.count ?? 0) + 1, last: now };
  return [next, ...picks.filter((pick) => pick !== old)].slice(0, KEEP);
}

/** Picked at least twice lately after typing this, or more of it. */
export function learnedTarget(
  picks: readonly LearnedPick[],
  typed: string,
  now: number,
): string | null {
  const input = normal(typed);
  if (input.length < 2) return null;
  const counts = new Map<string, number>();
  for (const pick of picks) {
    if (now - pick.last > FRESH || !pick.input.startsWith(input)) continue;
    counts.set(pick.target, (counts.get(pick.target) ?? 0) + pick.count);
  }
  let best: string | null = null;
  let most = TRUSTED - 1;
  for (const [target, count] of counts) {
    if (count > most) [best, most] = [target, count];
  }
  return best;
}
