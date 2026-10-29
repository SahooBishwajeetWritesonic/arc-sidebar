/**
 * Whether ⌃, ⌘ or ⌥ is held, as far as the key events this window sees
 * tell: the recent tabs switch when the shortcut's keys are let go.
 */
export function trackModifiers(target: Window): () => boolean {
  let held = false;
  const follow = (event: KeyboardEvent) => {
    held = event.ctrlKey || event.metaKey || event.altKey;
  };
  target.addEventListener('keydown', follow, true);
  target.addEventListener('keyup', follow, true);
  // Keys let go in another window never reach this one.
  target.addEventListener('blur', () => {
    held = false;
  });
  return () => held;
}
