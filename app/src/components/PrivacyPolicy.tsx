// PrivacyPolicy.tsx
// Drop into app/src/components/PrivacyPolicy.tsx
// Add route: <Route path="/privacy" element={<PrivacyPolicy />} />
// Last updated: March 2026

export default function PrivacyPolicy() {
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
          ← MAF Machine
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
          Legal
        </div>

        <h1 style={{
          fontSize: '36px',
          fontWeight: '400',
          margin: '0 0 8px',
          lineHeight: '1.2',
          color: '#ffffff',
        }}>
          Privacy Policy
        </h1>

        <p style={{
          color: '#666',
          fontSize: '14px',
          fontFamily: "'system-ui', sans-serif",
          margin: '0 0 56px',
        }}>
          Last updated: March 2026
        </p>

        <Section title="Overview">
          <p>
            MAF Machine is a personal training dashboard for endurance athletes. We connect to
            your Strava account to analyze your runs against your MAF heart rate ceiling and
            display your training trends over time.
          </p>
          <p>
            This policy explains what data we collect, how we use it, and how you control it.
            The short version: your data is yours, we only use it to power your own dashboard,
            and we never share it with anyone.
          </p>
        </Section>

        <Section title="What Data We Collect">
          <p>
            When you connect MAF Machine to Strava, we access the following data from your
            Strava account:
          </p>
          <ul>
            <li><strong>Activity data</strong> — date, name, distance, duration, sport type, and GPS start/end coordinates for each activity</li>
            <li><strong>Activity streams</strong> — per-second heart rate, pace, cadence, and altitude data for heart rate zone analysis</li>
            <li><strong>Athlete profile</strong> — your first name, last name, and profile photo, used only to personalize your dashboard</li>
          </ul>
          <p>
            We also store the settings you configure in MAF Machine:
          </p>
          <ul>
            <li>Your age and any MAF formula modifier you apply</li>
            <li>Your preferred units (miles or kilometers)</li>
            <li>Your training start date (if set)</li>
          </ul>
          <p>
            If you choose to provide your email address during onboarding, we use it only to
            send product updates. We do not share it with third parties. We do not collect
            payment information, location beyond what Strava provides in activity data, or any
            data outside of what is listed above.
          </p>
        </Section>

        <Section title="How We Use Your Data">
          <p>
            Your Strava data is used for one purpose: generating your personal MAF training
            dashboard. Specifically:
          </p>
          <ul>
            <li>Calculating how much time you spend below your MAF heart rate ceiling on each run</li>
            <li>Tracking trends in cardiac drift, aerobic efficiency, and pace over time</li>
            <li>Displaying your training history in charts and run lists visible only to you</li>
          </ul>
          <p>
            Your data is never used to train or improve any AI or machine learning model.
            Your data is never shown to any other user. There are no social feeds, public
            profiles, or cross-user comparisons.
          </p>
        </Section>

        <Section title="Data Storage & Security">
          <p>
            Your data is stored in Cloudflare's edge storage infrastructure (Cloudflare KV),
            partitioned by your Strava athlete ID. Access requires a valid authenticated
            session tied to your Strava account — no one else can access your data.
          </p>
          <p>
            Your Strava OAuth tokens are stored server-side and are never exposed to the
            browser. All connections use HTTPS. We do not maintain a traditional database
            server — all storage is handled by Cloudflare's secure edge network.
          </p>
        </Section>

        <Section title="Data Sharing">
          <p>
            We do not sell, rent, or share your data with any third party, advertiser, or
            data broker. Ever.
          </p>
          <p>
            The only third-party service that receives your data is Strava itself — because
            MAF Machine reads data from Strava on your behalf via their official API. Strava's
            privacy policy governs how Strava handles your data.
          </p>
        </Section>

        <Section title="Disconnecting Strava">
          <p>
            You can disconnect MAF Machine from your Strava account at any time in two ways:
          </p>
          <ul>
            <li>
              <strong>From MAF Machine:</strong> Open Settings → scroll to the bottom →
              select "Disconnect Strava." This revokes our OAuth access and deletes your
              cached activity data from our storage.
            </li>
            <li>
              <strong>From Strava:</strong> Go to strava.com → Settings → My Apps → find
              MAF Machine → Revoke Access. This immediately invalidates our access tokens.
              Your cached data will be deleted within 30 days of the disconnection event.
            </li>
          </ul>
          <p>
            After disconnection, MAF Machine retains no data about you.
          </p>
        </Section>

        <Section title="Requesting Data Deletion">
          <p>
            To request deletion of all data associated with your account, email us at{' '}
            <a href="mailto:support@marliin.com" style={{ color: '#e8680a' }}>
              support@marliin.com
            </a>{' '}
            with the subject line "Data Deletion Request." Include the email address
            associated with your Strava account so we can locate your data.
          </p>
          <p>
            We will confirm deletion within 7 days. Disconnecting Strava (as described above)
            also triggers automatic deletion of your cached data.
          </p>
        </Section>

        <Section title="Cookies & Tracking">
          <p>
            MAF Machine uses a single session cookie to maintain your authenticated state
            after you log in via Strava. This cookie contains only a session identifier —
            no personal data.
          </p>
          <p>
            We do not use advertising cookies, tracking pixels, analytics SDKs, or any
            third-party tracking technology.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            MAF Machine is not directed at children under 13. We do not knowingly collect
            data from anyone under 13. If you believe a child has connected an account,
            contact us at{' '}
            <a href="mailto:support@marliin.com" style={{ color: '#e8680a' }}>
              support@marliin.com
            </a>{' '}
            and we will delete the data immediately.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            If we make material changes to this privacy policy, we will update the "Last
            updated" date at the top of this page. Continued use of MAF Machine after changes
            are posted constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data:
          </p>
          <p>
            Brett Marlin<br />
            MAF Machine<br />
            <a href="mailto:support@marliin.com" style={{ color: '#e8680a' }}>
              support@marliin.com
            </a><br />
            <a href="https://maf.marliin.com" style={{ color: '#e8680a' }}>
              maf.marliin.com
            </a>
          </p>
        </Section>

        {/* Strava attribution */}
        <div style={{
          marginTop: '80px',
          paddingTop: '32px',
          borderTop: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#444',
          fontSize: '13px',
          fontFamily: "'system-ui', sans-serif",
        }}>
          <img
            src="/api_logo_pwrdBy_strava_horiz_white.svg"
            alt="Powered by Strava"
            style={{ height: '16px', opacity: 0.5 }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Section helper ────────────────────────────────────────────────────────────

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
