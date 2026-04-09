# PWA Layout Redesign -- iOS 26 Liquid Glass / Obsidian-Inspired

## Objective

Redesign the HAPI PWA layout to feel like a native iOS 26 app with Obsidian-level navigation UX. Translucent bars, fast animations, minimal chrome, maximum content density, and smooth gesture-driven navigation.

---

## Current Architecture

### Route Tree
```
/ -> redirect to /sessions
/sessions -> SessionsPage (master-detail split)
  /sessions/ -> SessionsIndexPage (empty, list only)
  /sessions/new -> NewSessionPage
  /sessions/$id -> SessionDetailRoute (wraps tab bar)
    /sessions/$id/ -> SessionPage (chat)
    /sessions/$id/files -> FilesPage
    /sessions/$id/file -> FilePage (single file view)
    /sessions/$id/terminal -> TerminalPage
/settings -> SettingsPage
```

### Key Layout Files
| File | Role | Lines |
|------|------|-------|
| `App.tsx` | Shell: banners + Outlet | 362 |
| `router.tsx` | Route defs, SessionsPage master-detail, SessionDetailRoute, swipe-back | 684 |
| `index.css` | CSS variables, animations, scroll, markdown, skeleton | 342 |
| `SessionList.tsx` | Session list with filter bar, search, groups, swipe | 939 |
| `SessionChat.tsx` | Chat view: header + thread + composer | 415 |
| `SessionHeader.tsx` | Session detail header bar | 258 |
| `SessionTabBar.tsx` | Bottom tab bar (Chat/Files/Terminal) | 123 |

### Current Z-Stack (top to bottom)
```
z-50: SyncingBanner / ReconnectingBanner / OfflineBanner (fixed top)
z-50: ToastContainer (fixed top-right)
z-50: InstallPrompt (fixed bottom)
z-50: SwipeBackIndicator (fixed, full-screen pointer-events-none)
z-10: Group headers (sticky top within scroll)
z-[1]: Session item foreground (swipe layer)
---: Everything else at default z
```

---

## Target Layout (iOS 26 / Obsidian Hybrid)

### Design Principles
1. **Translucent bars** -- headers, tab bar, group headers use `backdrop-filter: blur(20px)` with semi-transparent backgrounds
2. **Faster transitions** -- all animations 150ms or faster (currently 200-300ms)
3. **Minimal chrome** -- remove heavy borders, use whitespace as dividers, reduce visual noise
4. **44px touch targets** -- all interactive elements minimum 44px hit area
5. **Content-first** -- bars feel like they float over content, not block it
6. **Horizontal navigation** -- slide transitions between views (not hard cuts)

### Target Mobile Layout -- Sessions List

```
+---------------------------------------------------+
| [safe-area-inset-top]                              |
+---------------------------------------------------+  <-- TRANSLUCENT HEADER
| Sessions               [gear]  [+]                |  backdrop-blur(20px)
| 3 active * 1 thinking * 2 pending                 |  bg: rgba(bg, 0.72)
+---------------------------------------------------+
| [All] [Active] [Pending] [Inactive]               |  <-- TRANSLUCENT filter
|                                                    |  backdrop-blur same
| [Search sessions...]                               |
+---------------------------------------------------+
|                                                    |
| > project-name                            (3)     |  <-- LIGHTWEIGHT group
|   machine-label | /full/path                       |  no bg, just text
|                                                    |
|   [claude] Session title               2m ago     |  <-- MINIMAL card
|   Summary text here                                |  2 rows max
|                                                    |  gap-based dividers
|   [codex] Another session             15m ago     |  no border dividers
|                                                    |
| > another-project                         (1)     |
|   ...                                              |
|                                                    |
+---------------------------------------------------+
         (pull-to-refresh when overscrolling)
```

### Target Mobile Layout -- Session Detail (Chat)

```
+---------------------------------------------------+
| [safe-area-inset-top]                              |
+---------------------------------------------------+  <-- TRANSLUCENT HEADER
| [<] Session Title          [>_] [files] [...]     |  backdrop-blur(20px)
|     claude * sonnet * main                         |  bg: rgba(bg, 0.72)
+---------------------------------------------------+
|                                                    |
| (chat messages scroll under the header)            |  scroll-padding-top
|                                                    |  to account for
| User: fix the login bug                           |  translucent bar
|                                                    |
| Assistant: I'll fix that...                        |
|                                                    |
| [StatusBar + text input]               [Send]     |  <-- Composer
+---------------------------------------------------+  <-- TRANSLUCENT TAB BAR
| [Chat]       [Files]      [Terminal]              |  backdrop-blur(20px)
| [safe-area-inset-bottom]                           |  bg: rgba(bg, 0.72)
+---------------------------------------------------+
```

### Target Desktop Layout (>= 1024px)

```
+---------------------+--------------------------------------+
| SIDEBAR (fixed)     | MAIN CONTENT                         |
| w-[380px]           |                                      |
|                     | [translucent header]                 |
| [header + stats]    |                                      |
| [filter chips]      | Chat / Files / Terminal content      |
| [search]            |                                      |
| [session groups]    |                                      |
|                     |                                      |
| NO tab bar          | NO tab bar on desktop                |
| NO bottom inset     |                                      |
+---------------------+--------------------------------------+
```

---

## Implementation Plan

### Phase A: Translucent Bars (visual foundation)

- [ ] A1. **Add glass material CSS utility** in `index.css`
  - New `.glass-bar` class: `backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); background-color: rgba(var(--app-bg-rgb), 0.72);`
  - Add `--app-bg-rgb` variable (light: `255,255,255`, dark: `28,28,30`) so rgba can reference it
  - Rationale: single reusable class for all translucent surfaces

- [ ] A2. **Apply glass to SessionHeader** (`SessionHeader.tsx:132`)
  - Replace `bg-[var(--app-bg)]` with `glass-bar`
  - Make header `sticky top-0 z-30` so content scrolls under it
  - Add `border-b border-[var(--app-divider)]` (thin, subtle)
  - Rationale: header becomes translucent, content peeks through

- [ ] A3. **Apply glass to SessionTabBar** (`SessionTabBar.tsx:97`)
  - Replace `bg-[var(--app-bg)]` with `glass-bar`
  - Replace `border-t border-[var(--app-border)]` with `border-t border-[var(--app-divider)]`
  - Rationale: tab bar feels lighter, content bleeds under

- [ ] A4. **Apply glass to sessions list header** (`router.tsx:158`)
  - Replace `bg-[var(--app-bg)]` with `glass-bar sticky top-0 z-20`
  - Make the filter bar and search also glass with the same sticky behavior
  - Rationale: list header stays visible but content scrolls under it

- [ ] A5. **Apply glass to group headers** (`SessionList.tsx:885`)
  - Replace `bg-[var(--app-secondary-bg)]` with `glass-bar`
  - Rationale: groups feel lighter, less like opaque walls

- [ ] A6. **Adjust scroll containers** for content-under-bar behavior
  - `SessionChat.tsx`: add `scroll-padding-top` on the thread container equal to header height
  - `router.tsx` SessionsPage: similarly adjust the session list scroll area
  - Rationale: ensures content doesn't hide behind translucent bars when jumping to anchors

### Phase B: Minimal Chrome (reduce visual noise)

- [ ] B1. **Remove heavy borders from session items** (`SessionList.tsx:919`)
  - Replace `divide-y divide-[var(--app-divider)]` and `border-b border-[var(--app-divider)]` with `gap-0.5` or `gap-px` spacing
  - Remove `border-l border-l-[var(--app-divider)]` from session group inner
  - Rationale: whitespace is the divider (Obsidian pattern)

- [ ] B2. **Lighten group headers** (`SessionList.tsx:881-913`)
  - Remove `border-b border-[var(--app-border)]`
  - Remove the colored `border-l-[3px]` accent -- replace with a small colored dot before the group name
  - Make group header padding smaller: `py-2` -> `py-1.5`
  - Rationale: less visual weight, more content density

- [ ] B3. **Simplify session cards to 2 rows** (`SessionList.tsx:590-662`)
  - Row 1: agent badge (dot only, no text label) + title + time
  - Row 2: subtitle (summary or model) + inline pending badge + thinking indicator
  - Remove Row 3 (todo progress) and Row 4 (path/metadata chips) entirely from default view
  - Todo progress becomes a tiny colored dot on the agent badge
  - Rationale: Obsidian note list = clean 2 lines per item

- [ ] B4. **Increase touch targets to 44px** across header buttons
  - `SessionHeader.tsx`: back button, terminal, files, menu buttons currently `h-8 w-8` (32px) -> make `h-11 w-11` (44px)
  - `router.tsx`: settings and new session buttons also 44px
  - Tab bar buttons already 52px tall, OK
  - Rationale: iOS HIG minimum touch target

- [ ] B5. **Remove sidebar border on desktop** (`router.tsx:156`)
  - Replace `lg:border-r lg:border-[var(--app-divider)]` with a subtle `lg:shadow-[1px_0_0_var(--app-divider)]`
  - Or remove entirely and use background color difference
  - Rationale: borders feel heavy, a hairline shadow or color shift is subtler

- [ ] B6. **Clean up NewSessionPage header** (`router.tsx:521`)
  - Apply glass-bar to the new session header
  - Match the same style as SessionHeader
  - Rationale: consistent bar treatment across all routes

### Phase C: Fast Animations (speed + feel)

- [ ] C1. **Speed up all CSS transitions** globally in `index.css`
  - `transition-colors`: keep at 150ms (already fast)
  - `.session-group-content` collapse: reduce from 250ms to 150ms
  - `.animate-slide-up`: reduce from 300ms to 180ms
  - `.animate-menu-pop`: keep 180ms (already snappy)
  - Swipe transitions in SessionList: reduce from 250ms to 150ms
  - Rationale: iOS 26 beta sped up all system animations; faster = more responsive feel

- [ ] C2. **Add route transition animation** using `startViewTransition()`
  - In `router.tsx`, wrap navigation callbacks with `document.startViewTransition?.()` when available
  - Define CSS `::view-transition-old` and `::view-transition-new` rules for horizontal slide
  - Sessions list -> Session detail: slide left
  - Session detail -> Sessions list (back): slide right
  - Fallback: no animation for browsers without View Transitions API
  - Rationale: eliminates the hard-cut between views, feels native

- [ ] C3. **Speed up swipe-back gesture** (`useSwipeBack.ts`)
  - Reduce the snap-back transition from 200ms to 150ms
  - Rationale: matches global animation speed

### Phase D: Navigation Improvements

- [ ] D1. **Float the tab bar** (`SessionTabBar.tsx`)
  - Add `mx-3 mb-2 rounded-2xl` to the nav element (inside safe area padding)
  - Remove `border-t` entirely; the glass effect provides enough visual separation
  - Make glass-bar with higher blur: `blur(24px)` and slightly higher opacity `0.78`
  - Rationale: floating tab bar (like iOS 26 home bar area) feels modern

- [ ] D2. **Narrow the desktop sidebar** (`router.tsx:156`)
  - Change `lg:w-[420px] xl:w-[480px]` to `lg:w-[340px] xl:w-[380px]`
  - Rationale: smaller sidebar gives more space to the main content; Obsidian uses ~280-320px

- [ ] D3. **Add keyboard shortcut hints** (desktop only)
  - On desktop, show subtle hint text on session header: `Esc` to go back
  - Rationale: power users benefit from keyboard navigation

### Phase E: Dark Mode Polish

- [ ] E1. **Audit glass material in dark mode**
  - Dark mode glass needs slightly higher opacity (0.78 vs 0.72) for readability
  - Verify `--app-bg-rgb` dark value produces correct frosted effect
  - Test with actual content scrolling behind bars
  - Rationale: glass looks different on dark backgrounds; needs tuning

- [ ] E2. **Fix status banner colors** (`SyncingBanner.tsx:15`, `ReconnectingBanner.tsx:37`, `OfflineBanner.tsx:13`)
  - Apply glass material to banners instead of solid backgrounds
  - `SyncingBanner`: `glass-bar` + tinted border-bottom
  - `ReconnectingBanner`: `glass-bar` with amber tint
  - `OfflineBanner`: `glass-bar` with warning tint
  - Rationale: banners should match the translucent aesthetic

---

## Validation Gate (per change)

1. `bun run typecheck:web` -- must pass
2. `bun run test:web` -- 123/123 pass (0 failures)
3. `bun run build:web` -- must succeed
4. Manual visual check in browser for glass effect, dark mode, mobile layout

## Verification Criteria

- All bars (header, tab bar, group headers, banners) render with visible backdrop-blur effect
- Content scrolls visibly behind translucent bars
- Session cards are 2 rows, not 4
- All interactive elements >= 44px touch target
- Route transitions animate horizontally (in supporting browsers)
- All CSS transition durations <= 180ms (except collapse which is 150ms)
- No regressions: existing swipe, pull-to-refresh, search, filter all still work
- Desktop sidebar narrower; no hard border

## Potential Risks and Mitigations

1. **`backdrop-filter` performance on low-end devices**
   Mitigation: Use `@media (prefers-reduced-motion: reduce)` to disable blur and use solid fallback background. Also test on older iPhones.

2. **View Transitions API not supported in all browsers**
   Mitigation: Feature-detect `document.startViewTransition`; fallback to instant navigation. Safari 18+ and Chrome 111+ support it.

3. **Translucent headers hide content underneath**
   Mitigation: Use `scroll-padding-top` and `padding-top` on scroll containers to offset for bar height. Content remains accessible.

4. **Glass effect looks bad with certain wallpapers/backgrounds in dark mode**
   Mitigation: Higher opacity in dark mode (0.78) and add a subtle `border-b` to maintain visual separation even when blur contrast is low.

5. **Removing todo progress and metadata from session cards loses information**
   Mitigation: This info is still visible in the session detail view. The list is for scanning and selecting, not reading full metadata.

## Alternative Approaches

1. **Full drawer sidebar (Obsidian-style)**: Instead of the current master-detail split, use a slide-over drawer for the session list on mobile. More immersive but requires rethinking the navigation model.
2. **Mica/Acrylic instead of blur**: Use a noise texture overlay instead of backdrop-filter for consistent look regardless of content. Cheaper on GPU but less dynamic.
3. **No glass, just tighter spacing**: Skip translucency entirely and focus purely on spacing, typography, and animation speed. Simpler but less visually distinctive.
