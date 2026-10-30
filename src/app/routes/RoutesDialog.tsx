import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { useState } from 'react';
import { setRoutes } from '@/app/actions';
import sheet from '@/app/sheet/sheet.module.css';
import type { Route } from '@/model/types';
import { newId, useSidebar } from '@/state/sidebar';
import { setEditingRoutes, useUi } from '@/state/ui';
import styles from './routes.module.css';

/** Arc's Air Traffic Control: new tabs at matching addresses open in a chosen space. */
export function RoutesDialog() {
  const open = useUi((state) => state.editingRoutes);
  return (
    <Dialog.Root open={open} onOpenChange={setEditingRoutes}>
      <Dialog.Portal>
        <Dialog.Backdrop className={sheet.backdrop} />
        <RoutesPopup />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoutesPopup() {
  const spaces = useSidebar((state) => state.model.spaces);
  // A copy to edit; saved with Save, dropped with Cancel.
  const [routes, setDraft] = useState(() => useSidebar.getState().model.settings.routes);
  const change = (id: string, patch: Partial<Route>) =>
    setDraft((draft) => draft.map((route) => (route.id === id ? { ...route, ...patch } : route)));
  const add = () =>
    setDraft((draft) => [
      ...draft,
      { id: newId(), match: 'contains', text: '', spaceId: useSidebar.getState().spaceId },
    ]);

  return (
    <Dialog.Popup className={sheet.popup}>
      <Dialog.Title className={sheet.title}>Air Traffic Control</Dialog.Title>
      <Dialog.Description className={sheet.description}>
        New tabs at these addresses open in the space you choose. The first rule that matches
        decides.
      </Dialog.Description>
      {routes.length ? (
        <ul className={styles.rules} aria-label="Rules">
          {routes.map((route, i) => (
            <li key={route.id} className={styles.rule}>
              <div className={styles.line}>
                <select
                  className={styles.field}
                  aria-label={`Rule ${i + 1}: the address contains, or is`}
                  value={route.match}
                  onChange={(event) =>
                    change(route.id, { match: event.target.value as Route['match'] })
                  }
                >
                  <option value="contains">Contains</option>
                  <option value="is">Is</option>
                </select>
                <input
                  className={`${styles.field} ${styles.text}`}
                  aria-label={`Rule ${i + 1}: address`}
                  placeholder={route.match === 'contains' ? 'figma.com' : 'github.com/pulls'}
                  spellCheck={false}
                  autoFocus={!route.text && i === routes.length - 1}
                  value={route.text}
                  onChange={(event) => change(route.id, { text: event.target.value })}
                />
                <button
                  type="button"
                  className={sheet.icon}
                  aria-label={`Remove rule ${i + 1}`}
                  onClick={() => setDraft((draft) => draft.filter((r) => r.id !== route.id))}
                >
                  <X size={14} />
                </button>
              </div>
              <label className={styles.line}>
                <span className={styles.label}>Open in</span>
                <select
                  className={`${styles.field} ${styles.text}`}
                  value={route.spaceId}
                  onChange={(event) => change(route.id, { spaceId: event.target.value })}
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                  {!spaces.some((space) => space.id === route.spaceId) && (
                    <option value={route.spaceId}>A deleted space</option>
                  )}
                </select>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className={sheet.empty}>
          No rules yet. Add one to send, say, every Figma file to your Design space.
        </p>
      )}
      <footer className={sheet.footer}>
        <button type="button" className={`${sheet.button} ${sheet.leading}`} onClick={add}>
          Add Rule
        </button>
        <Dialog.Close className={sheet.button}>Cancel</Dialog.Close>
        <button
          type="button"
          className={sheet.primary}
          onClick={() => {
            setRoutes(routes);
            setEditingRoutes(false);
          }}
        >
          Save
        </button>
      </footer>
    </Dialog.Popup>
  );
}
