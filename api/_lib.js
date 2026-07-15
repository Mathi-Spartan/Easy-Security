// Shared helpers for API functions (Vercel Node runtime)

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

export function badRequest(res, message) {
  return json(res, 400, { error: message })
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

export function cleanDomain(input) {
  if (!input || typeof input !== 'string') return null
  const d = input.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
  return DOMAIN_RE.test(d) ? d : null
}

export function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms)
    )
  ])
}

export async function fetchWithTimeout(url, ms, options = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// Walk labels upward: sub.a.example.com -> a.example.com -> example.com
export function parentDomains(domain) {
  const parts = domain.split('.')
  const out = []
  for (let i = 0; i < parts.length - 1; i++) {
    out.push(parts.slice(i).join('.'))
  }
  return out
}
