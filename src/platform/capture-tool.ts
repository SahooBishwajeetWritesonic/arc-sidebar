import { downloadFromPage, noteButton, showPageNote } from './page-note';

/**
 * Arc's capture tool: click an element (↑↓ step out and in), drag an area, or Return for the view.
 * The picture goes to the clipboard, and a note offers to save it too.
 */

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureToolOptions {
  /** A PNG of `area` as the page shows it (the tool is gone by then). */
  shoot(area: Area, viewportWidth: number): Promise<Blob>;
}

/** Smaller than this (an icon, a word), an element gives way to the one around it. */
const MIN_SIZE = 12;
/** A press that moves this far is a drag. */
const DRAG = 4;
const KEY = Symbol.for('arc-sidebar.capture-tool');

const CSS = `
.layer { position: fixed; inset: 0; cursor: crosshair; }
.shade { position: fixed; inset: 0; background: rgb(0 0 0 / 0.38); pointer-events: none; }
.box {
  position: fixed; left: 0; top: 0; border-radius: 3px; pointer-events: none;
  box-shadow: 0 0 0 1.5px #fff, 0 0 0 200vmax rgb(0 0 0 / 0.38);
  transition: translate 120ms cubic-bezier(0.23, 1, 0.32, 1),
    width 120ms cubic-bezier(0.23, 1, 0.32, 1), height 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.box[data-dragging] { transition: none; }
.size {
  position: absolute; left: 0; top: -24px; padding: 2px 6px; border-radius: 5px;
  font: 500 11px/16px -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: #fff; background: rgb(30 30 32 / 0.9); white-space: nowrap;
}
.box[data-top] .size { top: 6px; left: 6px; }
.hint {
  position: fixed; left: 50%; bottom: 24px; translate: -50% 0;
  display: flex; align-items: center; gap: 12px; padding: 6px 6px 6px 14px; border-radius: 10px;
  font: 500 13px/18px -apple-system, BlinkMacSystemFont, system-ui, sans-serif; color: #fff;
  background: rgb(30 30 32 / 0.88); -webkit-backdrop-filter: blur(20px) saturate(1.6);
  backdrop-filter: blur(20px) saturate(1.6); white-space: nowrap; cursor: default;
  box-shadow: 0 0 0 0.5px rgb(255 255 255 / 0.14), 0 8px 24px rgb(0 0 0 / 0.28);
}
[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) { .box { transition: none; } }
`;

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
  const made = document.createElement(tag);
  made.className = className;
  return made;
};

const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

/** Starts the tool (again, if it's already running). Returns a function that stops it. */
export function startCaptureTool({ shoot }: CaptureToolOptions): () => void {
  const scope = window as unknown as Record<symbol, (() => void) | undefined>;
  scope[KEY]?.();

  const host = document.createElement('div');
  host.setAttribute('popover', 'manual');
  host.dataset.arcSidebar = 'capture';
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'inset: 0',
    'width: 100vw',
    'height: 100vh',
  ]
    .concat(['max-width: none', 'max-height: none', 'margin: 0', 'padding: 0', 'border: 0'])
    .concat(['background: transparent', 'overflow: hidden', 'color-scheme: normal'])
    .map((rule) => `${rule} !important`)
    .join(';');
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const layer = element('div', 'layer');
  const shade = element('div', 'shade');
  const box = element('div', 'box');
  const size = element('span', 'size');
  box.append(size);
  box.hidden = true;
  const hint = element('div', 'hint');
  const text = document.createElement('span');
  text.textContent = 'Click an element or drag an area';
  hint.append(
    text,
    noteButton('Cancel', () => stop()),
  );
  hint.addEventListener('pointerdown', (event) => event.stopPropagation());
  layer.append(shade, box);
  root.append(style, layer, hint);

  /** The element outlined, and the ones ↑ stepped out of (for ↓). */
  let chain: Element[] = [];
  let press: { x: number; y: number; dragging: boolean } | null = null;
  let frame = 0;

  const viewport = (): Area => ({
    x: 0,
    y: 0,
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  });

  const clamp = (area: Area): Area => {
    const view = viewport();
    const x = Math.max(0, area.x);
    const y = Math.max(0, area.y);
    return {
      x,
      y,
      width: Math.max(0, Math.min(view.width, area.x + area.width) - x),
      height: Math.max(0, Math.min(view.height, area.y + area.height) - y),
    };
  };

  const show = (area: Area | null, dragging = false) => {
    shade.hidden = area !== null;
    box.hidden = area === null;
    if (!area) return;
    box.toggleAttribute('data-dragging', dragging);
    box.toggleAttribute('data-top', area.y < 28);
    box.style.translate = `${area.x}px ${area.y}px`;
    box.style.width = `${area.width}px`;
    box.style.height = `${area.height}px`;
    size.textContent = `${Math.round(area.width)} × ${Math.round(area.height)}`;
  };

  const meaningful = (start: Element | null): Element | null => {
    for (let at = start; at && at !== document.body && at !== document.documentElement;) {
      const rect = at.getBoundingClientRect();
      const display = getComputedStyle(at).display;
      const block = display !== 'inline' && display !== 'contents';
      if (block && rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) return at;
      at = at.parentElement;
    }
    return null;
  };

  /** The element under the point: the page's, never the tool's own. */
  const under = (x: number, y: number) =>
    meaningful(document.elementsFromPoint(x, y).find((hit) => hit !== host) ?? null);

  const outline = () => {
    const target = chain[0];
    show(target ? clamp(target.getBoundingClientRect()) : null);
  };

  const area = (from: { x: number; y: number }, to: { x: number; y: number }): Area =>
    clamp({
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    });

  function capture(chosen: Area) {
    stop();
    if (chosen.width < 1 || chosen.height < 1) return;
    const picture = nextPaint().then(() => shoot(chosen, window.innerWidth));
    // Started during the click or key press, which the clipboard needs.
    navigator.clipboard.write([new ClipboardItem({ 'image/png': picture })]).then(
      () =>
        showPageNote('Copied screenshot', {
          label: 'Save',
          run: () => void picture.then((blob) => downloadFromPage(blob, fileName())),
        }),
      () => showPageNote('Couldn’t copy the screenshot'),
    );
  }

  const onMove = (event: PointerEvent) => {
    if (press) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG;
      press.dragging ||= moved;
      if (press.dragging) show(area(press, { x: event.clientX, y: event.clientY }), true);
      return;
    }
    cancelAnimationFrame(frame);
    const { clientX: x, clientY: y } = event;
    frame = requestAnimationFrame(() => {
      const target = under(x, y);
      if (target !== chain[0]) chain = target ? [target] : [];
      outline();
    });
  };

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    press = { x: event.clientX, y: event.clientY, dragging: false };
  };

  const onUp = (event: PointerEvent) => {
    if (!press || event.button !== 0) return;
    const { dragging } = press;
    const dragged = area(press, { x: event.clientX, y: event.clientY });
    press = null;
    if (dragging && dragged.width >= DRAG && dragged.height >= DRAG) capture(dragged);
    else if (chain[0]) capture(clamp(chain[0].getBoundingClientRect()));
    else capture(viewport());
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') stop();
    else if (event.key === 'Enter') capture(viewport());
    else if (event.key === 'ArrowUp' && chain[0]) {
      const parent = meaningful(chain[0].parentElement);
      if (parent) chain = [parent, ...chain];
      outline();
    } else if (event.key === 'ArrowDown' && chain.length > 1) {
      chain = chain.slice(1);
      outline();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onContextMenu = (event: Event) => {
    event.preventDefault();
    stop();
  };

  layer.addEventListener('pointermove', onMove);
  layer.addEventListener('pointerdown', onDown);
  layer.addEventListener('pointerup', onUp);
  layer.addEventListener('contextmenu', onContextMenu);
  addEventListener('keydown', onKey, true);
  addEventListener('scroll', outline, true);
  addEventListener('resize', outline);

  function stop() {
    cancelAnimationFrame(frame);
    removeEventListener('keydown', onKey, true);
    removeEventListener('scroll', outline, true);
    removeEventListener('resize', outline);
    host.remove();
    if (scope[KEY] === stop) scope[KEY] = undefined;
  }

  scope[KEY] = stop;
  (document.body ?? document.documentElement).append(host);
  host.showPopover();
  // So Return, Escape and ↑↓ reach it; Chrome may keep focus in the sidebar
  // until the page is clicked, which is why Cancel and a right-click work too.
  layer.tabIndex = -1;
  layer.style.outline = 'none';
  layer.focus({ preventScroll: true });
  return stop;
}

function fileName() {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' at ').replaceAll(':', '.');
  return `${location.hostname || 'Page'} ${stamp}.png`;
}
