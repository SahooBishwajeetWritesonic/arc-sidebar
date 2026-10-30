import { describe, expect, it } from 'vitest';
import { watchRecording } from './recording';
import type { Recording } from './types';

/** Just enough of a browser's media classes: tracks end when stopped, or unplugged. */
function fakeMedia() {
  class MediaStreamTrack extends EventTarget {
    readyState: 'live' | 'ended' = 'live';
    constructor(readonly kind: 'audio' | 'video') {
      super();
    }
    stop() {
      this.readyState = 'ended';
    }
    clone() {
      return new MediaStreamTrack(this.kind);
    }
    unplug() {
      this.readyState = 'ended';
      this.dispatchEvent(new Event('ended'));
    }
  }
  class MediaDevices {
    async getUserMedia({ audio, video }: { audio?: boolean; video?: boolean }) {
      const tracks = [
        ...(audio ? [new MediaStreamTrack('audio')] : []),
        ...(video ? [new MediaStreamTrack('video')] : []),
      ];
      return { getTracks: () => tracks };
    }
  }
  const reports: Recording[] = [];
  const scope = { MediaDevices, MediaStreamTrack } as unknown as Parameters<
    typeof watchRecording
  >[0];
  watchRecording(scope, (recording) => reports.push(recording));
  return { devices: new MediaDevices(), reports };
}

describe('watchRecording', () => {
  it('reports the mic and camera as a page opens them and stops them', async () => {
    const { devices, reports } = fakeMedia();
    const [mic] = (await devices.getUserMedia({ audio: true })).getTracks();
    const [camera] = (await devices.getUserMedia({ video: true })).getTracks();
    expect(reports).toEqual([
      { mic: true, camera: false },
      { mic: true, camera: true },
    ]);
    mic!.stop();
    expect(reports.at(-1)).toEqual({ mic: false, camera: true });
    camera!.stop();
    expect(reports.at(-1)).toEqual({ mic: false, camera: false });
    expect(reports).toHaveLength(4);
  });

  it('keeps a copy of a track in use after the first stops, until it ends', async () => {
    const { devices, reports } = fakeMedia();
    const [camera] = (await devices.getUserMedia({ video: true })).getTracks();
    const copy = camera!.clone() as unknown as { unplug(): void };
    camera!.stop();
    expect(reports).toEqual([{ mic: false, camera: true }]);
    copy.unplug();
    expect(reports.at(-1)).toEqual({ mic: false, camera: false });
  });
});
