import type { Recording } from './types';

/**
 * The page script's event to the relay, its detail the Recording as JSON:
 * objects don't cross from the page's world to the extension's.
 */
export const RECORDING_EVENT = 'arc-sidebar:recording';

/** The relay's message to the background, for the tab it runs in. */
export interface RecordingMessage extends Recording {
  kind: 'recording';
}

/**
 * Follows the mic and camera tracks a page opens (Chrome tells extensions nothing), since stop()
 * fires no event. Shared screens aren't counted: Chrome shows its own bar for those.
 */
export function watchRecording(
  scope: { MediaDevices: typeof MediaDevices; MediaStreamTrack: typeof MediaStreamTrack },
  report: (recording: Recording) => void,
) {
  const live = new Set<MediaStreamTrack>();
  let last: Recording = { mic: false, camera: false };
  const update = () => {
    const now: Recording = { mic: false, camera: false };
    for (const track of live) {
      if (track.readyState === 'ended') live.delete(track);
      else if (track.kind === 'audio') now.mic = true;
      else if (track.kind === 'video') now.camera = true;
    }
    if (now.mic === last.mic && now.camera === last.camera) return;
    last = now;
    report(now);
  };
  const follow = (track: MediaStreamTrack) => {
    live.add(track);
    track.addEventListener('ended', update);
  };

  const devices = scope.MediaDevices.prototype;
  const getUserMedia = devices.getUserMedia;
  devices.getUserMedia = async function (this: MediaDevices, constraints) {
    const stream = await getUserMedia.call(this, constraints);
    stream.getTracks().forEach(follow);
    update();
    return stream;
  };
  const tracks = scope.MediaStreamTrack.prototype;
  const { stop, clone } = tracks;
  tracks.stop = function (this: MediaStreamTrack) {
    stop.call(this);
    if (live.has(this)) update();
  };
  tracks.clone = function (this: MediaStreamTrack) {
    const copy = clone.call(this);
    if (live.has(this)) follow(copy);
    return copy;
  };
}
