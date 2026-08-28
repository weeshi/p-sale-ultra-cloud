#!/usr/bin/env node
/**
 * generate-license-keys.ts
 * 
 * Generates Ed25519 key pair for the license system.
 * Outputs to: C:\Users\Weeshi\p-sale-ultra-cloud\.keys\
 * 
 * Usage:
 *   npx tsx server/scripts/generate-license-keys.ts
 * 
 * WARNING: This script should ONLY be run locally by the admin.
 *          The private_key.pem must NEVER be deployed to production.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const KEYS_DIR = path.resolve(__dirname, '../../.keys')
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private_key.pem')
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public_key.pem')

function main() {
  console.log('🔐 Generating Ed25519 key pair for P-Sale Ultra License System...')
  console.log(`   Keys directory: ${KEYS_DIR}`)

  // Create .keys directory if it doesn't exist
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true })
    console.log('✅ Created .keys/ directory')
  }

  // Check if keys already exist
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    console.log('\n⚠️  Keys already exist in .keys/ directory')
    console.log('   To regenerate, delete the existing files first:')
    console.log(`     rm "${PRIVATE_KEY_PATH}"`)
    console.log(`     rm "${PUBLIC_KEY_PATH}"`)
    process.exit(1)
  }

  // Generate Ed25519 key pair
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  // Write files
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 }) // Owner read/write only
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey)

  console.log('\n✅ Ed25519 key pair generated successfully!')
  console.log(`   Private key: ${PRIVATE_KEY_PATH}`)
  console.log(`   Public key:  ${PUBLIC_KEY_PATH}`)
  console.log('\n📋 Next steps:')
  console.log('   1. Add .keys/ to .gitignore (if not already present)')
  console.log('   2. Run: npx tsx server/scripts/sign-license.ts --help')
  console.log('   3. NEVER commit private_key.pem to any repository')
}

main()
