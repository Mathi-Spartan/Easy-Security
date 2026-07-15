import { Link } from 'react-router-dom'

const TOOLS = [
  {
    to: '/47-day-scanner',
    badge: 'New rules in effect',
    badgeClass: 'ws-badge-red',
    title: '47-Day Readiness Scanner',
    desc: 'Certificate lifetimes dropped to 200 days in March 2026 and shrink to 47 days by 2029. Scan your domain against Certificate Transparency logs and see exactly how the new CA/Browser Forum rules hit your renewal workload.'
  },
  {
    to: '/dcv-preflight',
    badge: 'Avoid failed orders',
    badgeClass: 'ws-badge-teal',
    title: 'DCV Pre-Flight Checker',
    desc: 'Test HTTP, DNS, and email domain-control validation before you order a certificate. Catches blocked port 80, restrictive CAA records, and missing MX records — the top causes of stuck certificate orders.'
  },
  {
    to: '/pqc-test',
    badge: 'Post-quantum',
    badgeClass: 'ws-badge-teal',
    title: 'Post-Quantum Readiness Test',
    desc: 'Probe any server for hybrid post-quantum key exchange (X25519MLKEM768), TLS version, and quantum-vulnerable key algorithms. Get a crypto-agility grade before the 2030 deprecation timeline arrives.'
  },
  {
    to: '/chain-fixer',
    badge: 'Fixes, not just checks',
    badgeClass: 'ws-badge-green',
    title: 'Certificate Chain Fixer',
    desc: 'Paste your certificate and get back a correctly ordered, ready-to-install full-chain bundle. We follow the AIA trail to fetch the right intermediates automatically — no more "chain incomplete" browser errors.'
  },
  {
    to: '/acme-audit',
    badge: 'Automation ready?',
    badgeClass: 'ws-badge-amber',
    title: 'ACME Readiness Audit',
    desc: 'With renewals moving to every 47 days, automation is mandatory. We detect your DNS provider, check CAA and challenge delegation, and generate the exact certbot / acme.sh commands for your setup.'
  }
]

export default function Home() {
  return (
    <div className="ws-container">
      <div className="ws-page-head" style={{ padding: '52px 0 30px' }}>
        <div className="ws-eyebrow">Free PKI toolkit</div>
        <h1 className="ws-h1" style={{ fontSize: 36, maxWidth: 720 }}>
          Certificates are moving to 47-day lifetimes.<br />These free tools get you ready.
        </h1>
        <p className="ws-sub" style={{ maxWidth: 620 }}>
          Five tools built for the new certificate era — no signup, no stored data.
          Scan your renewal exposure, pre-flight your validation, test post-quantum
          support, fix broken chains, and audit your automation setup.
        </p>
      </div>

      <div className="ws-section">
        <div className="ws-grid ws-grid-2">
          {TOOLS.map((t) => (
            <Link key={t.to} to={t.to} className="ws-card ws-card-hover" style={{ display: 'block', color: 'inherit' }}>
              <span className={'ws-badge ' + t.badgeClass}>{t.badge}</span>
              <h2 className="ws-h2" style={{ margin: '10px 0 6px' }}>{t.title}</h2>
              <p className="ws-sub ws-small" style={{ lineHeight: 1.6 }}>{t.desc}</p>
              <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13, color: 'var(--ws-teal)' }}>
                Open tool →
              </div>
            </Link>
          ))}

          <div className="ws-card" style={{ background: 'var(--ws-surface-2)', border: '1px dashed var(--ws-line-2)', boxShadow: 'none' }}>
            <span className="ws-badge ws-badge-gray">Why now</span>
            <h2 className="ws-h2" style={{ margin: '10px 0 6px' }}>The timeline is already running</h2>
            <p className="ws-sub ws-small" style={{ lineHeight: 1.6 }}>
              CA/Browser Forum Ballot SC-081v3 cut maximum certificate validity to
              200 days on 15 March 2026. It drops to 100 days in March 2027 and 47
              days in March 2029, with domain validation reuse shrinking to just 10
              days. Manual renewal workflows will not survive this — these tools
              show you where you stand.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
