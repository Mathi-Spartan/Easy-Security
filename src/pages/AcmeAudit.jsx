import { useState } from 'react'
import { PageHead, CheckRow, ErrorAlert, callApi } from '../components/Shared.jsx'

export default function AcmeAudit() {
  const [domain, setDomain] = useState('')
  const [wildcard, setWildcard] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const run = async (e) => {
    e.preventDefault()
    const cleaned = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (!cleaned) return
    setLoading(true); setError(null); setData(null)
    try {
      setData(await callApi('/api/acme-audit?domain=' + encodeURIComponent(cleaned) + (wildcard ? '&wildcard=1' : '')))
    } catch (e2) { setError(e2.message) } finally { setLoading(false) }
  }

  return (
    <div className="ws-container">
      <PageHead
        eyebrow="Automation or outages — pick one"
        title="ACME Readiness Audit"
        sub="By March 2029, certificates renew every 47 days and domain validation can only be reused for 10 days. We detect your DNS provider, check CAA and challenge delegation, verify port 80, and generate the exact automation commands for your setup."
      />
      <div className="ws-section">
        <div className="ws-card">
          <form onSubmit={run}>
            <label className="ws-label">Your domain</label>
            <div className="ws-form-row">
              <input className="ws-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" spellCheck="false" autoCapitalize="none" />
              <button className="ws-btn-primary" disabled={loading} type="submit">
                {loading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="ws-spinner" /> Auditing…</span> : 'Audit automation'}
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, color: 'var(--ws-ink-2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={wildcard} onChange={(e) => setWildcard(e.target.checked)} />
              I need a wildcard certificate (*.domain) — requires DNS validation
            </label>
          </form>
        </div>

        <ErrorAlert message={error} />

        {data && (
          <>
            <div className="ws-card" style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
              <div className={'ws-grade ws-grade-' + data.score}>{data.score}</div>
              <div>
                <h2 className="ws-h2" style={{ marginBottom: 4 }}>Automation readiness for {data.domain}</h2>
                <p className="ws-sub ws-small" style={{ margin: 0 }}>{data.scoreText}</p>
              </div>
            </div>

            <div className="ws-card" style={{ marginTop: 14 }}>
              {data.checks.map((c) => (
                <CheckRow key={c.id} status={c.status} title={c.title} detail={c.detail} />
              ))}
            </div>

            <div className="ws-card" style={{ marginTop: 14 }}>
              <h2 className="ws-h2">Your automation commands</h2>
              {data.commands.map((cmd, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div className="ws-badge ws-badge-teal" style={{ marginBottom: 6 }}>{cmd.title}</div>
                  <pre className="ws-code">{cmd.code}</pre>
                </div>
              ))}
              <p className="ws-muted ws-small" style={{ margin: 0 }}>
                Commercial CAs increasingly expose ACME endpoints too — automation is not limited to free certificates. Ask your CA for its ACME directory URL and use it with <code className="ws-mono">--server</code>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
