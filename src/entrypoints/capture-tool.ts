import { startCaptureTool } from '@/platform/capture-tool';
import type { CaptureMessage, CaptureReply } from '@/platform/messages';

// Put in the page only when Capture is chosen, so it costs nothing elsewhere.
export default defineUnlistedScript(() => {
  startCaptureTool({
    async shoot(area, viewportWidth) {
      const message: CaptureMessage = { kind: 'capture:shot', area, viewportWidth };
      const reply = (await browser.runtime.sendMessage(message)) as CaptureReply | undefined;
      if (!reply?.png) throw new Error('Chrome didn’t capture the page');
      const bytes = Uint8Array.from(atob(reply.png), (c) => c.charCodeAt(0));
      return new Blob([bytes], { type: 'image/png' });
    },
  });
});
