# Mobile Responsive Fixes — Strava Submission

## Context

MAF Machine v2 Pro needs mobile responsive fixes before Strava developer submission. The app is a MAF (Maximum Aerobic Function) training dashboard built with React/Vite/Tailwind on Cloudflare Pages. The v2 frontend uses a ceiling model (MAF HR is a hard ceiling, not a symmetric zone).

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` (frontend) + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml` (API)
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Viewport target**: iPhone 14 Pro Max (430px) as baseline, but should work 375px+

## Priority 1 — Settings Sidebar (Submission Blockers)

### 1.1 X button doesn't close on mobile
- [ ] File: `app/src/components/SettingsSidebar.tsx` (or similar)
- [ ] The close button in the top-right corner doesn't respond to taps on mobile
- [ ] Likely a click handler, z-index, or touch target size issue
- [ ] Fix: ensure the onClick handler fires on touch, ensure the button has adequate tap target (min 44x44px), check z-index stacking

### 1.2 Save button stuck on "Saving..."
- [ ] The save button enters "Saving..." state but never completes
- [ ] Check the save handler — likely the API call (`PUT /api/settings`) is failing, timing out, or the `.then()`/`await` isn't resetting the button state
- [ ] Ensure the button state resets in both success AND error paths (finally block)
- [ ] Test: open settings, change age, hit save — button should say "Save" again within 1-2 seconds

### 1.3 "Strava Athlete" name field
- [ ] Currently shows "Strava Athlete" as static/placeholder text in a non-editable field
- [ ] Check if the Strava API returns the athlete's first_name/last_name (it does — it's in the OAuth response and /athlete endpoint)
- [ ] If athlete name is available from stored data: display it and make the field read-only with the real name
- [ ] If athlete name is NOT stored: make the NAME field an editable text input so the user can type their name
- [ ] Store the name in settings KV alongside age/modifier/units

## Priority 2 — Dashboard Layout (High Visibility)

### 2.1 Summary card text collision
- [ ] Files: `app/src/components/SummaryCards.tsx`
- [ ] On mobile (430px), the card title ("HEART RATE") and trend indicator ("↘ HR dropping") overlap/collide
- [ ] Fix: stack the trend indicator below the title on small screens, or reduce font size, or wrap to second line
- [ ] Apply same fix to all summary cards (MAF PACE + "Getting faster", etc.)

### 2.2 Run list table overflow
- [ ] File: `app/src/components/Dashboard.tsx` (run list section)
- [ ] Columns: DATE, RUNS, HR, ZONE, PACE, EF, Q, INC — too many for 430px
- [ ] Fix option A: wrap table in `overflow-x-auto` container for horizontal scroll
- [ ] Fix option B: hide EF and INC columns on mobile (`hidden sm:table-cell`)
- [ ] Prefer option B — less friction for the user, EF and INC are secondary data

### 2.3 Chart right-side labels clipped
- [ ] File: `app/src/components/TrendChart.tsx`
- [ ] The pace axis labels on the right side (11:54 /mi, 12:45 /mi, etc.) are being cut off at the viewport edge
- [ ] Fix: add right padding/margin to the chart container, or use Recharts `padding` prop on the YAxis, or reduce label font size on mobile

## Priority 3 — Polish

### 3.1 Coach card text wall
- [ ] File: `app/src/components/CoachCard.tsx`
- [ ] On mobile, the 3-4 paragraph assessment is a dense wall of text
- [ ] Fix: truncate after ~2 paragraphs with a "Read more" / "Show less" toggle
- [ ] Keep highlight (✦) and focus (→) lines always visible

### 3.2 Cadence/Efficiency orphan row
- [ ] Two cards sitting alone below the 3-card summary row
- [ ] Fix: either make all 5 cards a responsive grid (3 cols desktop, 2 cols mobile with the 5th full-width), or style Cadence/Efficiency as a visually distinct sub-section

### 3.3 XP progress dots unreadable
- [ ] File: `app/src/components/GameCard.tsx`
- [ ] The small dots showing level progress are too tiny on mobile
- [ ] Fix: replace with a simple progress bar (filled portion = XP progress to next level)

### 3.4 Chart toggle pills spacing
- [ ] "Since start" dropdown is tight against the right viewport edge
- [ ] Fix: add right padding or make the pill row horizontally scrollable on mobile

### 3.5 Header badge spacing  
- [ ] "131 bpm" badge may crowd the hamburger menu icon on narrow viewports
- [ ] Fix: ensure min-gap between badge and menu icon, or let badge shrink/truncate

## Verification

After each fix:
1. Run `npm run dev` and check at 430px width (Chrome DevTools → iPhone 14 Pro Max)
2. Also spot-check at 375px (iPhone SE) and 768px (tablet)
3. Ensure no TypeScript errors: `npx tsc --noEmit`
4. Commit after each priority group (P1, P2, P3)

## Done Criteria

- Settings sidebar opens, edits, saves, and closes correctly on mobile
- All dashboard content fits within viewport without horizontal overflow
- Run list is usable on mobile (no clipped columns)
- Chart is fully visible with no clipped labels
- No TypeScript errors
