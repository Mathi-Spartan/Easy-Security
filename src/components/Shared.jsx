import { useState } from 'react'

export function PageHead({ eyebrow, title, sub }) {
  return (
    <div className="ws-page-head">
      <div className="ws-eyebrow">{eyebrow}</div>
      <h1 className="ws-h1">{title}</h1>
      <p className="ws-sub" style={{ maxWidth: 640 }}>{sub}</p>
    </div>
  )
}

export function DomainForm({ onSubmit, loading, placeholder = 'example.com', buttonText = 'Run check' }) {
  const [value, setValue] = useState('')
  const submit = (e) => {
    e.preventDefault()
    const cleaned = value.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (cleaned) onSubmit(cleaned)
  }
  return (
    <form onSubmit={submit} className="ws-form-row">
      <input
        className="ws-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        spellCheck="false"
        autoCapitalize="none"
      />
      <button className="ws-btn-primary" disabled={loading} type="submit">
        {loading ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span className="ws-spinner" /> Checking…</span> : buttonText}
      </button>
    </form>
  )
}

const ICONS = { pass: '✓', warn: '!', fail: '✕', info: 'i' }

export function CheckRow({ status = 'info', title, detail, children }) {
  return (
    <div className="ws-check-row">
      <div className={'ws-check-icon ' + status}>{ICONS[status] || 'i'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
        {detail && <div className="ws-muted ws-small" style={{ marginTop: 2 }}>{detail}</div>}
        {children}
      </div>
    </div>
  )
}

export function ErrorAlert({ message }) {
  if (!message) return null
  return <div className="ws-alert ws-alert-red">{message}</div>
}

export async function callApi(path, options) {
  const res = await fetch(path, options)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')')
  return data
}
