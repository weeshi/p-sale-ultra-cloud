#!/usr/bin/env node
/**
 * sign-license.ts — OFFLINE AIR-GAPPED CLI
 *
 * Signs a license payload using the Ed25519 private key.
 * This script runs ONLY on the admin's local machine.
 * The private key NEVER touches the production server.
 *
 * Usage:
 *   npx tsx server/scripts/sign-license.ts \
 *     --companyId 1 \
 *     --hwHash <SERVER_HW_HASH> \
 *     --tier pro \
 *     --expiresAt 2027-12-31 \
 *     --features "sales,purchases,inventory,accounting" \
 *     --maxUsers 5 \
 *     --maxBranches 3
 *
 * The admin obtains --hwHash by visiting: GET /api/license/machine-id
 *
 * Output: Base64-encoded signed license string to paste into /api/license/activate
 */

import fs from 'fs'
import { PRIVATE_KEY_PATH, buildLicensePayload, signLicensePayload, getDefaultFeatures } from './licenseLib'

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`)
    return idx !== -1 ? args[idx + 1] : undefined
  }

  const companyId = parseInt(get('companyId') || '', 10)
  const hwHash = get('hwHash')
  const tier = get('tier') || 'basic'
  const expiresAt = get('expiresAt') || null
  const featuresStr = get('features') || ''
  const maxUsers = get('maxUsers') ? parseInt(get('maxUsers')!, 10) : null
  const maxBranches = get('maxBranches') ? parseInt(get('maxBranches')!, 10) : null
  const notes = get('notes') || null

  // Validation
  if (!companyId || isNaN(companyId)) {
    console.error('❌ Error: --companyId is required and must be a number')
    process.exit(1)
  }
  if (!hwHash) {
    console.error('❌ Error: --hwHash is required')
    console.error('   Get it from: GET /api/license/machine-id')
    process.exit(1)
  }
  if (!['trial', 'basic', 'pro', 'enterprise'].includes(tier)) {
    console.error(`❌ Error: --tier must be one of: trial, basic, pro, enterprise (got: ${tier})`)
    process.exit(1)
  }

  const features = featuresStr
    ? featuresStr.split(',').map((f) => f.trim()).filter(Boolean)
    : []

  return { companyId, hwHash, tier, expiresAt, features, maxUsers, maxBranches, notes }
}

function main() {
  console.log('🔐 P-Sale Ultra — License Signing CLI (OFFLINE)')
  console.log('   This tool signs license keys using the Ed25519 private key.\n')

  // Check private key exists
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`❌ Private key not found: ${PRIVATE_KEY_PATH}`)
    console.error('   Run: npx tsx server/scripts/generate-license-keys.ts')
    process.exit(1)
  }

  const options = parseArgs()

  // Build license payload
  const { payload, licenseKey } = buildLicensePayload(options)

  // Sign with private key
  const { base64: encoded } = signLicensePayload(payload)

  console.log('✅ License signed successfully!\n')
  console.log('📋 License Details:')
  console.log(`   Company ID:  ${options.companyId}`)
  console.log(`   License Key: ${licenseKey}`)
  console.log(`   Tier:        ${options.tier}`)
  console.log(`   Expires:     ${options.expiresAt || 'Never (perpetual)'}`)
  console.log(`   HW Hash:     ${options.hwHash}`)
  console.log(`   Features:    ${payload.includes('"*"') ? 'All (enterprise)' : options.features.join(', ')}`)
  console.log('')
  console.log('🔑 Signed License String (Base64):')
  console.log('   Send this to the customer to activate via /api/license/activate')
  console.log('')
  console.log(encoded)
  console.log('')
  console.log('--- Copy everything between the lines above ---')
}

main()
