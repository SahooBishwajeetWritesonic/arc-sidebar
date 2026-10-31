import { generateNKeysBetween } from 'fractional-indexing';
import { SidebarService, type LiveTab } from '@/background/service';
import type { PullRequest } from '@/model/live';
import { feedOwner, meetingsIn, type CalendarState } from '@/platform/calendar';
import type { DownloadEntry } from '@/platform/downloads';
import type { GmailInbox } from '@/platform/gmail';
import type { Synced, SyncState } from '@/model/sync';
import { startCaptureTool } from '@/platform/capture-tool';
import {
  DEFAULT_SPACE_ID,
  defaultSettings,
  emptyArchive,
  emptyModel,
  emptySession,
  emptySnapshot,
  type Appearance,
  type ArchiveState,
  type Backup,
  type Intent,
  type Item,
  type PinItem,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import { hostname } from '@/model/urls';
import type {
  HistoryEntry,
  MediaAction,
  MediaState,
  Platform,
  Recording,
  SitePermission,
  SitePermissionKind,
  TabEvent,
  TabInfo,
} from '@/platform/types';

export interface Fixture {
  title: string;
  url: string;
  audible?: boolean;
  discarded?: boolean;
}

const WINDOW_ID = 1;
const TRACKS = ['Lo-fi beats to code to', 'Rainy day in Tokyo', 'Late night coffee'];
const MODEL_KEY = 'harness:model';
const SESSION_KEY = 'harness:session';
const ARCHIVE_KEY = 'harness:archive';
const BACKUPS_KEY = 'harness:backups';
const SNAPSHOT_KEY = 'harness:restoreSnapshot';
const DETAILS_KEY = 'harness:tabDetails';

/** ?theme=light|dark|system, so screenshots can pick a theme; dark by default. */
export function startingAppearance(): Appearance {
  const theme = new URLSearchParams(location.search).get('theme');
  return theme === 'light' ? 'light' : theme === 'system' ? 'auto' : 'dark';
}

function read<T>(storage: Storage, key: string, fallback: T): T {
  try {
    return JSON.parse(storage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

/**
 * An in-memory Chrome running the real SidebarService, with Chrome-like event latency.
 * Pins persist in localStorage; the session in sessionStorage, so "Restart Chrome" can clear it.
 */
export class FakePlatform implements Platform {
  private tabs: TabInfo[] = []; // Chrome's strip order
  private nextId = 1;
  private model: SidebarModel = read(localStorage, MODEL_KEY, {
    ...emptyModel(),
    // So the harness setting it on load isn't a change (with a backup).
    settings: { ...defaultSettings(), appearance: startingAppearance() },
  });
  private session: SessionState = read(sessionStorage, SESSION_KEY, emptySession());
  private archive: ArchiveState = read(localStorage, ARCHIVE_KEY, emptyArchive());
  private backups: Backup[] = read(localStorage, BACKUPS_KEY, []);
  /** When each tab was last viewed, like Chrome's tab.lastAccessed. */
  private accessed = new Map<number, number>();
  private archiveListeners = new Set<(archive: ArchiveState) => void>();
  /** Tabs a test says are using the mic or camera (no page here asks for them). */
  private recording: Record<number, Recording> = {};
  private recordingListeners = new Set<(recording: Record<number, Recording>) => void>();
  private calendar: CalendarState | null = null;
  private calendarRead: string | null | undefined;
  private calendarListeners = new Set<(calendar: CalendarState | null) => void>();
  /** One comes in while the list is watched; tests read `downloadsAsked`. */
  private downloadList: DownloadEntry[];
  private downloadListeners = new Set<() => void>();
  private downloading: ReturnType<typeof setInterval> | undefined;
  readonly downloadsAsked: { opened: number[]; shown: number[]; folder: number } = {
    opened: [],
    shown: [],
    folder: 0,
  };
  /** Each tab's pages behind it and ahead of it, nearest last. */
  private pages = new Map<number, { back: Fixture[]; forward: Fixture[] }>();
  /** Titles seen per URL, so a reopened tab gets its page title back. */
  private titles = new Map<string, string>([['chrome://newtab/', 'New Tab']]);
  private tabListeners = new Set<(event: TabEvent) => void>();
  private modelListeners = new Set<(model: SidebarModel) => void>();
  private sessionListeners = new Set<(session: SessionState) => void>();
  readonly service: SidebarService;
  private history: HistoryEntry[];
  private nextSplit = 1;
  /** Tracks playing in tabs that make sound (the YouTube fixture's playlist). */
  private tracks = new Map<number, number>();
  /** Permissions sites were given, by origin (Chrome's content settings). */
  private permissions = new Map<string, SitePermission[]>([
    ['https://mail.google.com', [{ kind: 'notifications', setting: 'allow' }]],
  ]);
  /** github.com as the Live Folder sees it. */
  private github: { signedIn: boolean; open: (PullRequest & { mine: boolean })[] };
  private nextPullRequest = 2000;
  /** Chrome's synced storage as this one computer sees it. */
  private synced: { copy: Synced | null; state: SyncState } = { copy: null, state: { base: null } };

  constructor(
    fixtures: Fixture[],
    history: HistoryEntry[] = [],
    pullRequests: (PullRequest & { mine: boolean })[] = [],
    /** What Gmail's feed says; null as if signed out. Tests may change it. */
    public inbox: GmailInbox | null = null,
    /** Any Live Calendar address's feed at a time; an address with "missing" gives a 404. */
    private calendarFeed: (now: number) => string = () => 'BEGIN:VCALENDAR\r\nEND:VCALENDAR',
    downloads: (now: number) => DownloadEntry[] = () => [],
  ) {
    this.history = [...history];
    this.downloadList = downloads(Date.now());
    this.github = { signedIn: true, open: [...pullRequests] };
    this.tabs = fixtures.map((fixture, i) => this.makeTab(fixture, i === 0));
    for (const tab of this.tabs) if (tab.audible) this.tracks.set(tab.id, 0);
    this.service = new SidebarService({
      queryTabs: async () => this.tabs.map((tab, index) => this.live(tab, index)),
      createTab: async (_windowId, url, active) =>
        this.openTab({ title: this.titles.get(url) ?? new URL(url).hostname, url }, active),
      activateTab: async (tabId) => this.activateTab(tabId),
      navigateTab: async (tabId, url) => this.navigate(tabId, url),
      closeTab: async (tabId) => this.closeTab(tabId),
      loadModel: async () => this.model,
      saveModel: async (model) => {
        this.model = model;
        this.readCalendar(model.settings.calendar?.feed ?? null);
        localStorage.setItem(MODEL_KEY, JSON.stringify(model));
        this.later(12, () => this.modelListeners.forEach((listener) => listener(model)));
      },
      loadSession: async () => this.session,
      saveSession: async (session) => {
        this.session = session;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        this.later(12, () => this.sessionListeners.forEach((listener) => listener(session)));
      },
      loadArchive: async () => this.archive,
      saveArchive: async (archive) => {
        this.archive = archive;
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
        this.later(12, () => this.archiveListeners.forEach((listener) => listener(archive)));
      },
      loadBackups: async () => this.backups,
      saveBackups: async (backups) => {
        this.backups = backups;
        localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));
      },
      now: () => Date.now(),
      loadSnapshot: async () => read(localStorage, SNAPSHOT_KEY, emptySnapshot()),
      saveSnapshot: async (snapshot) =>
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)),
      sync: {
        read: async () => structuredClone(this.synced.copy),
        write: async (copy) => void (this.synced.copy = structuredClone(copy)),
        loadState: async () => this.synced.state,
        saveState: async (state) => void (this.synced.state = state),
      },
      loadTabDetails: async () => read(sessionStorage, DETAILS_KEY, {}),
      saveTabDetails: async (details) =>
        sessionStorage.setItem(DETAILS_KEY, JSON.stringify(details)),
      // A search takes GitHub a moment.
      fetchPullRequests: async (filters) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (!this.github.signedIn) return { signedIn: false };
        const pullRequests = this.github.open
          .filter((pr) => (pr.mine ? filters.createdByMe : filters.reviewRequests))
          .filter((pr) => filters.drafts || !pr.draft)
          .map(({ mine: _mine, ...pr }) => pr);
        return { signedIn: true, pullRequests };
      },
      defer: (run, ms) => void setTimeout(run, ms),
      newId: () => crypto.randomUUID(),
    });
    void this.seed();
  }

  async currentWindowId() {
    return WINDOW_ID;
  }

  async queryTabs() {
    return this.tabs.map((tab) => ({ ...tab }));
  }

  onTabEvent(listener: (event: TabEvent) => void) {
    this.tabListeners.add(listener);
    return () => void this.tabListeners.delete(listener);
  }

  async loadModel() {
    await this.service.ready;
    return this.model;
  }

  onModelChange(listener: (model: SidebarModel) => void) {
    this.modelListeners.add(listener);
    return () => void this.modelListeners.delete(listener);
  }

  async loadSession() {
    await this.service.ready;
    return this.session;
  }

  onSessionChange(listener: (session: SessionState) => void) {
    this.sessionListeners.add(listener);
    return () => void this.sessionListeners.delete(listener);
  }

  async loadArchive() {
    await this.service.ready;
    return this.archive;
  }

  onArchiveChange(listener: (archive: ArchiveState) => void) {
    this.archiveListeners.add(listener);
    return () => void this.archiveListeners.delete(listener);
  }

  // A moment, as Gmail takes.
  async gmailInbox() {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return structuredClone(this.inbox);
  }

  onRecordingChange(listener: (recording: Record<number, Recording>) => void) {
    listener(this.recording);
    this.recordingListeners.add(listener);
    return () => void this.recordingListeners.delete(listener);
  }

  async downloads() {
    return structuredClone(this.downloadList);
  }

  onDownloadsChange(listener: () => void) {
    this.downloadListeners.add(listener);
    this.downloading ??= setInterval(() => this.downloadStep(), 400);
    return () => void this.downloadListeners.delete(listener);
  }

  private downloadStep() {
    const coming = this.downloadList.find(
      (entry) => entry.state === 'in_progress' && !entry.paused,
    );
    if (!coming) {
      clearInterval(this.downloading);
      this.downloading = undefined;
      return;
    }
    coming.received = Math.min(coming.total, coming.received + 4_000_000);
    if (coming.received === coming.total) coming.state = 'complete';
    this.downloadListeners.forEach((listener) => listener());
  }

  private changeDownload(id: number, patch: Partial<DownloadEntry>) {
    this.downloadList = this.downloadList.map((entry) =>
      entry.id === id ? { ...entry, ...patch } : entry,
    );
    this.downloadListeners.forEach((listener) => listener());
  }

  openDownload(id: number) {
    this.downloadsAsked.opened.push(id);
  }

  showDownload(id: number) {
    this.downloadsAsked.shown.push(id);
  }

  showDownloadsFolder() {
    this.downloadsAsked.folder++;
  }

  cancelDownload(id: number) {
    this.changeDownload(id, { state: 'interrupted', error: 'USER_CANCELED' });
  }

  eraseDownloads(ids: number[]) {
    this.downloadList = this.downloadList.filter((entry) => !ids.includes(entry.id));
    this.downloadListeners.forEach((listener) => listener());
  }

  async downloadIcon() {
    return undefined;
  }

  onCalendarChange(listener: (calendar: CalendarState | null) => void) {
    listener(this.calendar);
    this.calendarListeners.add(listener);
    return () => void this.calendarListeners.delete(listener);
  }

  /** Like the background, reads Live Calendar's feed shortly after its address changes. */
  private readCalendar(feed: string | null) {
    if (feed === this.calendarRead) return;
    this.calendarRead = feed;
    this.later(300, () => {
      const now = Date.now();
      const hour = 3600_000;
      this.calendar = !feed
        ? null
        : feed.includes('missing')
          ? { feed, meetings: [], checkedAt: now, problem: 'No calendar at this address' }
          : {
              feed,
              meetings: meetingsIn(
                this.calendarFeed(now),
                now - 12 * hour,
                now + 36 * hour,
                feedOwner(feed),
              ),
              checkedAt: now,
            };
      this.calendarListeners.forEach((listener) => listener(this.calendar));
    });
  }

  /** As a page starting or stopping its mic or camera would, for tests. */
  setRecording(tabId: number, recording: Recording | null) {
    const { [tabId]: _old, ...rest } = this.recording;
    this.recording = recording ? { ...rest, [tabId]: recording } : rest;
    this.recordingListeners.forEach((listener) => listener(this.recording));
  }

  async loadBackups() {
    await this.service.ready;
    return this.backups;
  }

  async loadSyncProblem() {
    return this.synced.state.problem;
  }

  async sendIntent(intent: Intent) {
    await new Promise((resolve) => setTimeout(resolve, 6)); // message hop
    return this.service.handleIntent(intent);
  }

  activateTab(tabId: number) {
    const current = this.tabs.find((tab) => tab.active);
    if (current?.id === tabId || !this.tabs.some((tab) => tab.id === tabId)) return;
    for (const tab of this.tabs) tab.active = tab.id === tabId;
    this.accessed.set(tabId, Date.now());
    this.emit({ type: 'activate', tabId, windowId: WINDOW_ID });
    void this.service.onTabActivated(tabId, WINDOW_ID);
  }

  closeTab(tabId: number) {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const [closed] = this.tabs.splice(index, 1);
    this.emit({ type: 'remove', tabId });
    // Its split ends with it; the other tab stays.
    if (closed?.splitViewId) this.unsplit(closed.splitViewId);
    void this.service.onTabRemoved(tabId, WINDOW_ID);
    if (closed?.active) {
      // Chrome picks its own next tab; the panel usually got there first.
      const next = this.tabs[index] ?? this.tabs[index - 1];
      if (next) this.activateTab(next.id);
    }
  }

  newTab() {
    this.openTab({ title: 'New Tab', url: 'chrome://newtab/' });
  }

  setMuted(tabId: number, muted: boolean) {
    this.patch(tabId, { muted });
  }

  async recentTabs() {
    const at = (id: number) => this.accessed.get(id) ?? 0;
    return [...this.tabs].sort((a, b) => at(b.id) - at(a.id)).map((tab) => tab.id);
  }

  async searchHistory(text: string) {
    await new Promise((resolve) => setTimeout(resolve, 4)); // like chrome.history
    const query = text.toLowerCase();
    return this.history
      .filter((entry) => `${entry.title} ${entry.url}`.toLowerCase().includes(query))
      .sort((a, b) => b.lastVisitTime - a.lastVisitTime)
      .slice(0, 200);
  }

  openUrl(_windowId: number, url: string) {
    this.openTab({ title: this.titles.get(url) ?? hostname(url), url });
  }

  navigateTab(tabId: number, url: string) {
    this.navigate(tabId, url, this.titles.get(url));
  }

  searchWeb(text: string, tabId?: number) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
    const title = `${text} - Google Search`;
    if (tabId === undefined) this.openTab({ title, url });
    else this.navigate(tabId, url, title);
  }

  /** The real capture tool, over the harness page, which stands in for the tab's page. */
  async startCapture(tabId: number) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab || !/^https?:/.test(tab.url)) return false;
    startCaptureTool({ shoot: (area) => picture(tab.title, area.width, area.height) });
    return true;
  }

  async captureFullPage(tabId: number) {
    const tab = this.tabs.find((t) => t.id === tabId);
    return tab && /^https?:/.test(tab.url) ? picture(tab.title, 640, 1600) : null;
  }

  async sitePermissions(url: string) {
    return /^https?:/.test(url) ? [...(this.permissions.get(new URL(url).origin) ?? [])] : [];
  }

  async setSitePermission(url: string, kind: SitePermissionKind, setting: 'allow' | 'block') {
    const origin = new URL(url).origin;
    const others = (this.permissions.get(origin) ?? []).filter((p) => p.kind !== kind);
    this.permissions.set(origin, [...others, { kind, setting }]);
  }

  /** Chrome reports the tab as moved out, to a window of its own (one window here). */
  openInLittleArc(_windowId: number, what: { tabId: number } | { url: string }) {
    if (!('tabId' in what)) return;
    const index = this.tabs.findIndex((tab) => tab.id === what.tabId);
    if (index === -1) return;
    const [moved] = this.tabs.splice(index, 1);
    this.emit({ type: 'remove', tabId: what.tabId });
    void this.service.onTabDetached(what.tabId, WINDOW_ID);
    if (moved?.active) {
      const next = this.tabs[index] ?? this.tabs[index - 1];
      if (next) this.activateTab(next.id);
    }
  }

  /** The tab leaves for a new window, as Chrome reports it (one window here, so it's gone). */
  moveToNewWindow(tabId: number) {
    const index = this.tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const [moved] = this.tabs.splice(index, 1);
    this.emit({ type: 'remove', tabId });
    void this.service.onTabDetached(tabId, WINDOW_ID);
    if (moved?.active) {
      const next = this.tabs[index] ?? this.tabs[index - 1];
      if (next) this.activateTab(next.id);
    }
  }

  /** Selects the tab first, like the real one: Chrome makes the active tab the copy's opener. */
  async duplicateTab(tabId: number) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    this.activateTab(tabId);
    this.openTab({ title: tab.title, url: tab.url }, true, tabId);
  }

  /** As Chrome does: the right tab moves next to the left, then both get the split's id. */
  splitTabs(left: number, right: number) {
    const a = this.tabs.find((t) => t.id === left);
    const b = this.tabs.find((t) => t.id === right);
    if (!a || !b || a === b || a.splitViewId || b.splitViewId) return;
    this.tabs.splice(this.tabs.indexOf(b), 1);
    this.tabs.splice(this.tabs.indexOf(a) + 1, 0, b);
    const splitViewId = this.nextSplit++;
    this.later(8, () => {
      this.patch(left, { splitViewId });
      this.patch(right, { splitViewId });
      void this.service.onTabSplit(splitViewId);
    });
  }

  unsplit(splitViewId: number) {
    for (const tab of this.tabs) {
      if (tab.splitViewId === splitViewId) this.patch(tab.id, { splitViewId: undefined });
    }
  }

  openInSplit(tabId: number, url: string) {
    this.openUrl(WINDOW_ID, url);
    this.splitTabs(tabId, this.nextId - 1);
  }

  splitActiveWithNext() {
    const index = this.tabs.findIndex((tab) => tab.active);
    const next = this.tabs[index + 1];
    if (index !== -1 && next) this.splitTabs(this.tabs[index]!.id, next.id);
  }

  async mediaState(tabId: number): Promise<MediaState | null> {
    await new Promise((resolve) => setTimeout(resolve, 6)); // a script run in the tab
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    const track = this.tracks.get(tabId);
    if (track === undefined) return { playing: tab.audible, actions: [] };
    return {
      playing: tab.audible,
      title: TRACKS[track % TRACKS.length],
      artist: 'Lofi Girl',
      actions: ['play', 'pause', 'previoustrack', 'nexttrack'],
    };
  }

  /** As a page would: pausing goes quiet, skipping changes the title. */
  async mediaCommand(tabId: number, action: MediaAction) {
    await new Promise((resolve) => setTimeout(resolve, 6));
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (action === 'play' || action === 'pause') {
      this.tracks.set(tabId, this.tracks.get(tabId) ?? 0);
      this.patch(tabId, { audible: action === 'play' });
      return;
    }
    const track = (this.tracks.get(tabId) ?? 0) + (action === 'nexttrack' ? 1 : -1 + TRACKS.length);
    this.tracks.set(tabId, track);
    this.patch(tabId, { title: `${TRACKS[track % TRACKS.length]} - YouTube`, audible: true });
  }

  faviconUrl(pageUrl: string) {
    if (!/^https?:/.test(pageUrl)) return undefined;
    const { hostname } = new URL(pageUrl);
    // Google's GitHub icon is on a white square; Chrome keeps GitHub's own round mark, white in
    // dark mode. The harness's scheme is the one its controls chose, else the system's.
    if (hostname === 'github.com') {
      const chosen = getComputedStyle(document.documentElement).colorScheme;
      const dark =
        chosen === 'dark' ||
        (chosen !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
      return `https://github.githubassets.com/favicons/favicon${dark ? '-dark' : ''}.png`;
    }
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  }

  // Simulation helpers for the harness controls

  openTab(fixture: Fixture, active = true, openerTabId?: number) {
    const tab = { ...this.makeTab(fixture, false), openerTabId };
    this.tabs.push(tab);
    this.emit({ type: 'upsert', tab: { ...tab } });
    void this.service.onTabCreated(this.live(tab, this.tabs.length - 1));
    if (active) this.activateTab(tab.id);
    if (/^https?:/.test(tab.url)) this.simulateLoad(tab.id);
  }

  closeRandom() {
    const tab = this.randomTab();
    if (tab) this.closeTab(tab.id);
  }

  reloadRandom() {
    const tab = this.randomTab();
    if (tab) this.simulateLoad(tab.id);
  }

  /** Every tab loads at once: a storm of tab events, as after a restart. */
  reloadAll() {
    for (const tab of this.tabs) this.simulateLoad(tab.id);
  }

  toggleAudibleRandom() {
    const tab = this.tabs.find((t) => t.audible) ?? this.randomTab();
    if (tab) this.patch(tab.id, { audible: !tab.audible, muted: false });
  }

  /** Follows a link inside the active tab, so a pinned tab shows its "/". */
  navigateActive() {
    const tab = this.tabs.find((t) => t.active);
    if (!tab || !/^https?:/.test(tab.url)) return;
    const url = new URL(tab.url);
    url.pathname = `/page-${Math.floor(Math.random() * 1000)}`;
    this.navigate(tab.id, url.href, `Another page on ${url.hostname}`);
  }

  /** A link in the active tab opened in a new tab, in the background (⌘-click). */
  openLinkFromActive() {
    const tab = this.tabs.find((t) => t.active);
    if (!tab || !/^https?:/.test(tab.url)) return;
    const url = new URL(tab.url);
    url.pathname = `/link-${Math.floor(Math.random() * 1000)}`;
    this.openTab({ title: `A link on ${url.hostname}`, url: url.href }, false, tab.id);
  }

  /** Pretends nobody has looked at the inactive tabs for `hours`. */
  ageTabs(hours: number) {
    const then = Date.now() - hours * 3600_000;
    for (const tab of this.tabs) if (!tab.active) this.accessed.set(tab.id, then);
  }

  runAutoArchive() {
    return this.service.archiveStale();
  }

  activeTabId() {
    return this.tabs.find((tab) => tab.active)?.id;
  }

  /** Opens one of the open pull requests, the way the Live Folder first appears. */
  openPullRequestPage() {
    const pr = this.github.open[0];
    if (!pr) return;
    this.openTab({ title: `${pr.title} · Pull Request #${pr.number} · ${pr.repo}`, url: pr.url });
  }

  /**
   * Someone asks for your review. The folder looks at once, unless `look` is
   * false: then it shows at the next look (the alarm, or Refresh).
   */
  requestReview(look = true) {
    const number = this.nextPullRequest++;
    this.github.open.push({
      url: `https://github.com/acme/api/pull/${number}`,
      title: `Review me: change ${number}`,
      repo: 'acme/api',
      number,
      draft: false,
      created: new Date().toISOString(),
      mine: false,
    });
    return look ? this.service.refreshLiveFolder(true) : Promise.resolve();
  }

  mergePullRequest() {
    const newest = [...this.github.open].sort((a, b) => b.created.localeCompare(a.created))[0];
    this.github.open = this.github.open.filter((pr) => pr !== newest);
    return this.service.refreshLiveFolder(true);
  }

  setGitHubSignedIn(signedIn: boolean) {
    this.github.signedIn = signedIn;
    return this.service.refreshLiveFolder(true);
  }

  /** Forgets the session, as a Chrome restart does, and reloads. */
  restartChrome() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DETAILS_KEY);
    location.reload();
  }

  resetEverything() {
    localStorage.removeItem(MODEL_KEY);
    localStorage.removeItem(ARCHIVE_KEY);
    localStorage.removeItem(BACKUPS_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DETAILS_KEY);
    location.reload();
  }

  /**
   * First run: pins two tabs and puts two in a folder in one change, so no backup is taken of
   * a half-seeded sidebar; pinning each tab after that only binds it.
   */
  private async seed() {
    await this.service.ready;
    this.readCalendar(this.model.settings.calendar?.feed ?? null);
    if (Object.keys(this.model.items).length > 0) return;
    const [gmail, calendar, linear, github] = this.tabs;
    if (!gmail || !calendar || !linear || !github) return;
    const keys = generateNKeysBetween(null, null, 3);
    const inner = generateNKeysBetween(null, null, 2);
    const folderId = crypto.randomUUID();
    const folder: Item = {
      kind: 'folder',
      id: folderId,
      spaceId: DEFAULT_SPACE_ID,
      parentId: null,
      order: keys[2]!,
      name: 'Dev',
      collapsed: false,
    };
    const pins = (
      [
        [gmail, keys[0]!, null],
        [calendar, keys[1]!, null],
        [linear, inner[0]!, folderId],
        [github, inner[1]!, folderId],
      ] as const
    ).map(([tab, order, parentId]): PinItem & { tabId: number } => ({
      kind: 'pin',
      id: crypto.randomUUID(),
      spaceId: DEFAULT_SPACE_ID,
      parentId,
      order,
      url: tab.url,
      title: tab.title,
      tabId: tab.id,
    }));
    await this.service.handleIntent({
      type: 'importSidebar',
      spaces: [],
      items: [folder, ...pins.map(({ tabId: _tab, ...pin }) => pin)],
    });
    for (const { tabId, id, spaceId, parentId, order, url, title } of pins) {
      await this.service.handleIntent({
        type: 'pinTab',
        itemId: id,
        tabId,
        spaceId,
        parentId,
        order,
        url,
        title,
      });
    }
  }

  private live(tab: TabInfo, index: number): LiveTab {
    return {
      id: tab.id,
      windowId: tab.windowId,
      index,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      audible: tab.audible,
      lastAccessed: this.accessed.get(tab.id),
      splitViewId: tab.splitViewId,
      openerTabId: tab.openerTabId,
    };
  }

  private makeTab(fixture: Fixture, active: boolean): TabInfo {
    this.accessed.set(this.nextId, Date.now());
    this.titles.set(fixture.url, fixture.title);
    return {
      id: this.nextId++,
      windowId: WINDOW_ID,
      title: fixture.title,
      url: fixture.url,
      favIconUrl: undefined,
      loading: false,
      active,
      audible: fixture.audible ?? false,
      muted: false,
      discarded: fixture.discarded ?? false,
    };
  }

  private navigate(tabId: number, url: string, title?: string) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      const { back } = this.historyOf(tabId);
      this.pages.set(tabId, { back: [...back, { url: tab.url, title: tab.title }], forward: [] });
    }
    this.patch(tabId, { url, title: title ?? new URL(url).hostname });
    this.simulateLoad(tabId);
  }

  private historyOf(tabId: number) {
    return this.pages.get(tabId) ?? { back: [], forward: [] };
  }

  historyStep(tabId: number, by: -1 | 1, inNewTab = false) {
    const tab = this.tabs.find((t) => t.id === tabId);
    const { back, forward } = this.historyOf(tabId);
    const to = by < 0 ? back.at(-1) : forward.at(-1);
    if (!tab || !to) return;
    if (inNewTab) return this.openTab(to);
    const here = { url: tab.url, title: tab.title };
    this.pages.set(
      tabId,
      by < 0
        ? { back: back.slice(0, -1), forward: [...forward, here] }
        : { back: [...back, here], forward: forward.slice(0, -1) },
    );
    this.patch(tabId, to);
    this.simulateLoad(tabId);
  }

  reloadTab(tabId: number) {
    this.simulateLoad(tabId);
  }

  stopLoading(tabId: number) {
    this.patch(tabId, { loading: false });
  }

  private simulateLoad(tabId: number) {
    this.patch(tabId, { loading: true, favIconUrl: undefined });
    this.later(600 + Math.random() * 900, () =>
      this.patch(tabId, { loading: false, favIconUrl: 'loaded' }),
    );
  }

  private patch(tabId: number, change: Partial<TabInfo>) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    Object.assign(tab, change);
    this.emit({ type: 'upsert', tab: { ...tab } });
    if ('url' in change || 'title' in change) {
      void this.service.onTabUpdated(tabId, { url: tab.url, title: tab.title });
    }
  }

  private randomTab() {
    return this.tabs[Math.floor(Math.random() * this.tabs.length)];
  }

  private emit(event: TabEvent) {
    this.later(4, () => this.tabListeners.forEach((listener) => listener(event)));
  }

  private later(ms: number, run: () => void) {
    setTimeout(run, ms);
  }
}

/** A stand-in picture: a light card with the page's title. */
function picture(title: string, width: number, height: number) {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(width)),
    Math.max(1, Math.round(height)),
  );
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#f4f4f6';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#222';
  context.font = '24px system-ui';
  context.fillText(title, 24, 48);
  return canvas.convertToBlob({ type: 'image/png' });
}
