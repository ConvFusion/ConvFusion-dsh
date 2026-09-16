#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const hostPackages = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-util-values',
]

const failures = []

for (const name of hostPackages) {
  if (pkg.dependencies?.[name]) {
    failures.push(`${name} must not be in dependencies (it would install a second host runtime copy)`)
  }
  if (pkg.peerDependencies?.[name] !== '*') {
    failures.push(`${name} must be a \"*\" peerDependency so the active DSH host supplies it`)
  }
  if (!pkg.devDependencies?.[name]) {
    failures.push(`${name} must be mirrored in devDependencies for standalone builds`)
  }
  if (pkg.peerDependenciesMeta?.[name]?.optional) {
    failures.push(`${name} is required at runtime and must not be marked optional`)
  }
}

if (failures.length > 0) {
  console.error('Host dependency contract check failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log(`Host dependency contract OK (${hostPackages.length} shared DSH packages)`)
