import { useState } from 'react'
import { PageHead, CheckRow, ErrorAlert, callApi } from '../components/Shared.jsx'

export default function ChainFixer() {
  const [pem, setPem] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setLoading(true); setError(null); setData(null); setCopied(false)
    try {
      setData(await callApi('/api/chain-fixer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pem })
      }))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const copyBundle = async () => {
    try {
      await navigator.clipboard.writeText(data.fullchainPem)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const download = () => {
    const blob = new Blob([data.fullchainPem + '\n'], { type: 'application/x-pem-file' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'fullchain.pem'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const verdictClass = data
    ? data.verdict.level === 'pass' ? 'ws-alert-teal' : data.verdict.level === 'warn' ? 'ws-alert-amber' : 'ws-alert-red'
    : ''

  return (
    <div className="ws-container">
      <PageHead
        eyebrow="Fixes, not just checks"
        title="Certificate Chain Fixer"
        sub="A missing intermediate is the most common cause of 'certificate not trusted' errors on Android and older clients. Paste your certificate — we follow its AIA trail, download the correct intermediates, and hand back a ready-to-install full-chain bundle."
      />
      <div className="ws-section">
        <div className="ws-card">
          <label className="ws-label">Your certificate (PEM)</label>
          <textarea
            className="ws-input ws-textarea"
            placeholder={'-----BEGIN CERTIFICATE-----\nMIIF…\n-----END CERTIFICATE-----'}
            value={pem}
            onChange={(e) => setPem(e.target.value)}
            spellCheck="false"
          />
          <div className="ws-alert ws-alert-amber" style={{ marginTop: 10 }}>
            Paste the <strong>certificate only</strong> — never paste your private key into any online tool, including this one.
          </div>
          <button className="ws-btn-primary" onClick={run} disabled={loading || !pem.trim()}>
            {loading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="ws-spinner" /> Building chain…</span> : 'Build my chain'}
          </button>
        </div>

        <ErrorAlert message={error} />

        {data && (
          <>
            <div className={'ws-alert ' + verdictClass} style={{ marginTop: 16, fontWeight: 600 }}>{data.verdict.text}</div>

            <div className="ws-card" style={{ marginTop: 14 }}>
              <h2 className="ws-h2">Chain ({data.summaries.length} certificate{data.summaries.length === 1 ? '' : 's'})</h2>
              {data.summaries.map((s, i) => (
                <CheckRow
                  key={i}
                  status={s.expired ? 'fail' : 'pass'}
                  title={s.role + ' — ' + s.subject.replace(/^CN=/, '')}
                  detail={'Issued by ' + s.issuer.replace(/^CN=/, '') + ' · valid until ' + s.validTo + (s.expired ? ' — EXPIRED' : '')}
                />
              ))}
              {data.notes.map((n, i) => (
                <CheckRow key={'n' + i} status="warn" title="Note" detail={n} />
              ))}
            </div>

            {data.fullchainPem && (
              <div className="ws-card" style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h2 className="ws-h2" style={{ margin: 0, flex: 1 }}>fullchain.pem</h2>
                  <button className="ws-btn-secondary" onClick={copyBundle}>{copied ? 'Copied ✓' : 'Copy'}</button>
                  <button className="ws-btn-primary" onClick={download}>Download fullchain.pem</button>
                </div>
                <pre className="ws-code" style={{ maxHeight: 260, overflowY: 'auto' }}>{data.fullchainPem}</pre>

                <h3 className="ws-h3" style={{ marginTop: 14 }}>Install</h3>
                <div className="ws-grid ws-grid-3">
                  <div><div className="ws-badge ws-badge-teal">Nginx</div><pre className="ws-code">{data.installNotes.nginx}</pre></div>
                  <div><div className="ws-badge ws-badge-teal">Apache</div><pre className="ws-code">{data.installNotes.apache}</pre></div>
                  <div><div className="ws-badge ws-badge-teal">IIS / Windows</div><pre className="ws-code">{data.installNotes.iis}</pre></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
