import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './boundary.module.css';

interface BoundaryProps {
  /** Names the region in the console (and for the test hook below). */
  region: string;
  /** What to say couldn't be shown; without it the region just disappears. */
  what?: string;
  children: ReactNode;
}

/** Keeps one broken region from blanking the whole panel (research/06 §5.5). */
export class Boundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`The ${this.props.region} region failed`, error, info.componentStack);
  }

  override render() {
    const { region, what, children } = this.props;
    if (!this.state.failed) {
      return (
        <>
          <CrashForTests region={region} />
          {children}
        </>
      );
    }
    if (!what) return null;
    return (
      <div className={styles.failed} role="alert">
        <p className={styles.message}>{what} couldn't be shown.</p>
        <button type="button" className={styles.reload} onClick={() => location.reload()}>
          Reload sidebar
        </button>
      </div>
    );
  }
}

/** Development only: `window.crashRegions = ['favorites']` makes that region throw. */
function CrashForTests({ region }: { region: string }) {
  const crash = (window as { crashRegions?: string[] }).crashRegions;
  if (import.meta.env.DEV && crash?.includes(region)) throw new Error(`Test crash: ${region}`);
  return null;
}
