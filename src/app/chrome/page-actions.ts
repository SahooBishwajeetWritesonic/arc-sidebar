import { copyText } from '@/app/command/run';
import { showToast } from '@/app/toast/toast';
import { copiedText, linksText } from '@/model/links';
import { hostname } from '@/model/urls';
import type { SitePermissionKind, TabInfo } from '@/platform/types';
import { dispatch } from '@/state/sidebar';
import { captureFullPage, openUrl, setSitePermission, startCapture } from '@/state/tabs';

/** The copy button: the address without tracking parameters, as Copy URL. */
export function copyPageUrl(tab: TabInfo) {
  copyText(linksText([tab]));
  showToast(copiedText(1));
}

const PROTECTED = 'Chrome doesn’t allow capturing this page';

/** Arc's capture tool over the page: pick an element or drag an area; it copies the picture. */
export function capture(tab: TabInfo) {
  void startCapture(tab.id).then((started) => started || showToast(PROTECTED));
}

/** The clipboard write needs the click, so it starts now and waits for the picture. */
export function captureWholePage(tab: TabInfo) {
  const picture = captureFullPage(tab.id).then(
    (blob) => blob ?? Promise.reject(new Error(PROTECTED)),
  );
  navigator.clipboard.write([new ClipboardItem({ 'image/png': picture })]).then(
    () =>
      showToast('Copied full-page screenshot', {
        label: 'Save',
        run: () => void picture.then((blob) => save(blob, tab)),
      }),
    () => showToast(PROTECTED),
  );
}

function save(blob: Blob, tab: TabInfo) {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' at ').replaceAll(':', '.');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${hostname(tab.url) || 'Page'} ${stamp}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

export function setDeveloperMode(url: string, on: boolean) {
  const host = URL.canParse(url) ? new URL(url).hostname : '';
  if (host) dispatch({ type: 'setDeveloperMode', host, on });
}

export function setPermission(url: string, kind: SitePermissionKind, setting: 'allow' | 'block') {
  return setSitePermission(url, kind, setting);
}

export function openSiteSettings(url: string) {
  openUrl(`chrome://settings/content/siteDetails?site=${encodeURIComponent(new URL(url).origin)}`);
}
