# AGENTS.md

MaJa Player (`package.json` name `maja-player`) is an Electron desktop music player: React 19 + Vite 8 + Tailwind 4 + Zustand renderer, an esbuild-bundled Electron main process, and a sql.js library database. It is a single package, not a monorepo — `pnpm-workspace.yaml` only whitelists build scripts. There is no README, test suite, linter, formatter, CI, or packaging config.

## Commands

- Use `pnpm` (lockfile is present); don't introduce npm/yarn workflows.
- `pnpm dev` — builds `src/main` and `src/preload` once with esbuild, starts Vite on port 5173 (strict), then launches Electron. **Main/preload edits are not watched**: rerun `pnpm dev:main` and restart Electron, or restart `pnpm dev`. Renderer edits hot reload.
- `pnpm dev:renderer` — Vite only. Useful for styling, but `window.electronAPI` is absent, so library/audio/Discord features are inert.
- `pnpm typecheck` — the only static check. `pnpm build` does not run it, so run typecheck separately before finishing.
- `pnpm build` — wipes `dist/` and builds `dist/main/index.cjs` (Electron entry), `dist/preload/index.cjs`, and `dist/renderer/`. There is no packaging command; `electron-builder` is installed but unconfigured.
- No test, lint, or format scripts exist.

## Architecture

- `src/main/index.ts` — app entry. `ipc/` registers all IPC handlers, `database/` wraps sql.js, `library/` scans and watches folders, `audio/` serves media protocols, `lyrics/` resolves local/embedded/LRCLIB lyrics, `discord/` is a hand-rolled socket RPC client.
- `src/preload/index.ts` — exposes `window.electronAPI`; `ElectronAPI` is inferred from it and augments `Window` via `shared/types/electron.d.ts`. Renderer code must use this bridge, not `ipcRenderer`.
- `src/renderer` — Vite root (`vite.config.ts`). `index.html` is here, not at the repository root. `App.tsx` switches pages from `useLibraryStore.activeView`; there is no router. Zustand components use field selectors/`useShallow` — keep it that way, because `currentTime` updates about four times per second.
- `src/shared` — types and constants used by both processes. Existing imports are relative; `@renderer`/`@main`/`@shared` aliases are configured but currently unused.
- Adding IPC touches three places: a handler in `main/ipc/index.ts` (plus the feature module), a method in `preload/index.ts`, and a shared type if the payload is structured.

## Non-obvious behavior

- Playback uses one module-level `HTMLAudioElement` in `renderer/stores/usePlayerStore.ts`. Track audio is `maja-audio://stream?path=...` (main serves it with Range support); artwork is `maja-artwork://stream?file=...`; local wallpapers are `maja-artwork://load?path=...`. Schemes register before `app.whenReady()`; handlers register after DB init. The main process only serves indexed track paths and files inside the artwork cache, so do not bypass these protocols with `file://` URLs.
- Playback uses Electron/Chromium's HTML5 audio engine and the OS default output. There is no WASAPI exclusive mode, device routing, gapless playback, normalization, or playback-position restore; the UI no longer advertises those features. The Cinema visualizer is synthetic (`renderer/utils/audioReactivity.ts`), not a real spectrum analyser. Verify a setting is consumed before adding a control.
- Persistence lives under `app.getPath('userData')`: `maja-library.db` (sql.js), `settings.json`, and `artwork/`. `saveDatabase()` writes a temp file, fsyncs it, and atomically replaces the primary while retaining `maja-library.db.bak` for startup recovery. Schema versioning uses `PRAGMA user_version` (`SCHEMA_VERSION` in `main/database/index.ts`); add an incrementing migration there rather than relying on `CREATE TABLE IF NOT EXISTS`. `PRAGMA foreign_keys` is enabled, but sql.js resets it during `export()`, so `saveDatabase()` re-enables it.
- `scanFolders(folders)` removes every DB track not under the folders passed in. It relies on receiving the complete monitored folder set; the `library:scan` IPC handler merges new selections with `settings.musicFolders`. Pruning is skipped when any requested folder is unavailable, so disconnected drives do not erase their tracks. Preserve both invariants if you add another scan entrypoint.
- Electron hardening is configured in `main/index.ts` and `vite.config.ts`: single-instance lock, sandboxed preload, permission denial, navigation guard, and a CSP injected into the production HTML. Add any new external script/style/font/image/media origin to the CSP or it will be blocked.
- Watcher-driven rescans emit `library:changed`; `App.tsx` subscribes through `window.electronAPI.onLibraryChanged` and refreshes the library. Manual scans refresh directly in `useLibraryStore.scanFolders`. Artwork cache files are content-hashed and pruned after successful scans; lyrics use an in-process LRCLIB cache and skip online lookups when local/embedded synced lyrics exist.
- Track IDs are MD5 of the absolute path; album IDs are `${artist}___${title}`; artist IDs are names. Albums/artists are `GROUP BY` queries, not tables. Moving/renaming files or changing album/artist tags changes IDs and loses playlist/favorite associations.
- Library extensions are centralized in `shared/constants/index.ts` (`.flac`, `.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`) and mirrored by `main/audio` MIME detection; update both for new formats.
- Main/preload are bundled to CJS. `__dirname` is available, but avoid ESM-only constructs (top-level await, `import.meta`) that esbuild cannot lower to CJS.

## UI

- Tailwind v4, no config file; theme tokens and custom utilities (`.text-accent`, `.amoled-card`, animations, reduced-motion rules) live in `renderer/index.css`. `App.tsx` injects `--accent-color` inline; reuse those CSS variables rather than adding new config.
- The window is frameless: preserve `.app-drag-region` / `.app-no-drag` on custom chrome and use the existing preload window controls.
- `settings.reducedMotion` adds `.reduced-motion` at the app root; new animations should respect it.
- Cinema Mode replaces `♪`/“Instrumental” lines and long gaps with inline animated `InstrumentalDots`, driven by `getInstrumentalSegment` in `utils/karaokeEngine.ts`. Keep the dots inside the lyric list (not as a modal/overlay) and pause their CSS animation when `isPlaying` is false.
