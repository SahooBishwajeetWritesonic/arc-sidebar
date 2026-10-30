import { typedUrl } from '@/command/url';
import { orderAtEnd } from '@/model/tree';
import { dispatch, newId, useSidebar } from '@/state/sidebar';
import { openUrl, searchWeb } from '@/state/tabs';
import { showToast } from './toast/toast';

async function pasted(): Promise<string> {
  return (await navigator.clipboard.readText().catch(() => '')).trim();
}

/** ⌘⌥V: opens the address on the clipboard in a new tab, or searches for its text. */
export async function pasteAsNewTab() {
  const text = await pasted();
  if (!text) return showToast('Nothing to paste.');
  const url = typedUrl(text);
  if (url) openUrl(url);
  else searchWeb(text);
}

/** A folder's Paste URL as New Tab: pins the address on the clipboard at the folder's end. */
export async function pasteIntoFolder(folderId: string) {
  const url = typedUrl(await pasted());
  const { model } = useSidebar.getState();
  const folder = model.items[folderId];
  if (!folder) return;
  if (!url) return showToast('The clipboard doesn’t hold a link.');
  dispatch({
    type: 'addPin',
    itemId: newId(),
    spaceId: folder.spaceId,
    parentId: folderId,
    order: orderAtEnd(model, folder.spaceId, folderId),
    url,
  });
  if (folder.kind === 'folder' && folder.collapsed) {
    dispatch({ type: 'setFolderCollapsed', itemId: folderId, collapsed: false });
  }
}
