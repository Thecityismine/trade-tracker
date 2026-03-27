# BTC Trade Tracker — Sprint Backlog

> Organized by priority. Tackle one item at a time, commit + push after each.

---

## Sprint 1 — Bug Fixes & Quick Polish

### 1.1 Fix extreme % for weeks/months before first deposit
**Problem:** Weeks before deposit show 953%+ gains because balance at that point was near $0.
**Fix:** If `denominator <= 0` AND no deposits exist before the period start date, show `--` instead of a percentage.
**Files:** `WeeklyTracker.jsx`, `MonthlyTracker.jsx`

### 1.2 Fix 5th card orphan on mobile (Max Drawdown)
**Problem:** `grid-cols-2` with 5 metric cards leaves Max Drawdown alone on its own row.
**Fix:** Use `grid-cols-2 lg:grid-cols-5` with a CSS trick to center the last odd card, or reorder cards to put Max Drawdown in a natural position.
**Files:** `Dashboard.jsx`, `Analytics.jsx`

### 1.3 Fix Average Win/Loss chart appearing blank in Analytics
**Problem:** Bar chart for Avg Win/Avg Loss sometimes renders empty despite trade data existing.
**Fix:** Investigate dataKey values and ensure chart receives correct data shape.
**Files:** `Analytics.jsx`

### 1.4 Default Recent Trades list to "This Week" instead of "Today"
**Problem:** "Today" filter shows nothing most of the time.
**Fix:** Change default `filterPeriod` state from `'today'` to `'week'`.
**Files:** `Dashboard.jsx`

### 1.5 Equity Curve tooltip — add ticker + direction
**Problem:** Tooltip only shows date and P&L.
**Fix:** Add ticker symbol and trade direction (Long/Short) to the tooltip.
**Files:** `EquityCurve.jsx`

---

## Sprint 2 — Design Upgrade

### 2.1 Muted colors for context metrics
**Problem:** All numbers are bright green/red, making it hard to focus on what matters.
**Fix:** Use muted red (`text-red-400`) and muted green (`text-green-400`) for secondary metrics. Reserve full saturation for primary P&L values.
**Files:** Global across all pages.

### 2.2 Glass-effect metric cards
**Problem:** Cards look flat.
**Fix:** Add subtle `backdrop-blur`, soft border (`border-white/10`), and slight inner glow using `shadow-inner`.
**Files:** Shared MetricCard component or Dashboard.jsx.

### 2.3 Gradient equity curve
**Problem:** Chart line is plain blue.
**Fix:** Replace solid line with a gradient stroke and add an `Area` fill below the line using a gradient from blue to transparent.
**Files:** `EquityCurve.jsx`

### 2.4 Number animations on dashboard load
**Problem:** Numbers appear instantly with no visual feedback.
**Fix:** Use a simple count-up animation (e.g., `react-countup`) on key dashboard metrics (Total P&L, Win Rate, Max Drawdown).
**Files:** `Dashboard.jsx`

### 2.5 Softer layout — dark gray gradients
**Problem:** Background is flat black.
**Fix:** Apply subtle gradient backgrounds (`from-[#0f0f0f] to-[#1a1a1a]`) on main page wrapper and card containers.
**Files:** `tailwind.config.js`, main layout wrapper.

---

## Sprint 3 — Analytics Improvements

### 3.1 Add "So what?" insight text to Analytics
**Problem:** Charts show data but no actionable takeaway.
**Fix:** Below each chart, auto-generate a one-line insight:
- Time of Day: "You perform best in the morning (+$X avg)"
- Win Rate: "Your win rate improves on [Day]"
- Chart Patterns: "Bull Flag is your most profitable pattern"
**Files:** `Analytics.jsx`

### 3.2 Add missing KPIs: Avg Hold Time + Trade Frequency
**Problem:** App doesn't track how long trades are held or how often user trades.
**Fix:**
- Avg Hold Time = average of `(exitDate - entryDate)` in minutes/hours (requires storing exitDate in TradeModal)
- Trade Frequency = trades per day over last 30 days
**Files:** `TradeModal.jsx` (add exitDate field), `Analytics.jsx`

### 3.3 Link Chart Patterns to trade win rate
**Problem:** Chart patterns are saved per trade but not analyzed for win rate.
**Fix:** Add a "Pattern Performance" section in Analytics showing win rate, avg P&L, and count per pattern.
**Files:** `Analytics.jsx`

### 3.4 Weekly/Monthly pattern detection
**Problem:** No behavioral pattern detection.
**Fix:** Flag patterns like:
- "You tend to lose after 3 consecutive wins"
- "Friday is your worst trading day"
- "You overtrade on weeks with a losing Monday"
Display as a callout section in Analytics or WeeklyTracker.
**Files:** `Analytics.jsx` or `WeeklyTracker.jsx`

### 3.5 Grade explanations in Monthly Tracker
**Problem:** Grade badge (A/B/C/D/F) gives no context on why.
**Fix:** Add tooltip or expandable row showing:
> "Grade C: Positive P&L but low profit factor (1.2) and expectancy below 5%"
**Files:** `MonthlyTracker.jsx`

---

## Sprint 4 — Trade Journal & Notebook Upgrades

### 4.1 Recurring Mistakes detection in Notebook
**Problem:** Notebook shows notes but doesn't surface repeated mistakes.
**Fix:** Parse notes for common mistake tags (e.g., FOMO, early exit, oversize), count occurrences, and show a "Top Mistakes" summary at the top.
**Files:** `Notebook.jsx` or new `MistakeEngine.jsx` component.

### 4.2 Journal structure enforcement
**Problem:** Journal entries are free-text with no structure.
**Fix:** Add optional structured fields to journal entries:
- Mistake tag (dropdown: FOMO, Oversize, Early Exit, Revenge, No Setup, Other)
- Mindset rating (1–5)
- Rule broken (free text)
**Files:** `Notebook.jsx`, journal entry form.

### 4.3 Execution score breakdown
**Problem:** No way to rate trade quality.
**Fix:** Add an Execution Score to each trade (1–10) with sub-scores for:
- Entry timing
- Risk control
- Exit execution
Display average execution score in Analytics.
**Files:** `TradeModal.jsx`, `Analytics.jsx`

### 4.4 Notebook as playbooks
**Problem:** Notes are unstructured.
**Fix:** Allow pinning a note as a "Playbook" (e.g., "My Bull Flag Setup"). Pin appears on dashboard and links to trades with that pattern.
**Files:** `Notebook.jsx`, `Dashboard.jsx`

---

## Sprint 5 — AI Features

### 5.1 AI Trading Coach — Daily Summary
**Problem:** No AI feedback on performance.
**Fix:** Add a "Coach" section that generates a daily summary using trade data:
- "You took 3 trades today. 2 wins, 1 loss. Your avg R:R was 1.8R. Win rate: 67%."
- Call Anthropic/OpenAI API with structured trade data as context.
**Files:** New `AICoach.jsx` component, `Dashboard.jsx`

### 5.2 AI Weekly Feedback
**Problem:** No weekly behavioral review.
**Fix:** At the end of each week, generate a narrative like:
- "This week you traded 8 times. You performed best on Tuesday mornings. You lost 2 trades after taking profits on a 3rd — possible overconfidence pattern."
**Files:** `WeeklyTracker.jsx` or `AICoach.jsx`

### 5.3 Mistake Engine — Rank by P&L impact
**Problem:** No way to know which mistake costs the most money.
**Fix:** Analyze all trades tagged with mistake labels. Show ranked list:
1. FOMO entries — avg loss $47.20 (8 occurrences)
2. Early exits — avg missed gain $31.00 (5 occurrences)
**Files:** New `MistakeEngine.jsx`, `Analytics.jsx`

### 5.4 Performance Identity
**Problem:** No summary of trading style.
**Fix:** Auto-generate a "Performance Identity" label based on data:
- "You are a morning momentum trader with a 68% win rate, best on BTC between 9–11 AM."
Display as a hero stat or card on Dashboard.
**Files:** `Dashboard.jsx`, `Analytics.jsx`

### 5.5 Mindset weekly psychology report
**Problem:** Mindset data is not surfaced.
**Fix:** Aggregate mindset ratings from journal entries. Show weekly trend chart and flag weeks where low mindset correlates with losses.
**Files:** `WeeklyTracker.jsx`, `Notebook.jsx`

---

## Sprint 6 — Settings & Account Management

### 6.1 Equity growth goal
**Problem:** No account growth target.
**Fix:** Add a "Goal" field in Settings (e.g., "Grow account to $1,000 by Dec 2026"). Show progress bar on Dashboard.
**Files:** `Settings.jsx`, `Dashboard.jsx`

### 6.2 Risk settings — max % risk per trade
**Problem:** No risk guardrails.
**Fix:** Add "Max Risk Per Trade %" setting. Flag trades in the trade list where risk exceeded the threshold.
**Files:** `Settings.jsx`, trade list in `Dashboard.jsx`

### 6.3 Equity growth chart in Settings
**Problem:** Settings only manages deposits, no visual.
**Fix:** Add a mini equity curve chart in Settings showing account growth since first deposit.
**Files:** `Settings.jsx`

### 6.4 Quick narrative banner on Dashboard
**Problem:** Dashboard opens to raw numbers with no context.
**Fix:** Add a 1-line banner at the top of Dashboard:
> "This week: +3.2% | Best day: Tuesday | Streak: 2 wins"
**Files:** `Dashboard.jsx`

---

## Sprint 7 — Mobile & UX Polish

### 7.1 Dashboard hero layout
**Problem:** Total P&L and Equity Curve are equal weight to everything else.
**Fix:** Make Total P&L the dominant visual element (larger font, more padding). Make Equity Curve take the full width on desktop, 2/3 width beside the metric cards on large screens.
**Files:** `Dashboard.jsx`, `EquityCurve.jsx`

### 7.2 Micro interactions
**Problem:** App feels static.
**Fix:**
- Hover state lift on metric cards (`hover:-translate-y-0.5 transition-transform`)
- Fade-in on page load (`opacity-0 → opacity-100 transition-opacity`)
- Button press scale (`active:scale-95`)
**Files:** Global, shared components.

### 7.3 Mobile nav improvement
**Problem:** Bottom nav tabs are small and cramped on mobile.
**Fix:** Increase tap target size, add active indicator dot, consider hiding label text and showing only icons on smallest screens.
**Files:** `App.jsx` or nav component.

### 7.4 Trade list empty states
**Problem:** Empty states are plain gray text.
**Fix:** Add illustrated empty states with a CTA button:
> [Chart icon] "No trades this week. Add your first trade to get started." [+ Add Trade button]
**Files:** `Dashboard.jsx`, `WeeklyTracker.jsx`

---

_Last updated: 2026-03-27_
