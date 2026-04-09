# PWA Redesign Plan

## Objective

Redesign the HAPI web PWA to provide a polished, mobile-first experience with clear session overview, intuitive navigation with swipe gestures, and working terminal connectivity. The current app suffers from poor session organization (only groups by top-level directory), no gesture-based navigation, and broken terminal connections.

---

## Current State Assessment

### Architecture Summary

| Layer | Tech | Key Files |
|---|---|---|
| Router | TanStack Router | `web/src/router.tsx` |
| State | TanStack Query + custom external store | `web/src/hooks/queries/`, `web/src/lib/message-window-store.ts` |
| Realtime | SSE (messages/sessions) + Socket.IO (terminal only) | `web/src/hooks/useSSE.ts`, `web/src/hooks/useTerminalSocket.ts` |
| UI | Tailwind + hand-rolled components + Radix primitives | `web/src/components/`, `web/src/components/ui/` |
| Chat | assistant-ui/react runtime | `web/src/lib/assistant-runtime.ts` |

### Critical Problems Identified

**P0 -- Terminal broken**
- Terminal Socket.IO connects to `/terminal` namespace (`web/src/hooks/useTerminalSocket.ts:119`)
- Authentication uses JWT passed as `socket.handshake.auth.token`
- Hub validates JWT via `jwtSecret` (`hub/src/socket/server.ts:119-138`)
- `isRemoteTerminalSupported()` (`web/src/utils/terminalSupport.ts:7-8`) gates on `metadata.os` -- but `SessionMetadataSummary` used by the type does not include `os`. Only the full `Session.metadata` schema has `os` (`shared/src/schemas.ts:27`). If the session query returns a summary without `os`, `isRemoteTerminalSupported` returns `true` but the terminal page fetches the full session via `useSession` which does have `os`. The real issue is likely that the session is not `active` when the terminal page loads (the guard at `terminal.tsx:268` returns early if `!session?.active`), or the CLI is not in the Socket.IO `session:<id>` room for `pickCliSocketId` to find it.
- Additionally, the hub's `pickCliSocketId` (`hub/src/socket/handlers/terminal.ts:71-83`) requires a CLI socket to be in the `session:<sessionId>` room AND matching the namespace. If the CLI has disconnected or the namespace doesn't match, `terminal:create` fails silently.

**P1 -- Session organization is poor**
- `SessionList.tsx:33-81`: Groups sessions by `session.metadata.worktree.basePath ?? session.metadata.path ?? 'Other'` combined with `machineId`
- Display name shows only last 2 path segments (`SessionList.tsx:23-29`): e.g. `/Users/dmnk/projects/personal/hapi` shows as `personal/hapi`
- No filtering, no search, no status-based views
- Session title falls back to: `metadata.name` > `metadata.summary.text` > last path segment > `id.slice(0,8)` (`SessionList.tsx:143-155`)
- Inactive groups auto-collapse but there's no way to filter them out entirely
- No indication of session agent type icon (just text "claude"/"codex")

**P2 -- No gesture navigation**
- The app explicitly disables gestures: `App.tsx:84-86` prevents `gesturestart/change/end`
- `index.css:102`: `touch-action: pan-x pan-y` + `overscroll-behavior: none`
- No swipe-to-navigate between session list / chat / files / terminal
- No pull-to-refresh
- No swipe-to-dismiss or swipe-to-reveal actions on session items

**P3 -- Poor overview / dashboard**
- No dashboard or summary view -- root `/` just redirects to `/sessions`
- No aggregate status: total active sessions, pending permissions, active machines
- No notification center or activity feed
- Session list header only shows count (`router.tsx:138-139`)

**P4 -- Mobile UX gaps**
- Master-detail layout hides sidebar on mobile with hard cut (`router.tsx:134`): `hidden lg:flex` / `flex` toggle
- No transition animations between views
- Session header only has back + files + menu buttons (`SessionHeader.tsx:108-178`) -- no terminal button
- No bottom tab bar for quick navigation between chat/files/terminal

---

## Implementation Plan

### Phase 1: Fix Terminal Connectivity

**Rationale**: This is a broken feature that should work. Fix it before any redesign work.

- [ ] 1.1 **Diagnose terminal connection failure**: Add console logging to `useTerminalSocket.ts` connect/error/disconnect events to capture the actual failure mode (auth rejection, missing CLI socket, namespace mismatch, session inactive). This is the single most important diagnostic step.

- [ ] 1.2 **Add terminal button to SessionHeader**: Currently `SessionHeader.tsx` has a files button (`SessionHeader.tsx:154-163`) but no terminal button. Add a terminal icon button next to the files button that navigates to `/sessions/$sessionId/terminal`. Only show it when `isRemoteTerminalSupported(session.metadata)` returns true and `session.active` is true.

- [ ] 1.3 **Improve terminal error reporting**: The terminal page (`terminal.tsx:405-409`) shows generic error messages. Enhance error display to differentiate between: CLI not connected, session inactive, auth failure, namespace mismatch. The hub's `terminal:error` event already sends a `message` string -- ensure the web surfaces it clearly.

- [ ] 1.4 **Add terminal reconnect button**: When terminal disconnects or errors, show a "Reconnect" button that resets `connectOnceRef` and calls `connect()` again, instead of requiring page reload.

- [ ] 1.5 **Verify `os` field propagation**: Confirm that `SessionSummaryMetadata` type includes `os` field so `isRemoteTerminalSupported` can work with summary data. If not, add `os` to `SessionSummaryMetadata` (`shared/src/sessionSummary.ts:3-10`) and the `toSessionSummary` mapping (`shared/src/sessionSummary.ts:28-35`).

### Phase 2: Session List Redesign

**Rationale**: The session list is the primary navigation surface. It needs to provide real overview at a glance.

- [ ] 2.1 **Add session status filter bar**: Add a horizontal filter bar above the session list with tabs/chips: "All", "Active", "Pending" (has pending permissions), "Inactive". Persist selection to localStorage. This replaces the current undifferentiated list.

- [ ] 2.2 **Redesign session grouping logic**: Replace the current `groupSessionsByDirectory` (`SessionList.tsx:33-81`) with a smarter grouping that:
  - Groups by project name (last meaningful path segment, not last-2)
  - Shows machine hostname as a badge, not as a grouping axis
  - Sorts groups: active-with-pending first, then active, then recently-active, then stale
  - Allows ungrouped "flat" view as an alternative

- [ ] 2.3 **Improve session item card design**: Redesign `SessionItem` (`SessionList.tsx:204-351`) to show:
  - Agent type icon (not just text) with color coding per agent
  - Summary text as subtitle (currently not shown in the list item)
  - Relative time as a subtle timestamp
  - Status indicator: green dot (active+idle), pulsing blue (thinking), amber (pending permission), gray (inactive)
  - Todo progress as a mini progress bar (not just numbers)
  - Model name as a small badge

- [ ] 2.4 **Add session search**: Add a search input at the top of the session list that filters sessions by name, summary text, path, and agent type. Use the existing fuzzy search pattern from `useSlashCommands`.

- [ ] 2.5 **Add swipe-to-reveal actions on session items**: Implement swipe-left on a session item to reveal quick actions: Archive (amber), Delete (red). Use a gesture library or implement with touch events + CSS transforms. Replace the current long-press context menu as the primary action trigger (keep long-press as fallback for desktop).

### Phase 3: Navigation & Gesture System

**Rationale**: Mobile-first PWA needs gesture-driven navigation to feel native.

- [ ] 3.1 **Install a gesture library**: Add `@use-gesture/react` (lightweight, React-native-like gesture handling). This provides pan, swipe, pinch recognizers without conflicting with scroll.

- [ ] 3.2 **Remove over-aggressive gesture blocking**: The current `App.tsx:84-98` blocks ALL gestures including pinch-to-zoom (which is fine for a PWA) but also blocks any custom swipe handling. Remove `gesturestart/change/end` listeners. Keep `overscroll-behavior: none` to prevent pull-to-refresh bouncing from the browser.

- [ ] 3.3 **Add swipe-back navigation from session detail**: When viewing a session chat, files, or terminal, allow swiping from the left edge to go back to the session list. Implement as a left-edge pan gesture that reveals the session list underneath with a parallax effect. Threshold: 40% of screen width or velocity > 500px/s.

- [ ] 3.4 **Add horizontal swipe between session detail tabs**: Within a session, allow horizontal swipe to navigate between Chat (default), Files, and Terminal views. Implement as a tab-based swipeable container. Show a subtle tab indicator at the top.

- [ ] 3.5 **Add pull-to-refresh on session list**: Implement pull-down gesture on the session list that triggers `refetch()`. Show a refresh indicator. Use the `@use-gesture/react` drag handler with a y-axis threshold.

- [ ] 3.6 **Add bottom tab bar for session detail**: Replace the current header-only navigation within a session. Add a bottom tab bar with 3 tabs: Chat, Files, Terminal. This provides always-visible navigation between session sub-views. The tab bar should respect `env(safe-area-inset-bottom)`.

### Phase 4: Dashboard & Overview

**Rationale**: Users need a high-level overview of what's happening across all sessions.

- [ ] 4.1 **Add dashboard summary header to session list**: At the top of the sessions page, add a compact dashboard strip showing:
  - Active sessions count (with green indicator)
  - Pending permissions count (with amber badge, tappable to filter)
  - Connected machines count
  - Total thinking sessions (with pulsing indicator)
  This replaces the current minimal "X sessions, Y projects" text.

- [ ] 4.2 **Add activity indicator to session groups**: Show a small activity indicator on collapsed groups: e.g. "2 active, 1 pending" so users can see status without expanding.

- [ ] 4.3 **Add notification badge for pending permissions**: On the session list, add a floating badge or banner when any session has pending permission requests. Tapping it should jump to the first session with a pending request.

- [ ] 4.4 **Improve machine status visibility**: Currently machines are only shown as a label inside group headers. Add a machines panel (accessible from settings or a header icon) showing all connected machines with their hostname, OS, connection status, and session count.

### Phase 5: Visual Polish & Transitions

**Rationale**: The app needs to feel smooth and intentional, not just functional.

- [ ] 5.1 **Add view transitions**: Use CSS `view-transition-api` or `framer-motion` for page transitions: slide-left when navigating deeper (list -> session), slide-right when going back. Fall back to instant transitions on browsers without support.

- [ ] 5.2 **Redesign session list group headers**: Current group headers (`SessionList.tsx:454-480`) are bland. Redesign with:
  - Project icon or first-letter avatar
  - Cleaner typography hierarchy
  - Subtle left-border color based on group activity status
  - Smoother collapse/expand animation (currently instant)

- [ ] 5.3 **Improve dark mode consistency**: The current dark mode (`index.css:49-90`) uses iOS-inspired colors but some components use hardcoded colors (e.g. `#007AFF` in `SessionList.tsx:243,268`). Audit all hardcoded colors and replace with CSS custom properties.

- [ ] 5.4 **Add loading skeletons**: Replace current `LoadingState` spinners with content-shaped skeleton placeholders for: session list items, chat messages, file tree. This reduces perceived loading time.

- [ ] 5.5 **Improve typography scale**: The current type scale is flat (mostly `text-xs` and `text-sm` with `text-base` for titles). Establish a clearer hierarchy: page titles, section headers, body text, captions. Respect the existing `--app-font-scale` system.

---

## Verification Criteria

- Terminal connects successfully when session is active and CLI is connected
- Terminal shows clear error when CLI is disconnected or session is inactive
- Session list shows filterable, searchable sessions with clear status indicators
- Swipe-left on session item reveals archive/delete actions
- Swipe from left edge navigates back to session list
- Horizontal swipe navigates between chat/files/terminal in session detail
- Pull-to-refresh works on session list
- Dashboard header shows aggregate session/machine status
- All transitions are smooth (no flicker, no layout shift)
- Dark mode has no hardcoded color leaks
- All changes work on iOS Safari PWA, Android Chrome PWA, and desktop browsers

## Potential Risks and Mitigations

1. **Gesture conflicts with scroll**
   Mitigation: Use `@use-gesture/react` which handles scroll vs swipe discrimination. Only activate edge-swipe in a narrow hitbox (20px from left edge). Horizontal swipe should only activate when horizontal delta > vertical delta.

2. **Performance regression from animations**
   Mitigation: Use CSS transforms and opacity only (GPU-composited properties). Avoid animating layout properties. Use `will-change` sparingly. Test on low-end Android devices.

3. **assistant-ui integration breakage**
   Mitigation: The chat view uses `@assistant-ui/react` heavily. Keep the `SessionChat` component's internal structure unchanged in Phase 1-2. Only wrap it in gesture/transition containers in Phase 3+.

4. **Breaking Telegram mini-app compatibility**
   Mitigation: The app has extensive Telegram-specific code paths (`isTelegramApp()` checks, BackButton integration, initData auth). Gate all new gesture handlers behind `!isTelegramApp()` to avoid conflicts with Telegram's own gesture handling.

5. **Terminal Socket.IO auth token expiry**
   Mitigation: The terminal socket uses the same JWT as the REST API. If the token expires during a terminal session, the socket will disconnect. Wire the `useAuth` token refresh into the terminal socket's `auth` object (already partially done at `useTerminalSocket.ts:62-79`).

## Alternative Approaches

1. **React Native / Capacitor instead of PWA redesign**: Would give truly native gesture handling and performance, but doubles the codebase and breaks the current single-deployment model. Not recommended given the project's "local-first, pragmatic" philosophy.

2. **Use a UI framework (e.g. Ionic, Framework7) for mobile gestures**: These provide swipe-back, tab bars, and transitions out of the box, but they impose their own design system and would conflict with the existing Tailwind + Radix setup. Too heavy.

3. **Incremental approach (fix terminal first, then iterate)**: Lower risk but slower visible improvement. The plan above is already structured in phases that can be executed incrementally.

## Dependency Map

```
Phase 1 (Terminal)     -- independent, do first
Phase 2 (Session List) -- independent of Phase 1
Phase 3 (Gestures)     -- depends on Phase 2 (swipe actions on session items)
Phase 4 (Dashboard)    -- depends on Phase 2 (filter bar, group redesign)
Phase 5 (Polish)       -- depends on all previous phases
```

## Key Files to Modify

| File | Phases | Changes |
|---|---|---|
| `web/src/hooks/useTerminalSocket.ts` | 1 | Logging, reconnect, error handling |
| `web/src/routes/sessions/terminal.tsx` | 1 | Error UI, reconnect button |
| `web/src/components/SessionHeader.tsx` | 1, 3 | Terminal button, bottom tab bar |
| `web/src/utils/terminalSupport.ts` | 1 | Type fix for os field |
| `shared/src/sessionSummary.ts` | 1 | Add os to summary type |
| `web/src/components/SessionList.tsx` | 2, 5 | Full redesign |
| `web/src/router.tsx` | 2, 3, 4 | Filter state, tab navigation, dashboard |
| `web/src/App.tsx` | 3 | Remove gesture blocking |
| `web/src/index.css` | 3, 5 | Gesture support, transitions, dark mode |
| `web/package.json` | 3 | Add @use-gesture/react |
