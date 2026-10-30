import { Mic, Video } from 'lucide-react';
import { useRecording, type RecordingKind } from '@/state/recording';
import styles from './rows.module.css';

const LABELS: Record<RecordingKind, string> = {
  mic: 'Using the microphone',
  camera: 'Using the camera',
  both: 'Using the camera and microphone',
};

/** Arc's recording indicator, pulsing in the Mac's privacy colours (orange mic, green camera). */
export function RecordingBadge({
  tabIds,
  size = 14,
  className = styles.recording,
}: {
  tabIds: (number | undefined)[];
  size?: number;
  className?: string;
}) {
  const kind = useRecording(...tabIds);
  if (!kind) return null;
  return (
    <span
      className={`${styles.recordingMark} ${className}`}
      data-recording={kind}
      role="img"
      aria-label={LABELS[kind]}
      title={LABELS[kind]}
    >
      {kind === 'mic' ? <Mic size={size} /> : <Video size={size} />}
    </span>
  );
}
