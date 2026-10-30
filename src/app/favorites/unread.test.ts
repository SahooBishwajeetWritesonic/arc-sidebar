import { describe, expect, it } from 'vitest';
import { unreadCount } from './unread';

describe('unreadCount', () => {
  it('reads the counts sites put in their titles', () => {
    expect(unreadCount('(3) Home / X')).toBe('3');
    expect(unreadCount('Inbox (12) - me@example.com - Gmail')).toBe('12');
    expect(unreadCount('(1,204) Messenger')).toBe('999+');
    expect(unreadCount('(5) Feed | LinkedIn')).toBe('5');
  });

  it('leaves titles that only look like it alone', () => {
    expect(unreadCount('Inbox - me@example.com - Gmail')).toBeUndefined();
    expect(unreadCount('Oppenheimer (2023) - IMDb')).toBeUndefined();
    expect(unreadCount('Release notes (v2) and more')).toBeUndefined();
    expect(unreadCount('(0) Home / X')).toBeUndefined();
  });
});
