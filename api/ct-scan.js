import { json, badRequest, cleanDomain, fetchWithTimeout } from './_lib.js'

// CA/Browser Forum SC-081v3 phases
const PHASES = [
  { from: '2026-03-15', maxDays: 200, dcvReuse: 200, label: '200-day era (current)' },
  { from: '2027-03-15', maxDays: 100, dcvReuse: 100, label: '100-day era' },
  { from: '2029-03-15', maxDays: 47, dcvReuse: 10, label: '47-day era' }
]

export default async function handler(req, res) {
  const domain = cleanDomain(req.query.domain)
  if (!domain) return badRequest(res, 'Please provide a valid domain, e.g. example.com')

  // Try crt.sh first, fall back to Cert Spotter (both are public CT indexes).
  let rows = null
  let source = 'crt.sh'
  try {
    const url = 'https://crt.sh/?q=' + encodeURIComponent('%.' + domain) + '&output=json&exclude=expired'
    const r = await fetchWithTimeout(url, 15000, {
      headers: { 'User-Agent': 'CA-Tools-47day-scanner/1.0' }
    })
    if (!r.ok) throw new Error('crt.sh returned ' + r.status)
    rows = await r.json()
  } catch {
    try {
      source = 'Cert Spotter'
      const url =
        'https://api.certspotter.com/v1/issuances?domain=' + encodeURIComponent(domain) +
        '&include_subdomains=true&expand=dns_names&expand=issuer'
      const r = await fetchWithTimeout(url, 15000, {
        headers: { 'User-Agent': 'CA-Tools-47day-scanner/1.0' }
      })
      if (!r.ok) throw new Error('certspotter returned ' + r.status)
      const issuances = await r.json()
      rows = (issuances || []).map((i) => ({
        serial_number: i.id,
        common_name: (i.dns_names && i.dns_names[0]) || domain,
        name_value: (i.dns_names || []).join('\n'),
        issuer_name: 'O=' + ((i.issuer && (i.issuer.friendly_name || i.issuer.name)) || 'Unknown'),
        not_before: i.not_before,
        not_after: i.not_after
      }))
    } catch {
      return json(res, 502, {
        error:
          'Certificate Transparency lookup failed — both crt.sh and Cert Spotter are busy or unreachable. ' +
          'Please try again in a minute.'
      })
    }
  }

  const now = Date.now()

  // Deduplicate: crt.sh returns pre-certs + leaf entries. Key on serial number.
  const bySerial = new Map()
  for (const row of rows || []) {
    const notAfter = Date.parse(row.not_after)
    if (isNaN(notAfter) || notAfter < now) continue
    const key = row.serial_number || row.id
    if (!bySerial.has(key)) {
      bySerial.set(key, {
        commonName: row.common_name,
        names: [...new Set(String(row.name_value || '').split('\n'))].filter(Boolean),
        issuer: parseIssuer(row.issuer_name),
        notBefore: row.not_before,
        notAfter: row.not_after,
        daysRemaining: Math.ceil((notAfter - now) / 86400000),
        validityDays: Math.round((notAfter - Date.parse(row.not_before)) / 86400000)
      })
    }
  }

  const certs = [...bySerial.values()].sort((a, b) => a.daysRemaining - b.daysRemaining)

  // Collapse to unique "endpoints" (distinct name sets) for burden math
  const uniqueNameSets = new Set(certs.map((c) => c.names.slice().sort().join(',')))
  const endpoints = Math.max(uniqueNameSets.size, certs.length ? 1 : 0)

  const longLived = certs.filter((c) => c.validityDays > 200).length
  const expiringSoon = certs.filter((c) => c.daysRemaining <= 30).length

  const burden = PHASES.map((p) => ({
    ...p,
    renewalsPerEndpointPerYear: Math.ceil(365 / p.maxDays),
    totalRenewalsPerYear: Math.ceil(365 / p.maxDays) * endpoints,
    dcvValidationsNote:
      p.dcvReuse <= 10
        ? 'Domain validation must be repeated for effectively every issuance (10-day reuse cap).'
        : 'Domain validation can be reused for up to ' + p.dcvReuse + ' days.'
  }))

  return json(res, 200, {
    domain,
    source,
    scannedAt: new Date().toISOString(),
    activeCertificates: certs.length,
    endpoints,
    longLivedGrandfathered: longLived,
    expiringWithin30Days: expiringSoon,
    certificates: certs.slice(0, 50),
    truncated: certs.length > 50,
    burden,
    verdict: buildVerdict(certs.length, endpoints, longLived)
  })
}

function parseIssuer(issuerName) {
  if (!issuerName) return 'Unknown'
  const m = /O=([^,]+)/.exec(issuerName)
  return m ? m[1].replace(/^"|"$/g, '') : issuerName
}

function buildVerdict(certCount, endpoints, longLived) {
  if (certCount === 0) {
    return {
      level: 'info',
      text: 'No unexpired certificates were found in public CT logs for this domain. Either it has no active TLS certificates or logging is delayed.'
    }
  }
  if (longLived > 0) {
    return {
      level: 'warn',
      text:
        longLived +
        ' certificate(s) still carry pre-March-2026 long validity. When these expire they can only be replaced with 200-day (soon 100-day) certificates — your renewal cadence is about to multiply. Automation is strongly recommended.'
    }
  }
  return {
    level: 'pass',
    text:
      'All active certificates already comply with the 200-day maximum. Expect ~' +
      Math.ceil(365 / 47) * endpoints +
      ' renewals per year across your endpoints once the 47-day era begins in March 2029 — verify your automation with the ACME Readiness Audit.'
  }
}
