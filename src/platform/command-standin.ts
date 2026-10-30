import tokens from '@/app/tokens.css?inline';
import type { CommandLook, Typed } from './command-bar';
import css from './command-standin.css?inline';

/** Lucide's search icon, as the bar draws it (16 px, stroke 2). */
const SEARCH =
  '<svg class="icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>';

export interface StandIn {
  typed(): Typed;
  remove(): void;
}

/**
 * The bar's field, drawn over the page at once to catch keys typed while Chrome starts the
 * extension's frame. `frame` is the page's own empty iframe, outside the page's key events.
 */
export function drawStandIn(
  frame: HTMLIFrameElement,
  { look, address, onClose }: { look: CommandLook; address?: string; onClose: () => void },
): StandIn {
  const doc = frame.contentDocument!;
  const style = doc.createElement('style');
  style.textContent = `${tokens}\n${css}`;
  doc.head.append(style);
  doc.body.innerHTML = `<div class="layer"><div class="card"><div class="field">${SEARCH}<input class="input" placeholder="Search or Enter URL…" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Command bar"></div></div></div>`;
  const layer = doc.querySelector<HTMLElement>('.layer')!;
  const input = doc.querySelector<HTMLInputElement>('.input')!;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  layer.style.colorScheme =
    look.appearance === 'auto' ? (dark ? 'dark' : 'light') : look.appearance;
  layer.style.setProperty('--command-accent', look.accent);

  let submit = false;
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'Enter') submit = true;
    else return;
    event.preventDefault();
  });
  // A press beside the card closes the bar, as it does on the bar itself.
  layer.addEventListener('pointerdown', (event) => event.target === layer && onClose());

  frame.focus();
  input.focus({ preventScroll: true });
  if (address) {
    input.value = address;
    input.select();
  }
  return {
    typed: () => ({
      text: input.value,
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
      submit,
    }),
    remove: () => frame.remove(),
  };
}
