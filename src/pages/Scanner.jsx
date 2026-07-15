import { useState } from 'react'
import { PageHead, DomainForm, ErrorAlert, callApi } from '../components/Shared.jsx'

export default function Scanner() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const run = async (domain) => {
    setLoading(true); setError(null); setData(null)
    try {
      setData(await callApi('/api/ct-scan?domain=' + encodeURIComponent(domain)))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="ws-container">
      <PageHead
        eyebrow="Certificate Transparency scan"
        title="47-Day Readiness Scanner"
        sub="We scan public Certificate Transparency logs for every active certificate on your domain, then project your renewal workload under the CA/Browser Forum SC-081v3 timeline: 200-day maximum today, 100 days from March 2027, 47 days from March 2029."
      />
      <div className="ws-section">
        <div className="ws-card">
          <label className="ws-label">Your domain</label>
          <DomainForm onSubmit={run} loading={loading} buttonText="Scan CT logs" />
          <div className="ws-muted ws-small" style={{ marginTop: 8 }}>
            Public data only — we query crt.sh, nothing is stored. Large domains can take up to 20 seconds.
          </div>
        </div>

        <ErrorAlert message={error} />

        {data && (
          <>
            <div className={'ws-alert ws-alert-' + (data.verdict.level === 'pass' ? 'teal' : data.verdict.level === 'warn' ? 'amber' : 'teal')} style={{ marginTop: 16 }}>
              <strong>{data.verdict.level === 'warn' ? 'Action needed: ' : ''}</strong>{data.verdict.text}
            </div>

            <div className="ws-grid ws-grid-3" style={{ marginTop: 14 }}>
              <div className="ws-stat"><div className="ws-stat-num">{data.activeCertificates}</div><div className="ws-stat-label">Active certificates</div></div>
              <div className="ws-stat"><div className="ws-stat-num" style={{ color: data.longLivedGrandfathered ? 'var(--ws-amber)' : 'var(--ws-green)' }}>{data.longLivedGrandfathered}</div><div className="ws-stat-label">Long-lived (pre-2026 rules)</div></div>
              <div className="ws-stat"><div className="ws-stat-num" style={{ color: data.expiringWithin30Days ? 'var(--ws-red)' : 'var(--ws-ink)' }}>{data.expiringWithin30Days}</div><div className="ws-stat-label">Expiring within 30 days</div></div>
            </div>

            <div className="ws-card" style={{ marginTop: 14 }}>
              <h2 className="ws-h2">Your renewal burden, phase by phase</h2>
              <table className="ws-table">
                <thead>
                  <tr><th>Phase</th><th>Max validity</th><th>Renewals / endpoint / yr</th><th>Total renewals / yr ({data.endpoints} endpoint{data.endpoints === 1 ? '' : 's'})</th><th>Domain validation</th></tr>
                </thead>
                <tbody>
                  {data.burden.map((b) => (
                    <tr key={b.from}>
                      <td><strong>{b.label}</strong><div className="ws-muted ws-small">from {b.from}</div></td>
                      <td className="ws-mono">{b.maxDays} days</td>
                      <td className="ws-mono">{b.renewalsPerEndpointPerYear}×</td>
                      <td className="ws-mono" style={{ fontWeight: 700 }}>{b.totalRenewalsPerYear}×</td>
                      <td className="ws-small ws-muted">{b.dcvValidationsNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.certificates.length > 0 && (
              <div className="ws-card" style={{ marginTop: 14 }}>
                <h2 className="ws-h2">Active certificates found in CT logs {data.truncated && <span className="ws-badge ws-badge-gray">showing first 50</span>}</h2>
                <table className="ws-table">
                  <thead><tr><th>Common name</th><th>Issuer</th><th>Expires</th><th>Validity</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.certificates.map((c, i) => (
                      <tr key={i}>
                        <td className="ws-mono">{c.commonName}{c.names.length > 1 && <div className="ws-muted ws-small">+{c.names.length - 1} more SAN{c.names.length > 2 ? 's' : ''}</div>}</td>
                        <td>{c.issuer}</td>
                        <td className="ws-mono">{new Date(c.notAfter).toISOString().slice(0, 10)}<div className="ws-muted ws-small">{c.daysRemaining}d left</div></td>
                        <td className="ws-mono">{c.validityDays}d</td>
                        <td>
                          {c.validityDays > 200
                            ? <span className="ws-badge ws-badge-amber">Grandfathered</span>
                            : c.daysRemaining <= 30
                              ? <span className="ws-badge ws-badge-red">Expiring soon</span>
                              : <span className="ws-badge ws-badge-green">Compliant</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
