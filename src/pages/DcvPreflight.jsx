import { useState } from 'react'
import { PageHead, DomainForm, CheckRow, ErrorAlert, callApi } from '../components/Shared.jsx'

export default function DcvPreflight() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const run = async (domain) => {
    setLoading(true); setError(null); setData(null)
    try {
      setData(await callApi('/api/dcv-preflight?domain=' + encodeURIComponent(domain)))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const alertClass = data
    ? data.summary.level === 'pass' ? 'ws-alert-teal' : data.summary.level === 'warn' ? 'ws-alert-amber' : 'ws-alert-red'
    : ''

  return (
    <div className="ws-container">
      <PageHead
        eyebrow="Before you order"
        title="DCV Pre-Flight Checker"
        sub="Failed domain-control validation is the #1 reason certificate orders get stuck. Run this before ordering: we test HTTP validation (port 80), DNS validation, email validation, and CAA policy — and tell you exactly which method will work."
      />
      <div className="ws-section">
        <div className="ws-card">
          <label className="ws-label">Domain you're ordering a certificate for</label>
          <DomainForm onSubmit={run} loading={loading} buttonText="Run pre-flight" />
        </div>

        <ErrorAlert message={error} />

        {data && (
          <>
            <div className={'ws-alert ' + alertClass} style={{ marginTop: 16, fontWeight: 600 }}>{data.summary.text}</div>
            <div className="ws-card" style={{ marginTop: 14 }}>
              {data.checks.map((c) => (
                <CheckRow key={c.id} status={c.status} title={c.title} detail={c.detail} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
