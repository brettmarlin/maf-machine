// MAF Machine — Design Tokens
// Single source of truth for the MAF Machine visual system.
// Used by both the landing page and the app.

// ─── Colors ─────────────────────────────────────────────

export const colors = {
  // Backgrounds
  bg: {
    primary: '#0F0F13',        // near-black base
    elevated: 'rgba(255, 255, 255, 0.04)',  // glass card fill
    hover: 'rgba(255, 255, 255, 0.08)',     // glass card hover / subtle highlight
    input: 'rgba(255, 255, 255, 0.05)',     // form inputs
  },

  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    medium: 'rgba(255, 255, 255, 0.12)',
    strong: 'rgba(255, 255, 255, 0.20)',
  },

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: '#E0E0E0',
    muted: '#9CA3AF',          // gray-400
    faint: '#6B7280',          // gray-500
    disabled: '#4B5563',       // gray-600
  },

  // Brand
  brand: {
    strava: '#FC4C02',         // Strava orange — primary CTA
    stravaHover: '#E04400',
    orange: '#FF6B4A',         // warm accent
    pink: '#E040A0',           // secondary accent
    purple: '#7B61FF',         // tertiary accent
    blue: '#38BDF8',           // info / cool accent
    green: '#34D399',          // success / positive
    yellow: '#FBBF24',         // warning / celebration
    red: '#EF4444',            // error / over ceiling
  },

  // Semantic (app-specific)
  semantic: {
    belowCeiling: '#34D399',   // green — good HR
    overCeiling: '#EF4444',    // red — bad HR
    controlled: '#34D399',     // controlled tier
    easy: '#38BDF8',           // easy tier
    recovery: '#6B7280',       // recovery tier
    improving: '#34D399',      // trend improving
    declining: '#EF4444',      // trend declining
    neutral: '#9CA3AF',        // trend flat
  },

  // Badge accent colors (for game mechanics)
  badge: {
    streak: '#FC4C02',
    zone: '#E040A0',
    drift: '#7B61FF',
    summit: '#38BDF8',
    perfect: '#FBBF24',
    iron: '#34D399',
    sunrise: '#FB923C',
    champ: '#A78BFA',
  },
} as const;

// ─── Gradients ──────────────────────────────────────────

export const gradients = {
  // Text gradients (applied via background-clip)
  textPrimary: 'linear-gradient(135deg, #FF6B4A, #E040A0, #7B61FF)',
  textWarm: 'linear-gradient(135deg, #FC4C02, #FF6B4A, #E040A0)',

  // Chart / data viz
  chartLine: 'linear-gradient(90deg, #FC4C02, #7B61FF)',
  chartArea: 'linear-gradient(180deg, rgba(123,97,255,0.3), rgba(123,97,255,0))',

  // Glow orbs (background accents)
  orbPurple: '#7C3AED',       // purple-600
  orbOrange: '#F97316',       // orange-500
  orbPink: '#DB2777',         // pink-600
  orbBlue: '#2563EB',         // blue-600

  // Connecting lines / decorative
  line: 'linear-gradient(90deg, rgba(252,76,2,0.4), rgba(123,97,255,0.4), rgba(56,189,248,0.4))',
} as const;

// ─── Typography ─────────────────────────────────────────

export const typography = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontImport: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',

  // Scale (use with Tailwind text-* classes or directly)
  size: {
    xs: '0.75rem',      // 12px — labels, captions
    sm: '0.875rem',     // 14px — card body, secondary
    base: '1rem',       // 16px — body
    lg: '1.125rem',     // 18px — emphasis
    xl: '1.25rem',      // 20px — card titles
    '2xl': '1.5rem',    // 24px — section subtitles
    '3xl': '1.875rem',  // 30px — section titles (mobile)
    '4xl': '2.25rem',   // 36px — section titles
    '5xl': '3rem',      // 48px — hero (mobile)
    '6xl': '3.75rem',   // 60px — hero (tablet)
    '7xl': '4.5rem',    // 72px — hero (desktop)
    '8xl': '6rem',      // 96px — hero (large)
  },

  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    black: '900',
  },
} as const;

// ─── Component Styles ───────────────────────────────────

export const components = {
  // Glass card (frosted panel)
  glassCard: {
    background: colors.bg.elevated,
    border: `1px solid ${colors.border.subtle}`,
    backdropFilter: 'blur(12px)',
    borderRadius: '1rem',      // rounded-2xl
  },

  // Glow orb (background decoration)
  glowOrb: {
    borderRadius: '50%',
    filter: 'blur(120px)',
    opacity: 0.3,
    pointerEvents: 'none' as const,
    position: 'absolute' as const,
  },

  // CTA button
  ctaPrimary: {
    background: colors.brand.strava,
    color: colors.text.primary,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.lg,
    padding: '1rem 2rem',
    borderRadius: '9999px',    // fully rounded
  },

  // Pill badge (game mechanics)
  pillBadge: (accentColor: string) => ({
    background: `${accentColor}15`,
    border: `1px solid ${accentColor}33`,
    borderRadius: '9999px',
    padding: '0.625rem 1rem',
    backdropFilter: 'blur(8px)',
  }),

  // Stat card (small metric display)
  statCard: {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    textAlign: 'center' as const,
  },
} as const;

// ─── Spacing & Layout ───────────────────────────────────

export const layout = {
  maxWidth: {
    content: '80rem',    // 1280px — max-w-5xl+
    text: '42rem',       // 672px — max-w-2xl (readable line length)
    wide: '72rem',       // 1152px — max-w-6xl
  },

  section: {
    paddingY: '6rem',        // py-24
    paddingYLarge: '8rem',   // py-32
    paddingX: '1.5rem',      // px-6
  },
} as const;
