import { useState } from 'react'
import { PageHead, DomainForm, CheckRow, ErrorAlert, callApi } from '../components/Shared.jsx'

export default function PqcTest() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const run = async (domain) => {
    setLoading(true); setError(null); setData(null)
    try {
      setData(await callApi('/api/pqc-test?domain=' + encodeURIComponent(domain)))
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div className="ws-container">
      <PageHead
        eyebrow="Harvest now, decrypt later"
        title="Post-Quantum Readiness Test"
        sub="Traffic recorded today can be decrypted by future quantum computers unless your server uses post-quantum key exchange. We probe your live TLS configuration for hybrid X25519MLKEM768 support and grade your crypto-agility against the NIST 2030/2035 deprecation timeline."
      />
      <div className="ws-section">
        <div className="ws-card">
          <label className="ws-label">Hostname to probe (port 443)</label>
          <DomainForm onSubmit={run} loading={loading} buttonText="Probe server" />
        </div>

        <ErrorAlert message={error} />

        {data && (
          <>
            <div className="ws-card" style={{ marginTop: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
              <div className={'ws-grade ws-grade-' + data.grade}>{data.grade}</div>
              <div>
                <h2 className="ws-h2" style={{ marginBottom: 4 }}>Crypto-agility grade for {data.host}</h2>
                <p className="ws-sub ws-small" style={{ margin: 0 }}>{data.gradeNote}</p>
              </div>
            </div>

            <div className="ws-card" style={{ marginTop: 14 }}>
              <CheckRow
                status={data.pqc.supported === true ? 'pass' : data.pqc.supported === false ? 'fail' : 'warn'}
                title={data.pqc.supported === true ? 'Post-quantum key exchange: supported' : data.pqc.supported === false ? 'Post-quantum key exchange: not supported' : 'Post-quantum key exchange: could not be probed'}
                detail={data.pqc.note}
              />
              <CheckRow
                status={data.handshake.protocol === 'TLSv1.3' ? 'pass' : data.handshake.protocol === 'TLSv1.2' ? 'warn' : 'fail'}
                title={'Protocol: ' + (data.handshake.protocol || 'unknown')}
                detail={'Cipher: ' + (data.handshake.cipher || '—') + (data.handshake.keyExchange ? ' · Key exchange: ' + data.handshake.keyExchange : '')}
              />
              {data.certificate && (
                <CheckRow
                  status="info"
                  title={'Certificate: ' + (data.certificate.keyType || 'unknown key') + (data.certificate.keyBits ? ' ' + data.certificate.keyBits + '-bit' : '')}
                  detail={data.authNote}
                />
              )}
            </div>

            {data.certificate && (
              <div className="ws-card" style={{ marginTop: 14 }}>
                <h2 className="ws-h2">Certificate details</h2>
                <table className="ws-table">
                  <tbody>
                    <tr><td className="ws-muted">Subject</td><td className="ws-mono">{data.certificate.subjectCN}</td></tr>
                    <tr><td className="ws-muted">Issuer</td><td>{data.certificate.issuer}</td></tr>
                    <tr><td className="ws-muted">Expires</td><td className="ws-mono">{data.certificate.validTo}</td></tr>
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
