import dns from 'node:dns/promises'
import { json, badRequest, cleanDomain, withTimeout, fetchWithTimeout, parentDomains } from './_lib.js'

const PROVIDERS = [
  { match: /cloudflare\.com$/, name: 'Cloudflare', api: true, acmesh: 'dns_cf', envs: ['CF_Token'], note: 'Full API. Cloudflare also offers free automatic edge certificates.' },
  { match: /awsdns/, name: 'Amazon Route 53', api: true, acmesh: 'dns_aws', envs: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], note: 'Full API; cert-manager and certbot-dns-route53 both supported.' },
  { match: /domaincontrol\.com$/, name: 'GoDaddy', api: true, acmesh: 'dns_gd', envs: ['GD_Key', 'GD_Secret'], note: 'API available (production API keys require an eligible account).' },
  { match: /registrar-servers\.com$/, name: 'Namecheap', api: true, acmesh: 'dns_namecheap', envs: ['NAMECHEAP_API_KEY', 'NAMECHEAP_USERNAME'], note: 'API requires whitelisted source IP.' },
  { match: /googledomains\.com$|google\.com$/, name: 'Google Cloud DNS', api: true, acmesh: 'dns_gcloud', envs: ['CLOUDSDK_AUTH'], note: 'Full API via gcloud service account.' },
  { match: /azure-dns/, name: 'Azure DNS', api: true, acmesh: 'dns_azure', envs: ['AZUREDNS_SUBSCRIPTIONID', 'AZUREDNS_TENANTID'], note: 'Full API via service principal.' },
  { match: /digitalocean\.com$/, name: 'DigitalOcean', api: true, acmesh: 'dns_dgon', envs: ['DO_API_KEY'], note: 'Full API.' },
  { match: /vercel-dns\.com$/, name: 'Vercel DNS', api: true, acmesh: null, envs: [], note: 'Vercel issues and renews certificates automatically for domains it serves — you may not need ACME at all.' },
  { match: /ns\.hostinger|dns-parking/, name: 'Hostinger', api: false, acmesh: null, envs: [], note: 'No public DNS API — use HTTP-01 validation or delegate _acme-challenge via CNAME to an API-capable zone.' },
  { match: /wixdns/, name: 'Wix', api: false, acmesh: null, envs: [], note: 'Managed platform; certificates are handled by Wix itself.' },
  { match: /squarespacedns/, name: 'Squarespace', api: false, acmesh: null, envs: [], note: 'Managed platform; certificates are handled by Squarespace itself.' }
]

export default async function handler(req, res) {
  const domain = cleanDomain(req.query.domain)
  if (!domain) return badRequest(res, 'Please provide a valid domain, e.g. example.com')
  const wildcard = req.query.wildcard === '1'

  const apex = parentDomains(domain).at(-1)
  const checks = []

  // --- Nameservers / provider ------------------------------------------
  let provider = null
  let nsList = []
  try {
    nsList = await withTimeout(dns.resolveNs(apex), 6000, 'NS lookup')
    provider = PROVIDERS.find((p) => nsList.some((ns) => p.match.test(ns.toLowerCase()))) || null
    checks.push({
      id: 'ns',
      status: provider ? (provider.api ? 'pass' : 'warn') : 'info',
      title: provider ? 'DNS provider: ' + provider.name : 'DNS provider not recognized',
      detail: provider
        ? provider.note + ' (' + nsList[0] + ')'
        : 'Nameservers: ' + nsList.slice(0, 3).join(', ') + '. Check whether your provider offers a DNS API — if not, use HTTP-01 or CNAME delegation.'
    })
  } catch {
    checks.push({ id: 'ns', status: 'fail', title: 'Nameserver lookup failed', detail: 'Could not read NS records for ' + apex + '.' })
  }

  // --- CAA ----------------------------------------------------------------
  let caaIssuers = null
  for (const d of parentDomains(domain)) {
    try {
      const records = await withTimeout(dns.resolveCaa(d), 5000, 'CAA lookup')
      if (records && records.length) {
        caaIssuers = records.filter((r) => r.issue || r.issuewild).map((r) => r.issue || r.issuewild)
        checks.push({
          id: 'caa',
          status: 'warn',
          title: 'CAA restricts issuance (' + d + ')',
          detail: 'Allowed CAs: ' + (caaIssuers.join(', ') || 'none — issuance fully blocked!') + '. Your ACME CA must be on this list.'
        })
        break
      }
    } catch { /* keep walking */ }
  }
  if (caaIssuers === null) {
    checks.push({ id: 'caa', status: 'pass', title: 'No CAA restrictions', detail: 'Any publicly trusted CA can issue — no CAA changes needed for automation.' })
  }

  // --- _acme-challenge delegation ----------------------------------------
  try {
    const cname = await withTimeout(dns.resolveCname('_acme-challenge.' + domain), 4000, 'CNAME lookup')
    if (cname?.length) {
      checks.push({
        id: 'delegation',
        status: 'pass',
        title: 'DNS-01 delegation in place',
        detail: '_acme-challenge.' + domain + ' → ' + cname[0] + '. Great pattern: your automation only needs API access to the delegated zone.'
      })
    }
  } catch {
    checks.push({
      id: 'delegation',
      status: 'info',
      title: 'No challenge delegation (optional)',
      detail: 'If your DNS host has no API, delegate _acme-challenge.' + domain + ' via CNAME to a zone you can automate (e.g. a free Cloudflare zone). acme.sh supports this natively.'
    })
  }

  // --- Port 80 for HTTP-01 -------------------------------------------------
  let port80 = false
  try {
    await fetchWithTimeout('http://' + domain + '/.well-known/acme-challenge/ca-tools-audit', 7000, { redirect: 'manual' })
    port80 = true
    checks.push({ id: 'http', status: 'pass', title: 'Port 80 reachable', detail: 'HTTP-01 automation (certbot --webroot / --standalone, Caddy, Traefik) is available.' })
  } catch {
    checks.push({ id: 'http', status: wildcard ? 'info' : 'warn', title: 'Port 80 unreachable', detail: wildcard ? 'Not needed — wildcard certificates require DNS-01 anyway.' : 'HTTP-01 automation unavailable. Use DNS-01, or open port 80.' })
  }

  if (wildcard) {
    checks.push({ id: 'wildcard', status: 'info', title: 'Wildcard requested', detail: 'Wildcard certificates can ONLY be validated via DNS-01. A DNS API (or CNAME delegation) is mandatory.' })
  }

  // --- Score ----------------------------------------------------------------
  const apiReady = !!provider?.api
  const score = apiReady && port80 ? 'A' : apiReady || port80 ? 'B' : 'C'
  const scoreText = {
    A: 'Fully automatable — both DNS-01 and HTTP-01 paths are open. You are ready for 47-day renewal cycles.',
    B: 'Automatable with one path available. Set it up now; renewal volume roughly doubles every phase of the CA/B Forum timeline.',
    C: 'Automation is currently blocked. Fix DNS API access or port 80 — manual renewals will not survive the 100-day era starting March 2027.'
  }[score]

  // --- Generated commands ----------------------------------------------------
  const commands = []
  if (provider?.acmesh) {
    commands.push({
      title: 'acme.sh with ' + provider.name + ' DNS API',
      code: [
        '# one-time: export your ' + provider.name + ' credentials',
        ...provider.envs.map((e) => 'export ' + e + '="…"'),
        '',
        'acme.sh --issue --dns ' + provider.acmesh + ' \\',
        '  -d ' + domain + (wildcard ? ' -d "*.' + domain + '"' : '') + ' \\',
        '  --server letsencrypt   # or your ACME-enabled commercial CA endpoint'
      ].join('\n')
    })
  }
  if (port80) {
    commands.push({
      title: 'certbot with webroot (HTTP-01)',
      code: [
        'sudo certbot certonly --webroot \\',
        '  -w /var/www/html \\',
        '  -d ' + domain + ' \\',
        '  --deploy-hook "systemctl reload nginx"'
      ].join('\n')
    })
  }
  commands.push({
    title: 'DNS-01 via CNAME delegation (works with ANY DNS host)',
    code: [
      '# 1. Create a zone you can automate (e.g. acme.yourcompany.com on Cloudflare)',
      '# 2. Add at your current DNS host:',
      '_acme-challenge.' + domain + '  CNAME  ' + domain.replace(/\./g, '-') + '.acme.yourcompany.com',
      '# 3. Then:',
      'acme.sh --issue --dns dns_cf -d ' + domain + ' --challenge-alias acme.yourcompany.com'
    ].join('\n')
  })

  return json(res, 200, { domain, wildcard, checks, score, scoreText, commands })
}
