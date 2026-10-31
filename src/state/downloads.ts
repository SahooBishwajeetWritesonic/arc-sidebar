import type { Platform } from '@/platform/types';

let platform: Platform | undefined;

export function connectDownloads(source: Platform) {
  platform = source;
}

export const loadDownloads = async () => (await platform?.downloads()) ?? [];
export const watchDownloads = (listener: () => void) =>
  platform?.onDownloadsChange(listener) ?? (() => {});
export const openDownload = (id: number) => platform?.openDownload(id);
export const showDownload = (id: number) => platform?.showDownload(id);
export const showDownloadsFolder = () => platform?.showDownloadsFolder();
export const cancelDownload = (id: number) => platform?.cancelDownload(id);
export const eraseDownloads = (ids: number[]) => platform?.eraseDownloads(ids);
export const loadDownloadIcon = async (id: number) => platform?.downloadIcon(id);
