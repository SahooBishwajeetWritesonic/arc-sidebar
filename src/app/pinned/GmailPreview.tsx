import { PreviewCard } from '@base-ui/react/preview-card';
import { SquarePen } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { openInPin } from '@/app/actions';
import { useDrag } from '@/app/drag/drag';
import { gmailComposeUrl, type GmailInbox } from '@/platform/gmail';
import { loadGmailInbox } from '@/state/sidebar';
import card from './folder-preview.module.css';
import styles from './gmail-preview.module.css';

/** What each account's feed last said, shown at once while it's asked again. */
const lastSeen = new Map<number, GmailInbox | null>();

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** As Gmail lists mail: today's by time, older by date. */
function arrived(at: number, now = new Date()) {
  return new Date(at).toDateString() === now.toDateString() ? time.format(at) : day.format(at);
}

interface PreviewProps {
  itemId: string;
  /** The pin's Gmail account (/u/N/); none for a pin that isn't Gmail, which gets no preview. */
  account: number | undefined;
  /** What the card hangs under, as wide as it: the pinned tab's row, or the Favorites. */
  anchor: string;
  triggerClassName?: string;
  children: ReactNode;
}

/**
 * Arc's Gmail preview: hovering a pinned Gmail tab or favorite shows its unread mail.
 * Not while something's dragged.
 */
export function GmailPreview({ account, children, ...props }: PreviewProps) {
  if (account === undefined) return children;
  return (
    <GmailCard account={account} {...props}>
      {children}
    </GmailCard>
  );
}

function GmailCard({
  itemId,
  account,
  anchor,
  triggerClassName = card.trigger,
  children,
}: PreviewProps & { account: number }) {
  const dragging = useDrag((state) => state.source !== null);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const close = () => setOpen(false);
  return (
    <PreviewCard.Root
      open={open && !dragging}
      onOpenChange={(next) => setOpen(next && useDrag.getState().source === null)}
    >
      <PreviewCard.Trigger
        ref={(element: HTMLElement | null) => void (trigger.current = element)}
        render={<span data-previewed />}
        className={triggerClassName}
      >
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          className={card.positioner}
          anchor={() => trigger.current?.closest(anchor) ?? null}
          side="bottom"
          align="start"
          sideOffset={2}
        >
          <PreviewCard.Popup className={card.popup}>
            <Inbox itemId={itemId} account={account} onPicked={close} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

function Inbox({
  itemId,
  account,
  onPicked,
}: {
  itemId: string;
  account: number;
  onPicked: () => void;
}) {
  const [inbox, setInbox] = useState(lastSeen.get(account));
  useEffect(() => {
    let current = true;
    void loadGmailInbox(account).then((answer) => {
      lastSeen.set(account, answer);
      if (current) setInbox(answer);
    });
    return () => void (current = false);
  }, [account]);
  const open = (url: string) => {
    openInPin(itemId, url);
    onPicked();
  };

  return (
    <>
      <div className={styles.header}>
        <span className={styles.heading}>{inbox ? `${inbox.unread || 'No'} unread` : 'Inbox'}</span>
        <button
          type="button"
          className={styles.compose}
          onClick={() => open(gmailComposeUrl(account))}
        >
          <SquarePen size={13} aria-hidden />
          Compose
        </button>
      </div>
      {inbox === undefined ? (
        <p className={card.empty}>Checking Gmail…</p>
      ) : inbox === null ? (
        <p className={card.empty}>Gmail didn’t answer. Open it to sign in.</p>
      ) : inbox.messages.length ? (
        <ul className={card.list} aria-label="Unread mail">
          {inbox.messages.map((message) => (
            <li key={message.url}>
              <button type="button" className={styles.message} onClick={() => open(message.url)}>
                <span className={styles.line}>
                  <span className={styles.from} dir="auto">
                    {message.from}
                  </span>
                  <span className={styles.time}>{message.at ? arrived(message.at) : ''}</span>
                </span>
                <span className={styles.subject} dir="auto">
                  {message.subject || '(no subject)'}
                </span>
                {message.snippet && (
                  <span className={styles.snippet} dir="auto">
                    {message.snippet}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={card.empty}>You’re all caught up.</p>
      )}
    </>
  );
}
