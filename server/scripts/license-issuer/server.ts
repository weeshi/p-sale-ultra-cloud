#!/usr/bin/env node
/**
 * license-issuer/server.ts — LOCAL AIR-GAPPED LICENSE ISSUER (Web UI)
 *
 * A tiny Express server that runs ONLY on the admin's machine (127.0.0.1)
 * and exposes a friendly form to sign licenses with the Ed25519 private key —
 * a drop-in replacement for the sign-license.ts CLI.
 *
 * Security model (mirrors decision #12 in AGENTS.md):
 *   - Binds to localhost only (refuses to listen on a non-loopback host
 *     unless --host 0.0.0.0 is passed EXPLICITLY).
 *   - The private key is read from .keys/private_key.pem and never
 *     leaves this process.
 *   - No database access — nothing is written to any server; only an
 *     append-only local JSONL log (issued-licenses.log) for bookkeeping.
 *
 * Usage:
 *   npx tsx server/scripts/license-issuer/server.ts
 *   npx tsx server/scripts/license-issuer/server.ts --port 4444
 *   npx tsx server/scripts/license-issuer/server.ts --host 127.0.0.1 --port 4444
 *
 * Then open http://127.0.0.1:3333 in your browser.
 */

import express from 'express'
import helmet from 'helmet'
import path from 'path'
import fs from 'fs'
import {
  TIERS,
  TIER_LABELS_AR,
  TIER_FEATURES_DEFAULTS,
  keysExist,
  buildLicensePayload,
  signLicensePayload,
  verifySignedLicense,
  PRIVATE_KEY_PATH,
  PUBLIC_KEY_PATH,
  type LicenseSignOptions,
} from '../licenseLib'

const LOG_PATH = path.join(__dirname, 'issued-licenses.log')

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2)
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}

const HOST = getArg('host') || '127.0.0.1'
const PORT = parseInt(getArg('port') || process.env.PORT || '3333', 10)

function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

function appendLog(entry: unknown) {
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // Non-fatal — logging is best-effort.
  }
}

function validateIssueInput(body: any): { ok: true; options: LicenseSignOptions } | { ok: false; error: string } {
  const companyId = typeof body?.companyId === 'number' ? body.companyId : parseInt(body?.companyId || '', 10)
  if (!companyId || isNaN(companyId)) {
    return { ok: false, error: 'معرّف الشركة (companyId) مطلوب ويجب أن يكون رقماً' }
  }

  const hwHash = typeof body?.hwHash === 'string' ? body.hwHash.trim() : ''
  if (!hwHash) {
    return { ok: false, error: 'معرّف الجهاز (hwHash) مطلوب — احصل عليه من العميل عبر GET /api/license/machine-id' }
  }

  const tier = typeof body?.tier === 'string' ? body.tier : 'basic'
  if (!(TIERS as readonly string[]).includes(tier)) {
    return { ok: false, error: `المستوى يجب أن يكون أحد: trial, basic, pro, enterprise (استلمت: ${tier})` }
  }

  let expiresAt: string | null = null
  if (body?.expiresAt && typeof body.expiresAt === 'string' && body.expiresAt.trim()) {
    const d = new Date(body.expiresAt)
    if (isNaN(d.getTime())) {
      return { ok: false, error: 'تاريخ الانتهاء غير صالح' }
    }
    expiresAt = d.toISOString().slice(0, 10)
  }

  let maxUsers: number | null = null
  if (body?.maxUsers !== undefined && body?.maxUsers !== null && body?.maxUsers !== '') {
    maxUsers = parseInt(String(body.maxUsers), 10)
    if (isNaN(maxUsers) || maxUsers < 1) return { ok: false, error: 'الحد الأقصى للمستخدمين يجب أن يكون رقماً موجباً' }
  }

  let maxBranches: number | null = null
  if (body?.maxBranches !== undefined && body?.maxBranches !== null && body?.maxBranches !== '') {
    maxBranches = parseInt(String(body.maxBranches), 10)
    if (isNaN(maxBranches) || maxBranches < 1) return { ok: false, error: 'الحد الأقصى للفروع يجب أن يكون رقماً موجباً' }
  }

  let features: string[] = []
  if (Array.isArray(body?.features)) {
    features = (body.features as string[])
      .map((f) => String(f).trim())
      .filter(Boolean)
  }

  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

  return {
    ok: true,
    options: { companyId, hwHash, tier, expiresAt, features, maxUsers, maxBranches, notes },
  }
}

const app = express()
app.disable('x-powered-by')
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
)
app.use(express.json({ limit: '256kb' }))

// GET /api/status — key availability + tier metadata for the UI
app.get('/api/status', (_req, res) => {
  res.json({
    keys: keysExist(),
    privateKeyPath: PRIVATE_KEY_PATH,
    publicKeyPath: PUBLIC_KEY_PATH,
    tiers: TIERS,
    tierLabels: TIER_LABELS_AR,
    tierFeatures: TIER_FEATURES_DEFAULTS,
  })
})

// POST /api/issue — sign a license payload locally
app.post('/api/issue', (req, res) => {
  const check = validateIssueInput(req.body)
  if (!check.ok) return res.status(400).json({ error: check.error })

  try {
    const { payload, licenseKey } = buildLicensePayload(check.options)
    const { base64 } = signLicensePayload(payload)

    const parsed = JSON.parse(payload)
    appendLog({
      issuedAt: new Date().toISOString(),
      kind: 'ISSUE',
      companyId: check.options.companyId,
      tier: check.options.tier,
      licenseKey,
      expiresAt: check.options.expiresAt,
      maxUsers: check.options.maxUsers,
      maxBranches: check.options.maxBranches,
      features: parsed.features,
      notes: check.options.notes,
    })

    return res.json({ base64, payload, licenseKey })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'فشل توقيع الترخيص' })
  }
})

// POST /api/verify — locally verify a previously signed string (public key only)
app.post('/api/verify', (req, res) => {
  const base64 = typeof req.body?.base64 === 'string' ? req.body.base64.trim() : ''
  if (!base64) return res.status(400).json({ error: 'نص الترخيص مطلوب' })
  const result = verifySignedLicense(base64)
  return res.json(result)
})

// Static UI
app.use(express.static(path.join(__dirname, 'public')))

// Any other route → index.html (SPA-less single page convenience)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

if (!isLoopback(HOST)) {
  console.error(`❌ Refusing to bind to non-loopback host "${HOST}" — the private key must stay on this machine.`)
  console.error('   Re-run without --host, or explicitly pass --host 127.0.0.1')
  process.exit(1)
}

const server = app.listen(PORT, HOST, () => {
  console.log('🔐 P-Sale Ultra — License Issuer (LOCAL AIR-GAPPED TOOL)')
  console.log(`   Serving UI at: http://${HOST}:${PORT}`)
  const { private: priv, public: pub } = keysExist()
  console.log(`   Private key:  ${priv ? '✅ found' : '❌ MISSING'} (${PRIVATE_KEY_PATH})`)
  console.log(`   Public key:   ${pub ? '✅ found' : '❌ MISSING'} (${PUBLIC_KEY_PATH})`)
  console.log('\n   ⚠️  This tool runs on your machine only. The private key is never transmitted.')
  console.log('   Press Ctrl+C to stop.')
})

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Run with --port <other>`)
    process.exit(1)
  }
  throw err
})