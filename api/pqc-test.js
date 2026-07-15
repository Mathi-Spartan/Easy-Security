import tls from 'node:tls'
import { json, badRequest, cleanDomain } from './_lib.js'

function tlsProbe(host, opts = {}) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: false,
        timeout: 8000,
        ...opts
      },
      () => {
        const cert = socket.getPeerCertificate(false)
        const result = {
          protocol: socket.getProtocol(),
          cipher: socket.getCipher(),
          ephemeral: socket.getEphemeralKeyInfo ? socket.getEphemeralKeyInfo() : null,
          cert: cert && cert.subject
            ? {
                subjectCN: cert.subject.CN || null,
                issuer: cert.issuer ? cert.issuer.O || cert.issuer.CN : null,
                validTo: cert.valid_to,
                keyType: cert.asn1Curve ? 'EC (' + cert.asn1Curve + ')' : cert.pubkey ? 'RSA' : cert.bits ? 'RSA' : 'Unknown',
                keyBits: cert.bits || null,
                sigAlg: cert.sigalg || null
              }
            : null
        }
        socket.end()
        resolve(result)
      }
    )
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timed out')) })
    socket.on('error', (e) => reject(e))
  })
}

export default async function handler(req, res) {
  const host = cleanDomain(req.query.domain)
  if (!host) return badRequest(res, 'Please provide a valid hostname, e.g. example.com')

  // Baseline handshake
  let base
  try {
    base = await tlsProbe(host)
  } catch (e) {
    return json(res, 502, { error: 'Could not establish a TLS connection to ' + host + ':443 — ' + e.message })
  }

  // Attempt hybrid post-quantum key exchange. Group name support depends on
  // the OpenSSL version in the runtime; try the known names and degrade
  // gracefully if the client itself doesn't support them.
  const pqGroups = ['X25519MLKEM768', 'x25519_kyber768']
  let pqc = { tested: false, supported: null, group: null, note: null }
  for (const group of pqGroups) {
    try {
      const r = await tlsProbe(host, { ecdhCurve: group })
      pqc = {
        tested: true,
        supported: true,
        group,
        note: 'Server completed a TLS 1.3 handshake using the hybrid post-quantum group ' + group + '.'
      }
      break
    } catch (e) {
      const msg = String(e.message || '')
      if (/unsupported|invalid|unknown|no such/i.test(msg) && /group|curve/i.test(msg)) {
        // Our runtime can't offer this group — inconclusive, try next / fall through
        pqc = {
          tested: false,
          supported: null,
          group: null,
          note: 'The test runtime does not support offering hybrid PQC groups, so PQC key exchange could not be probed directly. Grade below is inferred from protocol and key algorithm.'
        }
      } else {
        // Runtime offered it, server refused → not supported
        pqc = {
          tested: true,
          supported: false,
          group,
          note: 'Server did not accept a handshake restricted to hybrid post-quantum key exchange (' + group + ').'
        }
        break
      }
    }
  }

  // Grading
  const protocol = base.protocol || 'unknown'
  const keyBits = base.cert?.keyBits || 0
  const isEC = (base.cert?.keyType || '').startsWith('EC')
  let grade, gradeNote
  if (pqc.supported === true) {
    grade = 'A'
    gradeNote = 'Hybrid post-quantum key exchange is live. Session keys are protected against harvest-now-decrypt-later attacks.'
  } else if (protocol === 'TLSv1.3') {
    grade = 'B'
    gradeNote = 'Modern TLS 1.3, but no confirmed post-quantum key exchange. Enable X25519MLKEM768 on your server/CDN — most major providers already support it.'
  } else if (protocol === 'TLSv1.2') {
    grade = 'C'
    gradeNote = 'TLS 1.2 only. Post-quantum key exchange requires TLS 1.3 — upgrade your TLS stack first.'
  } else {
    grade = 'D'
    gradeNote = 'Legacy TLS configuration detected. Upgrade urgently: this configuration predates modern key-exchange security.'
  }

  const quantumVulnerableAuth = true // all classical certs (RSA/ECDSA) are quantum-vulnerable for signatures
  const authNote = isEC
    ? 'Certificate uses ECDSA (' + (base.cert?.keyType || 'EC') + '). Like RSA, ECDSA signatures are quantum-vulnerable; NIST timelines deprecate classical algorithms by 2030 and disallow them by 2035. Certificate authentication will migrate via CA-issued PQC certificates — your job is crypto-agility (fast, automated rotation).'
    : 'Certificate uses RSA' + (keyBits ? ' ' + keyBits + '-bit' : '') + '. RSA signatures are quantum-vulnerable; NIST timelines deprecate classical algorithms by 2030 and disallow them by 2035. Certificate authentication will migrate via CA-issued PQC certificates — your job is crypto-agility (fast, automated rotation).'

  return json(res, 200, {
    host,
    grade,
    gradeNote,
    handshake: {
      protocol,
      cipher: base.cipher?.name || null,
      keyExchange: base.ephemeral ? (base.ephemeral.name || base.ephemeral.type) : null
    },
    certificate: base.cert,
    pqc,
    authNote,
    quantumVulnerableAuth
  })
}
