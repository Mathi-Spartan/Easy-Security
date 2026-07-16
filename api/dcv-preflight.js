import dns from 'node:dns/promises'
import { json, badRequest, cleanDomain, withTimeout, fetchWithTimeout, parentDomains } from './_lib.js'

export default async function handler(req, res) {
  const domain = cleanDomain(req.query.domain)
  if (!domain) return badRequest(res, 'Please provide a valid domain, e.g. example.com')

  const checks = []

  // --- 1. DNS resolution -------------------------------------------------
  let hasA = false
  try {
    const [a, aaaa] = await Promise.allSettled([
      withTimeout(dns.resolve4(domain), 5000, 'A lookup'),
      withTimeout(dns.resolve6(domain), 5000, 'AAAA lookup')
    ])
    const ips = []
    if (a.status === 'fulfilled') ips.push(...a.value)
    if (aaaa.status === 'fulfilled') ips.push(...aaaa.value)
    hasA = ips.length > 0
    checks.push(
      hasA
        ? { id: 'dns', status: 'pass', title: 'Domain resolves', detail: 'Resolves to ' + ips.slice(0, 4).join(', ') + (ips.length > 4 ? ' …' : '') }
        : { id: 'dns', status: 'fail', title: 'Domain does not resolve', detail: 'No A or AAAA record found. HTTP validation is impossible until the domain resolves; DNS or email validation can still work.' }
    )
  } catch {
    checks.push({ id: 'dns', status: 'fail', title: 'DNS lookup failed', detail: 'The domain could not be resolved.' })
  }

  // --- 2. HTTP-01: port 80 reachability ----------------------------------
  if (hasA) {
    const probe = 'http://' + domain + '/.well-known/acme-challenge/ca-tools-preflight-probe'
    try {
      const r = await fetchWithTimeout(probe, 7000, { redirect: 'manual' })
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location') || ''
        checks.push({
          id: 'http01',
          status: loc.startsWith('https://') ? 'pass' : 'warn',
          title: 'Port 80 reachable (redirects)',
          detail: loc.startsWith('https://')
            ? 'Port 80 answers and redirects to HTTPS — HTTP-01 validation follows redirects, so this is fine.'
            : 'Port 80 answers but redirects to ' + (loc || 'an unexpected location') + '. Make sure /.well-known/acme-challenge/ is served before any redirect.'
        })
      } else {
        checks.push({
          id: 'http01',
          status: 'pass',
          title: 'Port 80 reachable',
          detail: 'The server answered on port 80 (HTTP ' + r.status + ' for a test path — a 404 here is expected and fine). HTTP-01 validation can work — but only if this server is yours. If you don’t control the machine at this IP, the CA’s challenge file can’t be placed there; use DNS validation instead.'
        })
      }
    } catch {
      checks.push({
        id: 'http01',
        status: 'fail',
        title: 'Port 80 unreachable',
        detail: 'No response on port 80 within 7s. HTTP file-based validation (HTTP-01) will fail. Open port 80 in your firewall/load balancer, or use DNS validation instead.'
      })
    }
  } else {
    checks.push({ id: 'http01', status: 'fail', title: 'HTTP validation not possible', detail: 'Domain does not resolve, so a validation server cannot be reached.' })
  }

  // --- 3. CAA records (walk up the tree) ----------------------------------
  let caaFound = null
  let caaOwner = null
  for (const d of parentDomains(domain)) {
    try {
      const records = await withTimeout(dns.resolveCaa(d), 5000, 'CAA lookup')
      if (records && records.length) {
        caaFound = records
        caaOwner = d
        break
      }
    } catch {
      /* ENODATA / ENOTFOUND — keep walking up */
    }
  }
  if (!caaFound) {
    checks.push({
      id: 'caa',
      status: 'pass',
      title: 'No CAA restrictions',
      detail: 'No CAA records exist anywhere in the domain tree, so any publicly trusted CA may issue for this domain.'
    })
  } else {
    const issuers = caaFound.filter((r) => r.issue || r.issuewild).map((r) => r.issue || r.issuewild)
    checks.push({
      id: 'caa',
      status: 'warn',
      title: 'CAA policy found on ' + caaOwner,
      detail:
        'Issuance is restricted to: ' + (issuers.join(', ') || '(none — issuance blocked!)') +
        '. If your chosen CA is not on this list, the order will fail. Update the CAA record before ordering.',
      issuers
    })
  }

  // --- 4. DNS-01 capability ----------------------------------------------
  try {
    const ns = await withTimeout(dns.resolveNs(parentDomains(domain).at(-1)), 5000, 'NS lookup')
    checks.push({
      id: 'dns01',
      status: 'pass',
      title: 'DNS validation available',
      detail: 'Nameservers: ' + ns.slice(0, 3).join(', ') + '. Add the TXT record the CA gives you at _acme-challenge.' + domain + ' (or the validation hostname your CA specifies).'
    })
  } catch {
    checks.push({ id: 'dns01', status: 'warn', title: 'Could not read nameservers', detail: 'NS lookup failed — DNS validation may still work, but verify your DNS hosting is responding.' })
  }

  // Existing _acme-challenge delegation?
  try {
    const cname = await withTimeout(dns.resolveCname('_acme-challenge.' + domain), 4000, 'CNAME lookup')
    if (cname && cname.length) {
      checks.push({
        id: 'delegation',
        status: 'info',
        title: 'Challenge delegation detected',
        detail: '_acme-challenge.' + domain + ' is a CNAME to ' + cname[0] + ' — DNS-01 challenges are delegated there. Ensure your automation updates that zone.'
      })
    }
  } catch { /* no delegation — normal */ }

  // --- 5. Email DCV -------------------------------------------------------
  try {
    const mxAll = await withTimeout(dns.resolveMx(domain), 5000, 'MX lookup')
    const mx = (mxAll || []).filter((m) => m.exchange && m.exchange !== '.' && m.exchange !== '')
    if (mxAll && mxAll.length && mx.length === 0) {
      checks.push({ id: 'email', status: 'warn', title: 'Email disabled (null MX)', detail: 'This domain publishes a null MX record (RFC 7505) — it explicitly does not accept mail. Email-based validation will not work; use HTTP or DNS validation.' })
    } else if (mx && mx.length) {
      checks.push({
        id: 'email',
        status: 'pass',
        title: 'Email validation possible',
        detail:
          'MX records exist (' + mx.sort((a, b) => a.priority - b.priority)[0].exchange + '). CAs send approval mail to admin@, administrator@, hostmaster@, postmaster@ or webmaster@' + domain + ' — make sure one of these mailboxes exists.'
      })
    } else {
      checks.push({ id: 'email', status: 'warn', title: 'No MX records', detail: 'Email-based validation will not work. Use HTTP or DNS validation.' })
    }
  } catch {
    checks.push({ id: 'email', status: 'warn', title: 'No MX records', detail: 'Email-based validation will not work. Use HTTP or DNS validation.' })
  }

  const fails = checks.filter((c) => c.status === 'fail').length
  const warns = checks.filter((c) => c.status === 'warn').length

  return json(res, 200, {
    domain,
    checks,
    summary:
      fails === 0 && warns === 0
        ? { level: 'pass', text: 'All validation methods look clear. Your certificate order should validate without issues.' }
        : fails === 0
          ? { level: 'warn', text: 'Validation should succeed, but review the warnings — especially CAA — before ordering.' }
          : { level: 'fail', text: 'At least one validation method will fail as configured. Fix the items below or choose a different validation method.' }
  })
}
