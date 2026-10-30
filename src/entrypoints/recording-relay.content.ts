import { RECORDING_EVENT, type RecordingMessage } from '@/platform/recording';
import type { Recording } from '@/platform/types';

/**
 * Passes on what recording-watch sees in the page to the background, which
 * the page's own world can't reach. Kept tiny: it runs in every page.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    let using = false;
    const send = ({ mic, camera }: Recording) => {
      using = mic || camera;
      const message: RecordingMessage = { kind: 'recording', mic, camera };
      void browser.runtime.sendMessage(message).catch(() => {});
    };
    addEventListener(RECORDING_EVENT, (event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (typeof detail !== 'string') return;
      try {
        const seen = JSON.parse(detail) as Partial<Recording>;
        send({ mic: seen.mic === true, camera: seen.camera === true });
      } catch {
        // Not ours.
      }
    });
    // Leaving the page stops what it was using.
    addEventListener('pagehide', () => {
      if (using) send({ mic: false, camera: false });
    });
  },
});
