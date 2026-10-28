import { storage } from '@wxt-dev/storage';
import {
  defaultSettings,
  emptyArchive,
  emptyModel,
  emptySession,
  type ArchiveState,
  type Backup,
  type SessionState,
  type SidebarModel,
  type TodaySnapshot,
} from '@/model/types';

/** Pins, folders, spaces and settings. Versioned so schema changes can migrate. */
export const modelItem = storage.defineItem<SidebarModel>('local:sidebar', {
  fallback: emptyModel(),
  version: 2,
  migrations: {
    // v2 added settings.
    2: (model: Omit<SidebarModel, 'settings'>): SidebarModel => ({
      ...model,
      settings: defaultSettings(),
    }),
  },
});

/** Today order and tab bindings; Chrome clears this when it restarts. */
export const sessionItem = storage.defineItem<SessionState>('session:sidebar', {
  fallback: emptySession(),
});

/** Archived Today tabs, newest first. */
export const archiveItem = storage.defineItem<ArchiveState>('local:archive', {
  fallback: emptyArchive(),
});

/** Rolling copies of the model, newest first. */
export const backupsItem = storage.defineItem<Backup[]>('local:backups', {
  fallback: [],
});

export const todaySnapshotItem = storage.defineItem<TodaySnapshot>('local:todaySnapshot', {
  fallback: {},
});
