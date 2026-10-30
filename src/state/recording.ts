import { create } from 'zustand';
import type { Platform, Recording } from '@/platform/types';

/** Tabs using the microphone or camera, by id (only those that are). */
const useRecordingStore = create<Record<number, Recording>>()(() => ({}));

export function connectRecording(platform: Platform): () => void {
  return platform.onRecordingChange((recording) => useRecordingStore.setState(recording, true));
}

/** What the tabs use between them, for one indicator: a split's or a pair's two tabs. */
export type RecordingKind = 'mic' | 'camera' | 'both';

export function useRecording(...tabIds: (number | undefined)[]): RecordingKind | null {
  return useRecordingStore((state) => {
    const using = tabIds.map((id) => (id === undefined ? undefined : state[id]));
    const mic = using.some((each) => each?.mic);
    const camera = using.some((each) => each?.camera);
    return mic && camera ? 'both' : camera ? 'camera' : mic ? 'mic' : null;
  });
}
