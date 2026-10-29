import { storage } from '@wxt-dev/storage';
import {
  defaultSettings,
  emptyArchive,
  emptyModel,
  emptySession,
  emptySnapshot,
  type ArchiveState,
  type Backup,
  type RestoreSnapshot,
  type SessionState,
  type SidebarModel,
  type TabDetails,
} from '@/model/types';
import type { CommandBarRequest } from './command-bar';
import type { FloatingKind } from './peek';

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

/** What was open before Chrome quit, for putting restored tabs back. */
export const restoreSnapshotItem = storage.defineItem<RestoreSnapshot>('local:todaySnapshot', {
  fallback: emptySnapshot(),
  version: 2,
  migrations: {
    // v2 added open pins; v1 was the Today URLs alone.
    2: (today: Record<string, string[]>): RestoreSnapshot => ({ ...emptySnapshot(), today }),
  },
});

/** Each tab's latest URL and title, for archiving tabs closed in Chrome. */
export const tabDetailsItem = storage.defineItem<TabDetails>('session:tabDetails', {
  fallback: {},
});

/**
 * A command bar asked for on a page Chrome protects, where it opens in the
 * sidebar instead; a sidebar that was closed opens it once it starts.
 */
export const commandBarRequestItem = storage.defineItem<CommandBarRequest | null>(
  'session:commandBarRequest',
  { fallback: null },
);

/** A Peek or Little Arc window: its one tab, and the window it came from. */
export interface FloatingWindow {
  kind: FloatingKind;
  tabId: number;
  from: number;
  openedAt: number;
}

/** Peek and Little Arc windows, by window id. */
export const floatingItem = storage.defineItem<Record<string, FloatingWindow>>('session:floating', {
  fallback: {},
});
