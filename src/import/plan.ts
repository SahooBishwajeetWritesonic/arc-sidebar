import { generateNKeysBetween } from 'fractional-indexing';
import { childrenOf } from '@/model/tree';
import {
  FAVORITES_ID,
  FAVORITES_LIMIT,
  type FolderItem,
  type Item,
  type PinItem,
  type SidebarModel,
  type Space,
} from '@/model/types';
import { isSamePage } from '@/model/urls';
import type { ArcNode, ArcSidebar, ArcTab } from './arc';

export interface ImportChoice {
  /** Arc space ids to bring over. */
  spaceIds: string[];
  favorites: boolean;
}

export interface SpaceSummary {
  /** The existing space it goes into, when one has the same name. */
  into?: string;
  /** New pinned tabs and folders. */
  tabs: number;
  folders: number;
}

export interface ImportPlan {
  spaces: Space[];
  items: Item[];
  /** By Arc space id. */
  summary: Record<string, SpaceSummary>;
  favorites: number;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What importing `choice` would add. A space with a taken name merges into it (folders by
 * name, already-pinned pages skipped), so importing the same file twice adds nothing.
 */
export function planImport(
  model: SidebarModel,
  arc: ArcSidebar,
  choice: ImportChoice,
  newId: () => string,
): ImportPlan {
  const plan: ImportPlan = { spaces: [], items: [], summary: {}, favorites: 0 };

  for (const arcSpace of arc.spaces) {
    if (!choice.spaceIds.includes(arcSpace.id)) continue;
    const existing = model.spaces.find((space) => sameName(space.name, arcSpace.name));
    let spaceId: string;
    if (existing) {
      spaceId = existing.id;
    } else {
      const space: Space = { id: newId(), name: arcSpace.name };
      if (arcSpace.icon) space.icon = arcSpace.icon;
      plan.spaces.push(space);
      spaceId = space.id;
    }
    const pinned = Object.values(model.items).filter(
      (item): item is PinItem => item.kind === 'pin' && item.spaceId === spaceId,
    );
    const summary: SpaceSummary = { tabs: 0, folders: 0 };
    if (existing) summary.into = existing.name;

    const add = (nodes: ArcNode[], parentId: string | null, parentIsNew: boolean) => {
      const siblings = parentIsNew ? [] : childrenOf(model, spaceId, parentId);
      const fresh: ArcNode[] = [];
      for (const node of nodes) {
        if (node.kind === 'tab') {
          if (!pinned.some((pin) => isSamePage(pin.url, node.url))) fresh.push(node);
          continue;
        }
        const match = siblings.find(
          (item): item is FolderItem => item.kind === 'folder' && sameName(item.name, node.name),
        );
        if (match) add(node.children, match.id, false);
        else fresh.push(node);
      }
      const keys = generateNKeysBetween(siblings.at(-1)?.order ?? null, null, fresh.length);
      fresh.forEach((node, i) => {
        const base = { id: newId(), spaceId, parentId, order: keys[i]! };
        if (node.kind === 'tab') {
          plan.items.push(pinOf(base, node));
          summary.tabs++;
        } else {
          plan.items.push({ ...base, kind: 'folder', name: node.name, collapsed: true });
          summary.folders++;
          add(node.children, base.id, true);
        }
      });
    };
    add(arcSpace.pinned, null, !existing);
    plan.summary[arcSpace.id] = summary;
  }

  if (choice.favorites) {
    const current = childrenOf(model, FAVORITES_ID, null);
    const room = FAVORITES_LIMIT - current.length;
    const fresh = arc.favorites
      .filter(
        (tab) => !current.some((item) => item.kind === 'pin' && isSamePage(item.url, tab.url)),
      )
      .slice(0, Math.max(0, room));
    const keys = generateNKeysBetween(current.at(-1)?.order ?? null, null, fresh.length);
    fresh.forEach((tab, i) => {
      plan.items.push(
        pinOf({ id: newId(), spaceId: FAVORITES_ID, parentId: null, order: keys[i]! }, tab),
      );
    });
    plan.favorites = fresh.length;
  }

  return plan;
}

function pinOf(base: Omit<PinItem, 'kind' | 'url' | 'title'>, tab: ArcTab): PinItem {
  const pin: PinItem = { ...base, kind: 'pin', url: tab.url, title: tab.title };
  if (tab.customTitle) pin.customTitle = tab.customTitle;
  return pin;
}
