import { useState, type DragEvent } from 'react';
import { typedUrl } from '@/command/url';
import { openUrl, searchWeb } from '@/state/tabs';

const MOST_LINKS = 10;

const typing = (target: EventTarget) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/**
 * Arc's drop onto the sidebar: links open as new tabs, text searches (or opens, if it's an
 * address). Files and drops into a text field are left alone.
 */
export function useTextDrop() {
  const [dropping, setDropping] = useState(false);
  const accepts = (event: DragEvent) => {
    const { types } = event.dataTransfer;
    if (types.includes('Files') || typing(event.target)) return false;
    return types.includes('text/uri-list') || types.includes('text/plain');
  };
  return {
    dropping,
    onDragOver(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropping(true);
    },
    onDragLeave(event: DragEvent) {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop(event: DragEvent) {
      if (!accepts(event)) return;
      event.preventDefault();
      setDropping(false);
      openDropped(event.dataTransfer);
    },
  };
}

function openDropped(data: DataTransfer) {
  const links = data
    .getData('text/uri-list')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  if (links.length) {
    for (const link of links.slice(0, MOST_LINKS)) openUrl(link);
    return;
  }
  const text = data.getData('text/plain').trim();
  if (!text) return;
  const url = typedUrl(text);
  if (url) openUrl(url);
  else searchWeb(text);
}
