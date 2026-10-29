import { IconSwap } from '@/app/rows/IconSwap';
import type { LivePin } from '@/model/types';
import styles from './live-icons.module.css';

/** GitHub's mark, from GitHub's Octicons (MIT licence). */
const GITHUB_MARK =
  'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

const FOLDER =
  'M20 20.5a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13.5a2 2 0 0 0 2 2Z';
/** The open folder's front, tipped forward over the back. */
const FLAP =
  'M6.4 10.2h15.4a1.2 1.2 0 0 1 1.15 1.55l-2.45 7.65a1.6 1.6 0 0 1-1.52 1.1H3.3a1 1 0 0 1-.95-1.3l2.6-8.05a1.6 1.6 0 0 1 1.45-.95Z';

/** Arc's GitHub Live Folder icon: a blue folder with GitHub's mark, morphing open and closed. */
export function GitHubFolderIcon({ open }: { open: boolean }) {
  return (
    <span className={styles.slot} aria-hidden>
      <IconSwap
        on={open}
        off={
          <svg className={styles.folder} width="16" height="16" viewBox="0 0 24 24">
            <path className={styles.body} d={FOLDER} />
            <path
              className={styles.mark}
              transform="translate(6.8 7.6) scale(0.65)"
              d={GITHUB_MARK}
            />
          </svg>
        }
        to={
          <svg className={styles.folder} width="16" height="16" viewBox="0 0 24 24">
            <path className={styles.back} d={FOLDER} />
            <path className={styles.body} d={FLAP} />
            <path
              className={styles.mark}
              transform="translate(8 10.9) scale(0.56)"
              d={GITHUB_MARK}
            />
          </svg>
        }
      />
    </span>
  );
}

/** A pull request's checks: a tick when they pass, a cross when they fail. */
export function CiBadge({ state }: { state: NonNullable<LivePin['ci']> }) {
  return (
    <svg
      className={styles.badge}
      data-state={state}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      role="img"
      aria-label={state === 'success' ? 'Checks passed' : 'Checks failed'}
    >
      <circle cx="5" cy="5" r="4.6" />
      <path
        d={state === 'success' ? 'M2.9 5.2 4.3 6.6 7.1 3.7' : 'M3.4 3.4 6.6 6.6M6.6 3.4 3.4 6.6'}
      />
    </svg>
  );
}
