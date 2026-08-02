# Trade Tracker — UI Redesign Roadmap

> Goal: kill the "boxy" feel, replace the overflowing top tab strip with a real sidebar,
> and land on one consistent design system across all 13 pages.
> Every phase must leave the app shippable. Commit + push after each.

Status legend: ☐ not started · ◐ in progress · ☑ done

---

## Phase 0 — Foundation: tokens, Tailwind config, typography  ☑

Nothing visual ships. Everything after depends on it.

**Problem:** colours are hard-coded utility classes (`bg-dark-card` ×113,
`border-dark-border` ×310, plus ad-hoc `bg-red-900/20 border-red-800/30`), which is why
consistency drifts page to page.

- [x] Token layer in `tailwind.config.js` + `:root` in `index.css`
  - surfaces: `canvas` `#0B0B0D`, `surface` `#131316`, `surface-raised` `#17171B`,
    `surface-overlay` `#1C1C21`, `surface-hover`
  - lines: `line-subtle` / `line` / `line-strong` (all white-alpha, not solid grey)
  - text: `content-primary` / `content-secondary` / `content-muted` (all ≥ 4.5:1 on canvas)
  - one brand accent + semantic `profit` / `loss` / `warn`
- [x] Radius scale — `card: 16px`, `control: 10px`, `chip: 8px`
- [x] Two soft elevation shadows — `elev-1`, `elev-2`
- [x] Inter (self-hostable) replacing the system stack; `tabular-nums` on all figures
- [x] Keep `dark-*` aliases pointing at the new values so nothing breaks mid-migration

**Acceptance:** app looks near-identical but softer; grep for raw hex returns ~nothing new.

---

## Phase 1 — Sidebar navigation  ☑

Biggest single win, and self-contained.

- [x] `<Sidebar>` — 240px expanded / 64px icon rail, collapse persisted to localStorage
- [x] Groups: **Overview** (Dashboard, Analytics, Weekly, Monthly) · **Trading** (Chart
      Patterns, Strategies, Trade Journal) · **Reflection** (Mindset, Notebook) ·
      **Market** (News, Whales) · **System** (Alarms, Settings)
- [x] Active state = filled pill + 3px left accent bar (replaces the underline)
- [x] Wordmark top, user/sign-out pinned to the footer
- [x] Below `lg`: overlay drawer + hamburger
- [x] Slim contextual top bar: page title + primary action for that page
- [x] Keyboard shortcuts: `g` then letter, `1`–`9`, `[` to toggle collapse

**Acceptance:** Alarms and Settings reachable with no horizontal scroll; the native
light-grey scrollbar under the tabs is gone; nothing is more than one click away.

---

## Phase 2 — Page shell and layout consistency  ☑

Three different shells are in use today:
- bordered title card @ ~1215px — Dashboard, Analytics, Weekly, Monthly, Mindset, News, Whales
- bare `<h1>` @ near-full width — Chart Patterns, Strategies, Journal, Notebook
- narrow 650px centred column — Alarms, Settings

- [x] One `<Page title description actions>` — max-w 1280px, 32px gutters, unwrapped header
- [x] Convert all 13 pages; delete the bordered title cards
- [x] Widen Alarms and Settings out of the 650px column
- [x] Settings → two-column with left sub-nav (Account, Funding, Goals, Risk Rules)

Mostly deletion. Quick, and feels disproportionately good.

---

## Phase 3 — De-boxing: the surface system  ☑

- [x] `<Card>` — raised bg, soft shadow, **no border**
- [x] `<Panel>` — inner fill, no border
- [x] `<StatTile>` — borderless: label, large tabular number, optional delta chip
- [ ] **Rule: never nest a bordered surface inside another bordered surface.** Where a page
      card wraps a section card wrapping stat tiles, the outer wrapper disappears — the
      section header sits directly on the canvas.
- [x] Borders retained only for interactive/stateful elements
- [x] Fix the Analytics stat grid — 7 tiles currently orphan one on row 2; go 4-col with
      the primary metric spanning two cells
- [x] Migrate all ~680 legacy `dark-*` / raw-palette classes onto the token scale and
      delete the aliases from `tailwind.config.js`
- [x] Narrow the accent palette: blue → `brand`, greys → `content`, green/red/yellow →
      `profit`/`loss`/`warn`, plus a `caution` rung so the A–F grade scale keeps 5 steps
- [x] Lift `text-gray-500/600/700` (2.3–3.9:1 on the new canvas) to `content-muted` (5.8:1)

**Deferred to phase 4:** 19 solid button fills (`bg-red-600`, `bg-green-600`, …) still sit
under white text. Moving them to the lighter semantic tokens would drop contrast below
4.5:1, so they wait for the button-variant pass.

---

## Phase 4 — Controls, forms, Add Trade modal  ☑

- [x] Themed `<Select>` replacing every native `<select>` (RecentTrades ×2, TradeModal,
      ChartPatterns ×4, Notebook ×2, Strategies, TradeJournal ×2, TradingMindset ×3)
- [x] Themed `<DateField>` replacing `input[type=date]` (TradeModal, Settings ×2, TradeJournal)
- [x] **Add Trade modal:** header with title + X · Escape and backdrop dismissal ·
      `max-h-[85vh]` with internal scroll · sticky footer so Cancel/Save are always visible
- [x] Button system: primary / secondary / ghost / destructive
- [x] Chips: outline default, filled when selected — fixes the Alarms day toggles that
      currently render all seven days in solid blue as if pre-selected
- [x] Popovers portal to `<body>` — an absolutely-positioned dropdown was clipped by the
      modal body and any scrolling panel
- [x] Escape-to-close on the other five modals via `useDismissable`, plus backdrop
      dismissal on the three that lacked it
- [x] Resolve the solid button fills deferred from phase 3 — selected toggles take the
      semantic token with canvas-dark text (7.7–11:1), destructive actions take the
      tinted treatment

**Still on the old markup:** the five non-TradeModal form dialogs dismiss correctly now
but are not yet built on `<Modal>`, so they lack the sticky footer. Strategies' entry form
is the one that most wants it.

---

## Phase 5 — Data visualisation  ☑

- [x] **Bug:** Analytics Avg Win vs Avg Loss renders both bars as slivers ($23.44 / $23.17
      against a $30 axis) — domain or barSize issue, fix before restyling
- [x] Shared chart theme: thin rounded-cap bars, flat/minimal gradient fills, 1px dashed
      low-opacity gridlines, no axis lines, muted ticks, consistent tooltips, entry animation
- [x] Tables: sticky header, taller rows, right-aligned tabular numbers, column-picker for
      Weekly's 11 columns
- [x] Monthly grade badges → soft tinted chips with a coloured left edge
- [x] Calendar view: higher-contrast day numbers, equal row heights, clearer per-cell P&L

---

## Phase 6 — Empty states, polish, motion  ☑

Chart Patterns, Strategies, Journal, Notebook and Whales are all empty right now, so these
screens *are* the first impression.

- [x] One `<EmptyState>` — outline icon, headline, one line of context, primary CTA, no box
- [x] Skeleton loaders matching the good ones already on News
- [x] Toasts for save/delete
- [x] Motion: 150–200ms hover/active, page fade, animated counters on headline P&L
- [x] Responsive pass at 390 / 768 / 1440
- [x] A11y pass: focus rings, and contrast on the muted greys (many are below 4.5:1)
- [x] `prefers-reduced-motion` honoured in CSS *and* in the JS count-up figures, which the
      media query cannot reach

---

## Done

All six phases are shipped. What is deliberately still open:

- The five non-TradeModal form dialogs dismiss on Escape and backdrop but are not built on
  `<Modal>`, so they have no sticky footer. Strategies' entry form wants it most.
- No visual verification has been done at any point — there is no browser in the build
  environment. Every phase was checked with a production build, an import audit and a
  compiled-CSS check only.

---

## Sequencing

Phases 0→2 back to back as one push — low risk, unblocks everything.
Phase 3 is where it starts looking genuinely different.
Phases 4 and 5 touch different components and can run in either order.
Phase 6 is the layer you keep returning to.
