import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { SpaceTheme } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { useUi } from '@/state/ui';
import { themeLook, type Scheme, type ThemeLook } from './engine';

const darkQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function subscribeToSystem(onChange: () => void) {
  darkQuery?.addEventListener('change', onChange);
  return () => darkQuery?.removeEventListener('change', onChange);
}

/** Light or dark, from the Appearance setting (Auto follows the system). */
export function usePreferredScheme(): Scheme {
  const appearance = useSidebar((state) => state.model.settings?.appearance ?? 'auto');
  const systemDark = useSyncExternalStore(subscribeToSystem, () => darkQuery?.matches ?? true);
  if (appearance === 'auto') return systemDark ? 'dark' : 'light';
  return appearance;
}

/** Each space's look, keyed by space id. The theme being edited shows its draft. */
export function useSpaceLooks(): Record<string, ThemeLook> {
  const spaces = useSidebar((state) => state.model.spaces);
  const preview = useUi((state) => state.themePreview);
  const preferred = usePreferredScheme();
  return useMemo(() => {
    const looks: Record<string, ThemeLook> = {};
    for (const space of spaces) {
      const theme: SpaceTheme | undefined =
        preview?.spaceId === space.id ? (preview.theme ?? undefined) : space.theme;
      looks[space.id] = themeLook(theme, preferred);
    }
    return looks;
  }, [spaces, preview, preferred]);
}

/** The page takes the shown space's colour scheme, so the bottom bar, menus and toasts match. */
export function useRootScheme(scheme: Scheme | undefined) {
  useEffect(() => {
    if (scheme) document.documentElement.style.colorScheme = scheme;
  }, [scheme]);
}
