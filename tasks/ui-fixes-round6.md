# UI Fixes — Round 6 + Strava Submission Prep

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages. Final polish round before Strava marketplace submission.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after every fix**: `npx tsc --noEmit`
**Commit after each numbered fix.**

---

## Fix 1: "Since Start" Date Picker — Broken

**File**: `app/src/components/TrendChart.tsx`

- [ ] The "Since start" dropdown is completely non-functional — clicking does nothing
- [ ] Investigate: missing click handler, overlay blocking clicks, broken dropdown component
- [ ] Fix so clicking shows options (Since start, Last 4 weeks, Last 8 weeks, etc.)
- [ ] Add `cursor-pointer` to the dropdown element
- [ ] Verify the selected option filters the chart data correctly

---

## Fix 2: Remove Coach Card + Upgrade to Coaching

**Files**: `app/src/components/CoachCard.tsx`, `app/src/components/Dashboard.tsx`, header component

- [ ] Remove the coach card component from the dashboard completely — not gated, not teaser, just gone
- [ ] Remove the "Unlock AI Coaching" upsell card
- [ ] Remove any coaching-related API calls from the dashboard (GET /api/coaching/latest, etc.)
- [ ] The space where the coach card was should close up — game card flows directly into metric cards
- [ ] Keep the CoachCard.tsx file in the codebase (don't delete it) — we'll bring it back when coaching is ready
- [ ] Remove "Upgrade to Coaching" from the header nav entirely
- [ ] Move "How it works" link to just left of the settings block in the header, match text size to settings text

---

## Fix 3: Chart — Colors, Legend, Toggles, Tooltip

**File**: `app/src/components/TrendChart.tsx`

### Heart icon replacement
- [ ] Replace the current heart symbol (❤️ / CSS heart) for HR data points with this custom SVG diamond-heart:
```svg
<svg width="7" height="6" viewBox="0 0 7 6" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6.36328 1.91406L4.44922 3.82715L4.44336 3.82129L3.17871 5.08594L1.91699 3.82422L1.91406 3.82715L0 1.91406L1.91406 0L3.1748 1.26074L3.17871 1.25781L3.18457 1.26367L4.44922 0L6.36328 1.91406Z" fill="#E94605"/>
</svg>
```
- [ ] Use this as the data point marker for HR on the chart (scale appropriately)

### Color: orange throughout
- [ ] Change the HR line, HR data points, and HR-related UI elements back to `#ff6900` (orange-500) — not the coral/salmon from last round
- [ ] Apply `#ff6900` consistently: HR line on chart, HR toggle pill icon, HR value in summary card, HR sparkline
- [ ] The custom SVG heart fill is `#E94605` — that's fine for the SVG itself, but all other HR color references should be `#ff6900`

### Legend cleanup
- [ ] Remove the "Ceiling" legend indicator (green dashes + "Ceiling" text) — ceiling line is self-evident on the chart
- [ ] Remove the two dashes before "Cad" label — cadence has no line-style icon on the graph, just show the text
- [ ] Remove the dot/circle icon before "Eff" — efficiency has no dot on the graph. When Eff is toggled on, use a **light purple** color for the label and any associated line/data
- [ ] Hide the "Avg" toggle pill entirely — keep Avg mode ON by default, just don't show it as a toggleable option

### Tooltip
- [ ] HR value in the tooltip (e.g., "HR: 133 bpm") should use the same `#ff6900` orange as the HR line on the chart

---

## Fix 4: Header Settings Block

**File**: header component (Dashboard.tsx or equivalent)

### Settings block redesign
- [ ] Replace the right chevron `>` with a **gear icon** (⚙️ or lucide `Settings` icon)
- [ ] Replace the word "Settings" with the **athlete's display name** from Strava API. If name not populated, fall back to "Settings"
- [ ] Change the MAF ceiling number (e.g., "131") color from orange to **green** — matching the ceiling color used everywhere else
- [ ] Add the athlete's **avatar image** (small circular, ~24-28px) from Strava API, positioned in the settings block

### Strava data integration
- [ ] Store `display_name` (first_name from Strava OAuth response) in settings KV
- [ ] Store `avatar_url` (profile or profile_medium from Strava athlete object) in settings KV
- [ ] Fetch and display in both the header settings block and the settings sidebar
- [ ] Settings sidebar: show avatar at top, display name in the NAME field (pre-populated, editable)

---

## Fix 5: "How It Works" Modal — Redesign

**File**: `app/src/components/RulesOfTheGame.tsx` (or equivalent modal component)

### Fix duplication
- [ ] Levels, Badges, and Streaks sections appearing twice — fix to render each once
- [ ] Check for double-rendering (component mounted twice, content array mapped twice, etc.)

### Levels — vertical stack
- [ ] Replace horizontal pill layout with a **vertical stack/list**:
```
1.  🔥  Spark
2.  👟  Go-Getter
3.  🤝  Commitment Maker
4.  🕯️  Steady Flame
5.  🏗️  Foundation Builder
6.  💚  Heartwise
7.  📈  Endurance Rising
8.  🦁  Lion Heart
9.  🐺  Heart Beast
10. 👑  Distance King
```
- [ ] Each level on its own row with emoji icon and name
- [ ] Highlight the user's current level (green text or subtle indicator)

### Badges section — show sample badges
- [ ] Below badges description, show a row of 6-8 example badge icons from BADGES array
- [ ] Mix of earned (full color) and unearned (dimmed)
- [ ] Use actual badge emojis: ✅ 🔥 👟 🎯 🔒 🧘 📉 ⭐

### Streaks section — show visual example
- [ ] Below streaks description, show an example streak visualization:
  - Row of 4-5 week blocks (like actual streak UI in game card)
  - 3 filled with checkmarks, 1 partially filled, 1 empty
  - Badge icon (e.g., 🔥 Two-Week Fire) positioned at week 2 block

### Image placeholders
- [ ] Add placeholder area above each section (Levels, Badges, Streaks) for future illustrations
- [ ] Subtle bordered rectangle with relevant emoji at larger size
- [ ] Suggested: Levels → large 🔥, Badges → row of trophy emojis, Streaks → calendar/flame emoji

### Remove sections
- [ ] Remove "Why it feels slow" section entirely
- [ ] Remove "The MAF Test" section entirely
- [ ] Keep only: intro ("You're building a fire"), Levels, Badges, Streaks, Your Next Step

---

## Fix 6: Game Card — Streak Text & Level Bar Animation

**File**: `app/src/components/GameCard.tsx`

### Remove "Next Step" text block below streak
- [ ] Remove the permanent text below the streak card (e.g., "2 minutes to go this week / One more run keeps your 2-week streak alive")
- [ ] Move this messaging into the **badge-style alert/notification system** — triggered contextually, not displayed permanently
- [ ] The "88/90 min · 2 min to go" text under the streak blocks already covers weekly progress

### Level progress bar — animated pattern
- [ ] After the green level progress bar fills, add a **continuously animated diagonal stripe pattern** inside the filled portion
- [ ] Diagonal lines scroll right-to-left perpetually (barbershop pole / breathing effect)
- [ ] CSS-only: repeating linear gradient with `background-size` and `@keyframes` shifting `background-position`
- [ ] Subtle — thin semi-transparent lighter stripes over the green gradient, not jarring

---

## Fix 7: Add Email Collection

**Files**: `app/src/components/OnboardingSetup.tsx`, `app/src/components/SettingsSidebar.tsx`, `worker/src/index.ts`

### Onboarding
- [ ] Add **email field** below Units, above MAF ceiling display
- [ ] Label: "EMAIL" · Subtitle: "For account recovery and occasional training tips"
- [ ] Input type: email, not required
- [ ] Save with rest of settings on PUT /api/settings

### Settings sidebar
- [ ] Add same email field, populate from saved settings

### Worker
- [ ] Accept `email` field in PUT /api/settings
- [ ] Store in settings KV alongside name, age, modifier, units, start_date

---

## Fix 8: Onboarding Flow Adjustments

**Files**: `app/src/components/OnboardingSetup.tsx`, `app/src/components/BackfillProgress.tsx`, `app/src/components/BadgeCelebration.tsx`, `app/src/components/TrainingStartDate.tsx`

### Badge celebration timing
- [ ] Move "Committed" badge celebration to **after backfill completes** (or after start date selection if no backfill)
- [ ] Show Committed first, then any additional badges earned from backfill as batch celebration
- [ ] Flow: Setup → Start Date → Backfill → Badge Celebrations → Dashboard

### Start date screen
- [ ] Remove "One more thing" language — natural sequential step
- [ ] Heading: "When did you start MAF training?" without preamble

### Backfill screen
- [ ] Indicate data is from **Strava**: "Analyzing your runs from Strava..."
- [ ] Show **live run count** as runs process: "Analyzing run 8 of 12..." or "12 runs found · Processing..."
- [ ] Match counting style from dashboard's activity sync

---

## Fix 9: Color Tokenization (Roadmap)

### Current state assessment
- [ ] Audit how colors are defined — Tailwind config, CSS variables, hardcoded hex, or mix
- [ ] Document current color usage

### Recommendation (implement if quick, roadmap if not)
- [ ] Define all brand colors as CSS custom properties:
```css
:root {
  --color-brand-orange: #ff6900;
  --color-brand-green: #22c55e;
  --color-ceiling-green: #22c55e;
  --color-hr-orange: #ff6900;
  --color-pace-white: #e0e0e0;
  --color-eff-purple: #a78bfa;
  --color-bg-dark: #0f172a;
  --color-card-bg: #1e293b;
}
```
- [ ] Reference variables throughout instead of hardcoded hex
- [ ] Enables future co-branding/sponsor theming by swapping CSS file or injecting overrides
- [ ] If big refactor, note for post-submission — just ensure `#ff6900` is consistent for now

---

## Execution Order

1. **Fix 2** — remove coach card + upgrade button (biggest visual cleanup)
2. **Fix 3** — chart colors, legend, toggles, tooltip, heart SVG
3. **Fix 4** — header settings block (gear icon, name, avatar, green ceiling)
4. **Fix 6** — game card streak text removal + level bar animation
5. **Fix 5** — How It Works modal redesign + dedup
6. **Fix 1** — date picker functional fix
7. **Fix 8** — onboarding flow adjustments
8. **Fix 7** — email collection
9. **Fix 9** — color tokenization (if time, otherwise roadmap)

---

## Strava Submission Checklist

### Pre-Submission Polish

- [ ] All Round 5 + Round 6 fixes applied and committed
- [ ] Onboarding flow: Landing → OAuth → Setup → Start Date → Backfill → Badge Celebrations → Dashboard
- [ ] Game mechanics: badges backfill, streak segments, celebrations fire
- [ ] No coach card or "Upgrade to Coaching" anywhere in UI
- [ ] Settings sidebar populates correctly with name, avatar, age, email
- [ ] "How it Works" modal: no duplicates, vertical levels, badge/streak examples
- [ ] Chart: date picker works, HR orange (#ff6900), custom diamond-heart SVG, legend cleaned up
- [ ] Strava display_name and avatar_url integrated in header + settings
- [ ] Mobile responsive at 375px+
- [ ] No TypeScript errors, no console errors

### Strava API Compliance

- [ ] OAuth authorization code flow correct
- [ ] Token refresh works
- [ ] Webhook responds to validation challenge (GET with hub.challenge)
- [ ] Webhook processes create/update/delete events
- [ ] "Powered by Strava" or Strava logo per brand guidelines
- [ ] "View on Strava" link for each activity
- [ ] Data caching within permitted limits
- [ ] Deauthorization webhook handled
- [ ] Rate limiting respected (100 req/15 min, 1000 req/day)

### Strava App Listing

- [ ] App name: "MAF Machine"
- [ ] Description: MAF training + gamification pitch
- [ ] Icon: fire emoji or designed logo
- [ ] Category: Training / Analysis
- [ ] Callback domain: maf.marliin.com
- [ ] Webhook URL: https://maf.marliin.com/api/webhook

### Deployment

- [ ] Deploy v2 to maf.marliin.com
- [ ] Verify OAuth flow on production URL
- [ ] Verify webhook receives events on production
- [ ] All secrets set on production worker
- [ ] KV namespaces bound correctly
- [ ] DNS resolves and proxied through Cloudflare

### Post-Submission

- [ ] Monitor Strava developer dashboard
- [ ] No breaking changes during review
- [ ] Post-approval: activate organic acquisition through Strava app directory
