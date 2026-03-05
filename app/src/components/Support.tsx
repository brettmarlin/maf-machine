export default function Support() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0f0f0f',
      color: '#e8e8e8',
      fontFamily: "'Georgia', serif",
      padding: '0',
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #2a2a2a',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
      }}>
        <a href="/" style={{
          color: '#e8680a',
          textDecoration: 'none',
          fontSize: '14px',
          fontFamily: "'system-ui', sans-serif",
          letterSpacing: '0.05em',
        }}>
          &larr; MAF Machine
        </a>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: '720px',
        margin: '0 auto',
        padding: '64px 32px 120px',
      }}>
        <div style={{
          fontSize: '11px',
          letterSpacing: '0.15em',
          color: '#e8680a',
          fontFamily: "'system-ui', sans-serif",
          textTransform: 'uppercase',
          marginBottom: '16px',
        }}>
          Help
        </div>

        <h1 style={{
          fontSize: '36px',
          fontWeight: '300',
          lineHeight: '1.2',
          margin: '0 0 48px',
          letterSpacing: '-0.02em',
        }}>
          Support
        </h1>

        <Section title="Get Help">
          <p>
            Email us at{' '}
            <a href="mailto:support@marliin.com" style={{ color: '#e8680a' }}>
              support@marliin.com
            </a>
            {' '}&mdash; we typically respond within 1 business day.
          </p>
        </Section>

        <Section title="Common Questions">
          <FAQ question="How do I change my age or MAF settings?">
            Open the settings panel using the gear icon in the top right of your dashboard.
          </FAQ>
          <FAQ question="Why are some runs missing?">
            MAF Machine syncs runs that have heart rate data recorded. Runs without a heart rate monitor will not appear.
          </FAQ>
          <FAQ question="How do I disconnect Strava?">
            Open Settings &rarr; scroll to the bottom &rarr; select Disconnect Strava. This immediately revokes access and removes your data.
          </FAQ>
          <FAQ question="How do I delete my data?">
            Email{' '}
            <a href="mailto:support@marliin.com?subject=Data%20Deletion%20Request" style={{ color: '#e8680a' }}>
              support@marliin.com
            </a>
            {' '}with the subject &ldquo;Data Deletion Request&rdquo; and we&rsquo;ll confirm deletion within 7 days.
          </FAQ>
        </Section>

        {/* Footer */}
        <div style={{
          marginTop: '80px',
          paddingTop: '32px',
          borderTop: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '13px',
          fontFamily: "'system-ui', sans-serif",
        }}>
          <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer">
            <img
              src="/api_logo_pwrdBy_strava_horiz_white.svg"
              alt="Powered by Strava"
              style={{ height: '16px', opacity: 0.5 }}
            />
          </a>
          <span style={{ color: '#333' }}>&middot;</span>
          <a href="/privacy-policy" style={{ color: '#555', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '48px' }}>
      <h2 style={{
        fontSize: '11px',
        fontFamily: "'system-ui', sans-serif",
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#e8680a',
        margin: '0 0 20px',
        fontWeight: '500',
      }}>
        {title}
      </h2>
      <div style={{
        fontSize: '16px',
        lineHeight: '1.75',
        color: '#c8c8c8',
      }}>
        {children}
      </div>
    </section>
  );
}

function FAQ({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <p style={{ fontWeight: '600', color: '#e8e8e8', margin: '0 0 6px' }}>{question}</p>
      <p style={{ margin: 0, color: '#999' }}>{children}</p>
    </div>
  );
}
