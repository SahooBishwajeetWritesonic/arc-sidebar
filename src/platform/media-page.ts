/**
 * Serialised into the page's own world by scripting.executeScript: no outside references.
 * MEDIA_EVENT reaches the media-session script, which runs the page's Media Session handlers.
 */

export const MEDIA_EVENT = 'arc-sidebar:media';

/** Whether the page is playing, what (Media Session metadata), and which actions it handles. */
export function readMedia() {
  const elements = [...document.querySelectorAll<HTMLMediaElement>('video, audio')];
  const playingElement = elements.some((media) => !media.paused && !media.ended);
  const session = navigator.mediaSession;
  const detail = { query: true, actions: [] as string[] };
  window.dispatchEvent(new CustomEvent('arc-sidebar:media', { detail }));
  const metadata = session?.metadata;
  const artwork = metadata?.artwork?.at(-1)?.src;
  return {
    playing: playingElement || session?.playbackState === 'playing',
    title: metadata?.title || undefined,
    artist: metadata?.artist || undefined,
    artwork: artwork || undefined,
    actions: detail.actions,
  };
}

/**
 * Plays, pauses or skips with the page's own handler when it has one (so its
 * controls stay in step), else on its media elements directly.
 */
export function runMedia(action: string) {
  const detail = { action, handled: false };
  window.dispatchEvent(new CustomEvent('arc-sidebar:media', { detail }));
  if (detail.handled || (action !== 'play' && action !== 'pause')) return detail.handled;
  const elements = [...document.querySelectorAll<HTMLMediaElement>('video, audio')];
  if (action === 'pause') {
    elements.forEach((media) => media.pause());
  } else {
    const media = elements.find((m) => m.currentTime > 0) ?? elements[0];
    void media?.play().catch(() => {});
  }
  return true;
}
