import { useLayoutEffect, useRef } from 'react';
import styles from './rows.module.css';

export function InlineEdit({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onCommit(input.current?.value ?? initial);
    else onCancel();
  };

  return (
    <input
      ref={input}
      className={styles.edit}
      defaultValue={initial}
      aria-label="Name"
      spellCheck={false}
      onKeyDown={(event) => {
        event.stopPropagation(); // keep the sidebar's arrow-key handling out
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
