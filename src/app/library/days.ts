const date = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

export function dayLabel(timestamp: number, now: Date): string {
  const day = new Date(timestamp).toDateString();
  if (day === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === yesterday.toDateString()) return 'Yesterday';
  return date.format(timestamp);
}

export function byDay<T>(items: T[], at: (item: T) => number, now = new Date()) {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(at(item), now);
    const group = groups.at(-1);
    if (group?.label === label) group.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
