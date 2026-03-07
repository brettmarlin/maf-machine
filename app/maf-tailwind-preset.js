const { colors, gradients, typography } = require('./src/design/design-tokens');

module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        maf: {
          dark:         '#0F0F13',
          glass:        'rgba(255, 255, 255, 0.04)',
          'glass-hover':'rgba(255, 255, 255, 0.08)',
          input:        'rgba(255, 255, 255, 0.05)',
          strava:       '#FC4C02',
          'strava-hover':'#E04400',
          orange:       '#FF6B4A',
          pink:         '#E040A0',
          purple:       '#7B61FF',
          blue:         '#38BDF8',
          green:        '#34D399',
          yellow:       '#FBBF24',
          red:          '#EF4444',
          'below-ceiling': '#34D399',
          'over-ceiling':  '#EF4444',
          improving:    '#34D399',
          declining:    '#EF4444',
        },
      },
      borderColor: {
        'maf-subtle': 'rgba(255, 255, 255, 0.08)',
        'maf-medium': 'rgba(255, 255, 255, 0.12)',
        'maf-strong': 'rgba(255, 255, 255, 0.20)',
      },
      boxShadow: {
        'maf-glow-orange': '0 0 40px rgba(255, 107, 74, 0.3)',
        'maf-glow-purple': '0 0 40px rgba(123, 97, 255, 0.3)',
        'maf-glow-pink':   '0 0 40px rgba(224, 64, 160, 0.3)',
        'maf-glow-blue':   '0 0 40px rgba(56, 189, 248, 0.3)',
        'maf-glow-green':  '0 0 40px rgba(52, 211, 153, 0.3)',
      },
      backgroundImage: {
        'gradient-maf':      'linear-gradient(135deg, #FF6B4A, #E040A0, #7B61FF)',
        'gradient-maf-warm': 'linear-gradient(135deg, #FC4C02, #FF6B4A, #E040A0)',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.gradient-text': {
          'background': 'linear-gradient(135deg, #FF6B4A, #E040A0, #7B61FF)',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
        },
        '.gradient-text-warm': {
          'background': 'linear-gradient(135deg, #FC4C02, #FF6B4A, #E040A0)',
          '-webkit-background-clip': 'text',
          'background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
        },
        '.glass-card': {
          'background': 'rgba(255, 255, 255, 0.04)',
          'border': '1px solid rgba(255, 255, 255, 0.08)',
          'backdrop-filter': 'blur(12px)',
          '-webkit-backdrop-filter': 'blur(12px)',
        },
        '.glass-card-hover': {
          'background': 'rgba(255, 255, 255, 0.08)',
          'border': '1px solid rgba(255, 255, 255, 0.12)',
          'backdrop-filter': 'blur(12px)',
          '-webkit-backdrop-filter': 'blur(12px)',
        },
        '.glow-orb': {
          'border-radius': '50%',
          'filter': 'blur(120px)',
          'opacity': '0.3',
          'pointer-events': 'none',
          'position': 'absolute',
        },
        '.pill-badge': {
          'border-radius': '9999px',
          'padding': '0.625rem 1rem',
          'backdrop-filter': 'blur(8px)',
          '-webkit-backdrop-filter': 'blur(8px)',
        },
      });
    },
  ],
};
