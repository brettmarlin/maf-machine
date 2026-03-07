# Mobile Chart Fixes — Implementation Brief

## Context

`app/src/components/TrendChart.tsx`
Branch: `v2` | Test locally: `npm run dev`
Viewport targets: 375px (iPhone SE), 430px (iPhone 14 Pro Max), 768px+ (desktop unchanged)

Three fixes. Implement in this order — they're independent but fix 1 recovers space that makes fixes 2 and 3 easier to verify.

---

## Fix 1: Toggle Pills — Icons Only on Mobile

### Problem
5 items (HR, Pace, Efficiency, Cadence + date picker) don't fit in 375px.

### Solution
On mobile (`window.innerWidth < 640` or a CSS media query approach), render pills with icon only — no text label. Desktop unchanged.

### Implementation

Add a `useIsMobile` hook or inline width check:

```tsx
const [isMobile, setIsMobile] = useState(window.innerWidth < 640)

useEffect(() => {
  const handler = () => setIsMobile(window.innerWidth < 640)
  window.addEventListener('resize', handler)
  return () => window.removeEventListener('resize', handler)
}, [])
```

Each pill renders conditionally:

```tsx
// Metric pill definitions
const METRICS = [
  { id: 'hr',         icon: '♥',  label: 'HR',         iconColor: '#FF6B4A' },
  { id: 'pace',       icon: '◆',  label: 'Pace',       iconColor: '#ffffff' },
  { id: 'efficiency', icon: '⚡', label: 'Efficiency', iconColor: null },
  { id: 'cadence',    icon: '👟', label: 'Cadence',    iconColor: null },
]

// Pill render
<button key={m.id} onClick={() => toggle(m.id)} style={{
  display: 'flex',
  alignItems: 'center',
  gap: isMobile ? 0 : 6,
  padding: isMobile ? '6px 10px' : '6px 14px',
  borderRadius: 20,
  // ... active/inactive styles
}}>
  <span style={{ color: isActive ? m.iconColor ?? '#fff' : '#666' }}>
    {m.icon}
  </span>
  {!isMobile && (
    <span style={{ fontSize: 13, color: isActive ? '#fff' : '#666' }}>
      {m.label}
    </span>
  )}
</button>
```

**Result:** On mobile each pill is ~32px wide (icon + padding). All 4 pills + date picker fit in one row.

---

## Fix 2: Date Picker — Truncated Label + Fixed Positioning

### Problem A: Label overflow
"Since MAF Start Date" is ~170px. On mobile this pushes outside the viewport.

### Solution A
Truncate on mobile:

```tsx
const datePickerLabel = isMobile ? 'Since Start' : selectedRange.label
// Or even shorter: 'Start Date' or just show a calendar icon
```

### Problem B: Dropdown clips at viewport edge
The dropdown panel uses `position: absolute` and opens to the right, overflowing on mobile.

### Solution B
Switch to `position: fixed` on mobile, anchored to bottom of the trigger:

```tsx
// In the dropdown panel style:
const dropdownStyle = isMobile ? {
  position: 'fixed' as const,
  bottom: 'auto',
  top: triggerRef.current
    ? triggerRef.current.getBoundingClientRect().bottom + 8
    : '50%',
  right: 16,
  left: 'auto',
  zIndex: 1000,
} : {
  position: 'absolute' as const,
  top: '100%',
  right: 0,
  marginTop: 8,
  zIndex: 100,
}
```

---

## Fix 3: Y-Axis — Fewer Ticks, Hide Right Axis on Mobile

### Problem
Both Y-axes eat ~35–40px each side on a 375px screen, leaving ~295px for the actual chart.

### Solution

**Left axis (HR):** Reduce to 3 ticks on mobile — min HR, ceiling, max HR.

```tsx
// In the Recharts YAxis for HR:
<YAxis
  yAxisId="hr"
  width={isMobile ? 32 : 40}
  tickCount={isMobile ? 3 : 6}
  // existing props...
/>
```

**Right axis (pace):** Hide entirely on mobile. Show pace in tooltip instead (it's already in the tooltip).

```tsx
<YAxis
  yAxisId="pace"
  orientation="right"
  hide={isMobile}
  width={isMobile ? 0 : 55}
  // existing props...
/>
```

**Tooltip enhancement** — when on mobile, make sure the tooltip shows both HR and pace values prominently since the pace axis is hidden:

```tsx
// In custom tooltip, ensure pace is always shown regardless of isMobile
// It should already be there — just verify it's not conditionally hidden
```

**Recharts container margin:**

```tsx
<ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
  <LineChart
    margin={isMobile
      ? { top: 8, right: 8, bottom: 8, left: 0 }
      : { top: 8, right: 16, bottom: 8, left: 0 }
    }
  >
```

---

## Expected Space Recovery on 375px

| Before | After |
|---|---|
| Left axis: ~40px | Left axis: ~32px |
| Right axis: ~55px | Right axis: hidden (0px) |
| Pill row: overflows | Pill row: fits in ~280px |
| Date picker: clips | Date picker: truncated + fixed position |
| Chart width: ~280px | Chart width: ~343px (+63px, +22%) |

---

## Compile & Test Checklist

- [ ] `npx tsc --noEmit` — no errors
- [ ] 375px: 4 icon-only pills + "Since Start" all fit on one row, no overflow
- [ ] 375px: date picker dropdown opens without clipping right edge
- [ ] 375px: left axis shows 3 ticks, right axis hidden
- [ ] 375px: tooltip shows pace value (since axis is hidden)
- [ ] 768px+: pills show icon + label, full "Since MAF Start Date" label, both axes visible — unchanged from current
- [ ] Commit: `"TrendChart: mobile icon pills, axis reduction, date picker fix"`
