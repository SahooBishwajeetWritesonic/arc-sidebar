import { storage } from '@wxt-dev/storage';
import { emptyModel, emptySession, type SessionState, type SidebarModel } from '@/model/types';

export const modelItem = storage.defineItem<SidebarModel>('local:sidebar', {
  fallback: emptyModel(),
  version: 1,
});

/** Today order and tab bindings; Chrome clears this when it restarts. */
export const sessionItem = storage.defineItem<SessionState>('session:sidebar', {
  fallback: emptySession(),
});
