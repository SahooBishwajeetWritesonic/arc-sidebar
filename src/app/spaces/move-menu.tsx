import type { MenuEntry } from '@/app/rows/RowMenu';
import type { Space } from '@/model/types';
import { SpaceGlyph } from './icons';

export function moveToSpaceMenu(
  spaces: readonly Space[],
  currentSpaceId: string,
  move: (spaceId: string) => void,
): MenuEntry[] {
  const others = spaces.filter((space) => space.id !== currentSpaceId);
  if (!others.length) return [];
  return [
    {
      label: 'Move to Space',
      submenu: others.map((space) => ({
        label: space.name,
        icon: <SpaceGlyph icon={space.icon} size={14} />,
        onSelect: () => move(space.id),
      })),
    },
  ];
}
