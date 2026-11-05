import { Popover } from '@base-ui/react/popover';
import {
  Bell,
  Camera,
  Code,
  Cookie,
  Download,
  Hammer,
  Image,
  Lock,
  MapPin,
  Mic,
  ScrollText,
  SlidersHorizontal,
  SquareArrowOutUpRight,
  TextSearch,
  TriangleAlert,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { IconSwap } from '@/app/rows/IconSwap';
import type {
  SitePermission,
  SitePermissionKind,
  SitePermissionSetting,
  TabInfo,
} from '@/platform/types';
import { sitePermissions } from '@/state/tabs';
import {
  capture,
  captureWholePage,
  openSiteSettings,
  setDeveloperMode,
  setPermission,
} from './page-actions';
import { addSiteSearch } from '@/app/shortcuts/add';
import styles from './url-bar.module.css';

const PERMISSIONS: Record<SitePermissionKind, { title: string; icon: LucideIcon }> = {
  javascript: { title: 'JavaScript', icon: Code },
  images: { title: 'Images', icon: Image },
  popups: { title: 'Pop-ups and Redirects', icon: SquareArrowOutUpRight },
  notifications: { title: 'Notifications', icon: Bell },
  location: { title: 'Location', icon: MapPin },
  camera: { title: 'Camera', icon: Video },
  microphone: { title: 'Microphone', icon: Mic },
  automaticDownloads: { title: 'Automatic Downloads', icon: Download },
  cookies: { title: 'Cookies', icon: Cookie },
};

const SETTING: Record<SitePermissionSetting, string> = {
  allow: 'Allowed',
  block: 'Blocked',
  ask: 'Ask',
  session_only: 'This Session Only',
};

/** Arc's Site Control Center, without its Share, Boosts and extensions. */
export function SiteMenu({
  tab,
  developer,
  onOpenChange,
}: {
  tab: TabInfo;
  developer: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  // Read when the menu opens; rows then stay put while you change them.
  const [permissions, setPermissions] = useState<SitePermission[]>([]);
  const web = /^https?:/.test(tab.url);

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange(next);
    if (next) void sitePermissions(tab.url).then(setPermissions);
  };
  const thenClose = (run: () => void) => () => {
    change(false);
    run();
  };
  const toggle = (permission: SitePermission) => {
    const setting = permission.setting === 'allow' ? 'block' : 'allow';
    setPermissions((all) => all.map((p) => (p.kind === permission.kind ? { ...p, setting } : p)));
    void setPermission(tab.url, permission.kind, setting);
  };

  return (
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger
        className={styles.accessory}
        aria-label="Site controls"
        title="Site controls"
      >
        <SlidersHorizontal size={15} strokeWidth={1.75} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className={styles.positioner} side="bottom" align="end" sideOffset={8}>
          <Popover.Popup className={styles.menu} aria-label="Site controls">
            <Popover.Arrow className={styles.arrow}>
              <svg width="18" height="9" viewBox="0 0 18 9" aria-hidden>
                <path className={styles.arrowFill} d="M0 9 L9 0.5 L18 9 Z" />
                <path className={styles.arrowEdge} d="M0 9 L9 0.5 L18 9" />
              </svg>
            </Popover.Arrow>
            <div className={styles.tiles}>
              <button
                type="button"
                className={styles.tile}
                aria-label="Capture"
                title="Capture part of the page"
                onClick={thenClose(() => capture(tab))}
              >
                <Camera size={18} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={styles.tile}
                aria-label="Capture Full Page"
                title="Capture the whole page"
                onClick={thenClose(() => captureWholePage(tab))}
              >
                <ScrollText size={18} strokeWidth={1.75} />
              </button>
              {web && (
                <button
                  type="button"
                  className={styles.tile}
                  aria-label="Add Site Search"
                  title="Search this site from the command bar"
                  onClick={thenClose(() => void addSiteSearch(tab))}
                >
                  <TextSearch size={18} strokeWidth={1.75} />
                </button>
              )}
            </div>
            {web && (
              <>
                <div className={styles.heading}>
                  <span>Settings</span>
                  <button
                    type="button"
                    className={styles.more}
                    onClick={thenClose(() => openSiteSettings(tab.url))}
                  >
                    More
                  </button>
                </div>
                <Setting
                  icon={Hammer}
                  title="Developer Mode"
                  value={<IconSwap on={developer} off="Off" to="On" />}
                  onClick={() => setDeveloperMode(tab.url, !developer)}
                />
                {permissions.map((permission) => (
                  <Setting
                    key={permission.kind}
                    icon={PERMISSIONS[permission.kind].icon}
                    title={PERMISSIONS[permission.kind].title}
                    value={
                      permission.setting === 'allow' || permission.setting === 'block' ? (
                        <IconSwap
                          on={permission.setting === 'allow'}
                          off={SETTING.block}
                          to={SETTING.allow}
                        />
                      ) : (
                        SETTING[permission.setting]
                      )
                    }
                    onClick={() => toggle(permission)}
                  />
                ))}
                <div className={styles.footer}>
                  <button
                    type="button"
                    className={styles.security}
                    onClick={thenClose(() => openSiteSettings(tab.url))}
                  >
                    {tab.url.startsWith('https:') ? (
                      <>
                        <Lock size={14} strokeWidth={2} /> Secure
                      </>
                    ) : (
                      <>
                        <TriangleAlert size={14} strokeWidth={2} /> Not Secure
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Setting({
  icon: Icon,
  title,
  value,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  value: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <span className={styles.icon}>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className={styles.label}>
        <span>{title}</span>
        <span className={styles.value}>{value}</span>
      </span>
    </button>
  );
}
