/**
 * A short HUD-like note at the bottom of a page ("Copied URL"), in a closed shadow root so the
 * page's styles can't reach it. With an action it stays longer and offers a button.
 */

let current: { host: HTMLElement; timer: number } | undefined;

const isolated = (rules: string[]) => rules.map((rule) => `${rule} !important`).join(';');

export function showPageNote(text: string, action?: { label: string; run: () => void }) {
  if (current) {
    clearTimeout(current.timer);
    current.host.remove();
  }
  const host = document.createElement('div');
  host.setAttribute('popover', 'manual');
  host.dataset.arcSidebar = 'note';
  host.style.cssText = isolated([
    'all: initial',
    'position: fixed',
    'inset: auto 0 24px 0',
    'width: max-content',
    'max-width: calc(100vw - 32px)',
    'margin: 0 auto',
    'padding: 0',
    'border: 0',
    'background: transparent',
    'overflow: visible',
  ]);
  const pill = document.createElement('div');
  pill.setAttribute('role', 'status');
  pill.style.cssText = [
    'display: flex',
    'align-items: center',
    'gap: 12px',
    'font: 500 13px/18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    'color: #fff',
    'background: rgb(30 30 32 / 0.88)',
    '-webkit-backdrop-filter: blur(20px) saturate(1.6)',
    'backdrop-filter: blur(20px) saturate(1.6)',
    `padding: ${action ? '6px 6px 6px 14px' : '8px 14px'}`,
    'border-radius: 10px',
    'box-shadow: 0 0 0 0.5px rgb(255 255 255 / 0.14), 0 8px 24px rgb(0 0 0 / 0.28)',
    'white-space: nowrap',
  ].join(';');
  const label = document.createElement('span');
  label.textContent = text;
  pill.append(label);
  if (action) pill.append(noteButton(action.label, action.run));
  host.attachShadow({ mode: 'closed' }).append(pill);
  (document.body ?? document.documentElement).append(host);
  host.showPopover();

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = still ? { opacity: 0 } : { opacity: 0, transform: 'translateY(6px)' };
  pill.animate([from, { opacity: 1, transform: 'none' }], {
    duration: 150,
    easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
  });
  const timer = window.setTimeout(
    () => {
      void pill
        .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' })
        .finished.then(() => host.remove());
    },
    action ? 5000 : 1600,
  );
  current = { host, timer };
}

/** A button on the note's glass, with the same press as the sidebar's. */
export function noteButton(text: string, run: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.style.cssText = [
    'font: inherit',
    'color: #fff',
    'background: rgb(255 255 255 / 0.14)',
    'border: 0',
    'border-radius: 6px',
    'padding: 3px 10px',
    'cursor: default',
    'transition: scale 70ms linear, background 120ms ease',
  ].join(';');
  button.addEventListener(
    'pointerenter',
    () => (button.style.background = 'rgb(255 255 255 / 0.22)'),
  );
  button.addEventListener(
    'pointerleave',
    () => (button.style.background = 'rgb(255 255 255 / 0.14)'),
  );
  button.addEventListener('pointerdown', () => (button.style.scale = '0.97'));
  button.addEventListener('pointerup', () => (button.style.scale = ''));
  button.addEventListener('pointercancel', () => (button.style.scale = ''));
  button.addEventListener('click', run);
  return button;
}

/** Downloads from inside a shadow root, so the page's link handling can't catch the click. */
export function downloadFromPage(blob: Blob, name: string) {
  const host = document.createElement('div');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  host.attachShadow({ mode: 'closed' }).append(link);
  (document.body ?? document.documentElement).append(host);
  link.click();
  host.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
