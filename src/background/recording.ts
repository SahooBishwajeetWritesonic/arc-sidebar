import type { Recording } from '@/platform/types';
import { recordingItem } from '@/platform/storage-items';

let writing = Promise.resolve();

/**
 * null when the tab is gone. One write at a time, so quick changes in two tabs
 * don't undo each other.
 */
export function noteRecording(tabId: number, recording: Recording | null) {
  writing = writing
    .then(async () => {
      const all = await recordingItem.getValue();
      const key = String(tabId);
      const using = recording !== null && (recording.mic || recording.camera);
      if (!using && !(key in all)) return;
      const { [key]: _old, ...rest } = all;
      await recordingItem.setValue(using ? { ...rest, [key]: recording } : rest);
    })
    .catch(() => {});
}
