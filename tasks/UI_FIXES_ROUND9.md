# UI Fixes — Round 9

## Context

MAF Machine v2 Pro — React/Vite/Tailwind on Cloudflare Pages.

**Branch**: `v2`
**Test locally only**: `cd app && npm run dev` + `cd worker && npx wrangler dev --remote --config wrangler.dev.toml`
**DO NOT** deploy to maf.marliin.com or push to remote until told.
**Compile check after all fixes**: `npx tsc --noEmit`

---

## Fix 1: Strava Athlete Data — Store and Surface firstname + avatar

**Root cause**: `athlete.firstname`, `athlete.lastname`, and `athlete.profile_medium` are available in the Strava OAuth response but are not being persisted to KV or returned to the frontend. This breaks two surfaces.

### Part A — Persist athlete data during OAuth

**File**: `worker/src/index.ts` (OAuth callback handler)

- [ ] In the OAuth callback, after exchanging the code for tokens, the Strava response includes a full athlete object
- [ ] Extract and store the following fields to KV alongside the tokens (or in settings):
  ```typescript
  {
    firstname: athlete.firstname,
    lastname: athlete.lastname,
    profile: athlete.profile_medium, // ~62x62px, faster than full profile
  }
  ```
- [ ] Store under the existing settings key `{athleteId}:settings` so it's returned with settings, OR add to a dedicated `{athleteId}:athlete` key — whichever is simpler given the current schema
- [ ] If athlete data already exists in settings from a previous save, do not overwrite user-edited fields (e.g. name they may have manually changed)

### Part B — Return athlete data from settings endpoint

**File**: `worker/src/index.ts` (GET /api/settings handler)

- [ ] Ensure the settings response includes:
  ```json
  {
    "firstname": "Brett",
    "lastname": "Marlin",
    "profile": "https://dgalywyr863hv.cloudfront.net/pictures/athletes/..."
  }
  ```

### Part C — Header pill

**File**: `app/src/components/Dashboard.tsx` (or header component)

- [ ] Replace static "Settings" text with `settings.firstname` (or athlete state)
- [ ] Replace `?` avatar with:
  - If `settings.profile` is available: `<img src={settings.profile} className="w-7 h-7 rounded-full object-cover" />`
  - If not available: initials-based placeholder using first letter of `settings.firstname` on a dark circle
- [ ] Pill reads: `[avatar] [firstname] · 131 bpm ⚙️`

### Part D — Settings drawer

**File**: `app/src/components/SettingsSidebar.tsx` (or settings drawer component)

- [ ] Replace `?` avatar at top of drawer with same avatar logic as header (profile image or initials fallback)
- [ ] Pre-populate the NAME field with `settings.firstname + ' ' + settings.lastname` if the field is empty
- [ ] NAME field remains editable — pre-population is just a default, not locked

---

## Fix 2: Revert to Runs Only — Remove Activity Type Filter

**The decision**: MAF is a running methodology. Mixing activity types corrupts game mechanics, pace averages, and metric integrity. Runs only.

### Part A — Remove filter pills from run list

**File**: `app/src/components/Dashboard.tsx`

- [ ] Remove the activity type filter pill row (All · Running · Walking · Swimming · Cycling · Other) entirely
- [ ] Remove all filter state and filter logic associated with it
- [ ] Run list shows running activities only, no filtering UI

### Part B — Revert API fetch to runs only

**File**: `worker/src/index.ts` (Strava activities fetch)

- [ ] Re-add the run-type filter to the Strava `/athlete/activities` API call
- [ ] Fetch only: `type=Run` (covers `Run`, `TrailRun`, `VirtualRun` depending on Strava API version)
- [ ] Alternatively, fetch all and filter to running types server-side before storing — either approach is fine, but non-run activities should not be stored in KV or returned to the frontend
- [ ] Remove any activity type bucketing/mapping functions added in Round 7 that are no longer needed

### Part C — Clean up Round 7 remnants

- [ ] Remove `getActivityCategory()` function if it exists
- [ ] Remove any `sport_type` filter UI state
- [ ] Ensure run list header subtext still shows correct count: "12 runs"

---

## Verification

1. OAuth flow: after connecting Strava, check that `firstname`, `lastname`, `profile` are stored in KV
2. Header pill shows firstname and avatar (or initials if no image)
3. Settings drawer shows avatar and pre-populated name
4. Run list shows only running activities — no walks, rides, swims
5. Activity filter pills are gone
6. `npx tsc --noEmit` — zero errors
