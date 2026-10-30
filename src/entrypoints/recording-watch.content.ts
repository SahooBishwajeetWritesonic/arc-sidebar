import { RECORDING_EVENT, watchRecording } from '@/platform/recording';

/**
 * Runs in the page's world before its scripts, to see mic and camera use for Arc's recording
 * indicator; recording-relay passes it on. Kept tiny: it runs in every page.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    // Only secure pages can ask for the mic or camera.
    if (typeof MediaDevices === 'undefined') return;
    watchRecording(window, (recording) =>
      dispatchEvent(new CustomEvent(RECORDING_EVENT, { detail: JSON.stringify(recording) })),
    );
  },
});
