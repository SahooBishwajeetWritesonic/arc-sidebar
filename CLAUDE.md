# Arc Sidebar

A personal Chrome (MV3) extension that recreates Arc's macOS sidebar inside Chrome's side panel. Arc fidelity and feel come first: if Arc does it a certain way, we copy that unless Chrome makes it impossible.

## Commands

- `npm run dev`: WXT dev server with HMR. It does not launch a browser; load `.output/chrome-mv3-dev` unpacked in your own Chrome (`chrome://extensions` → Developer mode → Load unpacked).
- `npm run build`: production build in `.output/chrome-mv3`.
- `npm run typecheck`, `npm run format`.

## Architecture rules

- The background service worker is the **only writer** of persisted state. Panels send intents, apply optimistic patches, and roll back on rejection.
- Identity is **our own UUIDs**. Chrome tab IDs change on every restart; they live only in `storage.session` bindings.
- Persistence is `storage.local` (versioned, with migrations and backups). Bookmarks and tab groups are never the source of truth (import or one-way mirror only).
- Chrome tab events are bursty and unordered: batch them, and re-sync from `tabs.query` periodically.
- Rows are keyed by our IDs and never rebuilt wholesale, so Motion can animate enter, exit and reorder.

## UI rules

- Specs live in `research/` (local only, git-ignored): `05` colours from Arc's app bundle, `07` measured layout (compact: 41 pt row pitch), `08` motion values, `06` general rules, `PLAN.md` §11 for where Arc overrides `06`.
- Styling: CSS Modules + custom properties. Colours and motion values come from tokens, never literals in components.
- Never put CSS transitions on properties that Motion or dnd-kit animate on the same element.
- Dark mode first (that is how Arc is used here), light mode must also work.
- Before calling a UI feature done: run the checklist in `research/06-design-principles.md` §6, using the `emil-design-eng` and `impeccable` skills.

## Conventions

- TypeScript strict. Dependencies are pinned to exact versions; upgrade deliberately (Motion and dnd-kit move fast).
- Small, focused changes. Don't commit unless asked.
- Commits: one line, lowercase conventional prefix, plain words about what changed (`feat: open new tabs at the top of today`). No body, no trailers. Several small commits over one big one.
