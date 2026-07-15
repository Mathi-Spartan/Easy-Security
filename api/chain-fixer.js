import { X509Certificate } from 'node:crypto'
import { json, badRequest, fetchWithTimeout } from './_lib.js'

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } }

function extractPemBlocks(text) {
  const re = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g
  return (text.match(re) || [])
}

function toPem(der) {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n')
  return '-----BEGIN CERTIFICATE-----\n' + b64.trim() + '\n-----END CERTIFICATE-----'
}

function caIssuerUrls(cert) {
  // infoAccess is a text blob like: "CA Issuers - URI:http://... \nOCSP - URI:http://..."
  const ia = cert.infoAccess || ''
  const urls = []
  for (const line of ia.split('\n')) {
    const m = /CA Issuers - URI:(\S+)/.exec(line)
    if (m) urls.push(m[1])
  }
  return urls
}

function certSummary(cert, role) {
  return {
    role,
    subject: cert.subject.split('\n').find((l) => l.startsWith('CN=')) || cert.subject.split('\n')[0],
    issuer: cert.issuer.split('\n').find((l) => l.startsWith('CN=')) || cert.issuer.split('\n')[0],
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    expired: new Date(cert.validTo) < new Date(),
    selfSigned: cert.subject === cert.issuer
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'POST a JSON body: { "pem": "-----BEGIN CERTIFICATE-----..." }')

  let pemInput = ''
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    pemInput = String(body?.pem || '')
  } catch {
    return badRequest(res, 'Invalid JSON body.')
  }

  const blocks = extractPemBlocks(pemInput)
  if (!blocks.length) {
    return badRequest(res, 'No PEM certificate found. Paste a block starting with -----BEGIN CERTIFICATE-----. (Never paste a PRIVATE KEY here — we only need the certificate.)')
  }
  if (/PRIVATE KEY/.test(pemInput)) {
    return badRequest(res, 'Your paste contains a PRIVATE KEY. Remove it — the chain fixer only needs the certificate. Never share private keys with any online tool.')
  }

  let leaf
  try {
    leaf = new X509Certificate(blocks[0])
  } catch {
    return badRequest(res, 'The certificate could not be parsed. Make sure it is a complete, unmodified PEM block.')
  }

  const chain = [leaf]
  const notes = []
  let current = leaf
  let root = null

  for (let depth = 0; depth < 5; depth++) {
    if (current.subject === current.issuer) { root = current; break }
    const urls = caIssuerUrls(current)
    if (!urls.length) {
      notes.push('No AIA "CA Issuers" URL on ' + (certSummary(current).subject) + ' — chain building stopped here. The remaining issuer is likely a root already in trust stores.')
      break
    }
    let next = null
    for (const url of urls) {
      try {
        const r = await fetchWithTimeout(url, 8000, { headers: { 'User-Agent': 'CA-Tools-chain-fixer/1.0' } })
        if (!r.ok) continue
        const buf = Buffer.from(await r.arrayBuffer())
        const text = buf.toString('utf8')
        if (text.includes('BEGIN CERTIFICATE')) {
          next = new X509Certificate(extractPemBlocks(text)[0])
        } else if (text.startsWith('-----BEGIN PKCS7') || url.endsWith('.p7c') || url.endsWith('.p7b')) {
          notes.push('Issuer at ' + url + ' is a PKCS#7 bundle which this tool cannot unpack yet; chain may be incomplete.')
          continue
        } else {
          next = new X509Certificate(buf) // DER
        }
        break
      } catch {
        /* try next URL */
      }
    }
    if (!next) {
      notes.push('Could not download the issuer certificate for ' + certSummary(current).subject + '.')
      break
    }
    if (next.subject === next.issuer) {
      root = next
      break
    }
    chain.push(next)
    current = next
  }

  const intermediates = chain.slice(1)
  const fullchainPem = chain.map((c) => c.toString().trim()).join('\n')

  const summaries = [
    certSummary(leaf, 'Leaf (your certificate)'),
    ...intermediates.map((c) => certSummary(c, 'Intermediate')),
    ...(root ? [certSummary(root, 'Root (do NOT install on server)')] : [])
  ]

  const anyExpired = summaries.some((s) => s.expired)

  return json(res, 200, {
    summaries,
    intermediatesFound: intermediates.length,
    fullchainPem,
    rootPem: root ? root.toString().trim() : null,
    notes,
    verdict: anyExpired
      ? { level: 'fail', text: 'A certificate in this chain is EXPIRED. Reissue before installing.' }
      : intermediates.length === 0 && !root
        ? { level: 'warn', text: 'No intermediates could be fetched automatically. Your CA\'s download bundle should include them.' }
        : { level: 'pass', text: 'Chain built successfully. Install the full-chain bundle below (leaf + intermediates, root excluded).' },
    installNotes: {
      nginx: 'ssl_certificate /etc/ssl/fullchain.pem;   # the bundle below\nssl_certificate_key /etc/ssl/private.key;',
      apache: 'SSLCertificateFile /etc/ssl/fullchain.pem   # Apache 2.4.8+ accepts the full bundle in one file\nSSLCertificateKeyFile /etc/ssl/private.key',
      iis: 'Import the bundle via MMC → Certificates. Windows builds the chain from the intermediate store — import each intermediate into "Intermediate Certification Authorities".'
    }
  })
}
