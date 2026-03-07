# Streak Timeline — Implementation Brief

## Context

MAF Machine v2 — `app/src/components/GameCard.tsx`
Branch: `v2` | Test locally only: `npm run dev`

Replace the current streak display in `GameCard.tsx` with a visual week timeline. No other files should need changes unless the `/api/game` response is missing `this_week_zone_minutes` (see Step 1).

---

## Step 1 — Verify Data Shape

Check the `/api/game` response includes:

```typescript
streak: {
  current_weeks: number           // e.g. 3
  longest_ever: number
  frozen: boolean
  last_qualified_week: string | null
}
weekly: {
  zone_minutes: number            // minutes earned so far this week
  target: number                  // weekly target (e.g. 90)
  runs: number
  days_left: number
}
```

The progress ring needs `weekly.zone_minutes / weekly.target` to draw the arc. If `weekly` is missing from the response, add it to `buildGameAPIResponse()` in `worker/src/lib/gameState.ts`.

---

## Step 2 — WeekTimeline Component

Add a `WeekTimeline` sub-component inside `GameCard.tsx` (not a separate file).

### Props

```typescript
interface WeekTimelineProps {
  completedWeeks: number       // streak.current_weeks
  currentWeekPct: number       // weekly.zone_minutes / weekly.target, capped at 1.0
  totalCircles?: number        // default 12
}
```

### Circle types

| Type | Condition | Visual |
|---|---|---|
| `completed` | index < completedWeeks | Green filled, white ✓ |
| `current` | index === completedWeeks | SVG progress ring |
| `future` | index > completedWeeks | Unlabeled, fading opacity |

### Opacity for future circles

```typescript
function getFutureOpacity(distanceFromCurrent: number): number {
  // distanceFromCurrent = index - completedWeeks (1-based)
  const opacities = [0.45, 0.35, 0.25, 0.18, 0.13, 0.09, 0.07, 0.06]
  return opacities[Math.min(distanceFromCurrent - 1, opacities.length - 1)]
}
```

---

## Step 3 — Progress Ring (SVG)

The current week circle is an SVG arc showing % of weekly target complete.

```typescript
function ProgressRing({ pct, size = 40 }: { pct: number; size?: number }) {
  const radius = (size - 4) / 2   // 2px stroke on each side
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(pct, 1))
  const pctDisplay = Math.round(Math.min(pct, 1) * 100)

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={2}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="#34D399"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      {/* Percentage label — centered over SVG */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600, color: '#34D399',
      }}>
        {pctDisplay}%
      </div>
    </div>
  )
}
```

---

## Step 4 — Full WeekTimeline Render

```typescript
function WeekTimeline({ completedWeeks, currentWeekPct, totalCircles = 12 }: WeekTimelineProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      overflowX: 'auto',
      scrollbarWidth: 'none',         // Firefox
      msOverflowStyle: 'none',        // IE
      paddingBottom: 2,               // breathing room for scrollbar on iOS
    }}
    className="hide-scrollbar"        // add to index.css: .hide-scrollbar::-webkit-scrollbar { display: none }
    >
      {Array.from({ length: totalCircles }).map((_, i) => {
        const isCompleted = i < completedWeeks
        const isCurrent = i === completedWeeks
        const distanceFromCurrent = i - completedWeeks  // positive for future

        if (isCompleted) {
          return (
            <div key={i} style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
              background: '#34D399',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: '#0F0F13', fontSize: 16, fontWeight: 700 }}>✓</span>
            </div>
          )
        }

        if (isCurrent) {
          return <ProgressRing key={i} pct={currentWeekPct} size={40} />
        }

        // Future — unlabeled, fading
        return (
          <div key={i} style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            border: '1.5px solid rgba(255,255,255,0.2)',
            opacity: getFutureOpacity(distanceFromCurrent),
          }} />
        )
      })}
    </div>
  )
}
```

---

## Step 5 — Streak Headline

Replace the current streak heading with gradient + emoji treatment:

```tsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
  <h2 style={{
    fontSize: 22,
    fontWeight: 800,
    background: 'linear-gradient(135deg, #FF6B4A, #E040A0)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    margin: 0,
  }}>
    🔥 {gameData.streak.current_weeks}-Week Streak!
  </h2>

  {/* Contextual callout — right side */}
  {minutesRemaining > 0 && (
    <span style={{ fontSize: 13, color: '#34D399' }}>
      <strong>{Math.round(currentWeekPct * 100)}%</strong>
      {': '}{minutesRemaining} more minutes in-zone this week.
    </span>
  )}
</div>
```

Where `minutesRemaining = Math.max(0, gameData.weekly.target - gameData.weekly.zone_minutes)`.

Handle edge cases:
- `current_weeks === 0`: heading = "Start Your Streak!" (no emoji, white text)
- `currentWeekPct >= 1`: callout = "✓ Weekly target hit!" in green
- `streak.frozen`: heading = "Streak on Pause" in muted white

---

## Step 6 — Wire Into GameCard

Replace whatever currently renders the streak section with:

```tsx
<WeekTimeline
  completedWeeks={gameData.streak.current_weeks}
  currentWeekPct={gameData.weekly.zone_minutes / gameData.weekly.target}
  totalCircles={12}
/>
```

---

## Step 7 — CSS

Add to `app/src/index.css`:

```css
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
```

---

## Compile & Test Checklist

- [ ] `npx tsc --noEmit` — no errors
- [ ] Desktop: 12 circles visible, no overflow
- [ ] Mobile 375px: circles scroll horizontally, no visible scrollbar
- [ ] Completed circles: solid green with ✓
- [ ] Current circle: arc draws correctly, % label centered
- [ ] Future circles: opacity fades right, no labels
- [ ] Streak = 0: "Start Your Streak!" state renders
- [ ] Weekly target met: callout switches to "✓ Weekly target hit!"
- [ ] Commit: `"GameCard: streak week timeline with progress ring"`
