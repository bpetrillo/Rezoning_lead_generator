/**
 * Runs the full daily pipeline in one command: all 7 town scrapers, both enrichment
 * scripts (owner info, location/acreage — both from Mecklenburg County's public
 * Polaris system), then the Excel backup export.
 *
 * Each step runs as its own child process (matching how they're already invoked
 * individually — `node scrapers/x/index.js`) rather than importing and calling them
 * in-process. This matters for the two Playwright-based scrapers (Charlotte, Matthews):
 * keeping each as a fully separate process means a browser instance from one scraper
 * can't leak into or interfere with another, and a hard crash in one step can't take
 * the whole run down with it.
 *
 * IMPORTANT: this keeps going even if a step fails, rather than stopping at the first
 * error. Charlotte (Akamai bot protection) and Matthews (bot protection generally) have
 * both had real, confirmed failures in the past that had nothing to do with the other
 * scrapers — a bad day for either one of those shouldn't prevent the other 5 towns, the
 * enrichment scripts, or the Excel backup from running. A summary at the end shows
 * exactly what succeeded and what didn't, and the process exits with a non-zero code
 * if anything failed (harmless for interactive use, but meaningful if this ever runs in
 * an automated context that checks exit codes).
 *
 * Expect this to take a while — Charlotte alone drives a real headless browser through
 * ~950 detail pages, and Matthews does the same for ~200. Total runtime is realistically
 * 10-20+ minutes, not a quick script.
 */

import { spawnSync } from 'child_process'

const STEPS = [
  { label: 'Charlotte', script: 'scrapers/charlotte/index.js' },
  { label: 'Mint Hill', script: 'scrapers/mint_hill/index.js' },
  { label: 'Matthews', script: 'scrapers/matthews/index.js' },
  { label: 'Pineville', script: 'scrapers/pineville/index.js' },
  { label: 'Huntersville', script: 'scrapers/huntersville/index.js' },
  { label: 'Cornelius', script: 'scrapers/cornelius/index.js' },
  { label: 'Davidson', script: 'scrapers/davidson/index.js' },
  { label: 'Owner enrichment', script: 'scripts/enrich-owner-info.js' },
  { label: 'Location/acreage enrichment', script: 'scripts/enrich-location-info.js' },
  { label: 'Excel export', script: 'scripts/export-to-excel.js' },
]

function runStep(script) {
  // stdio: 'inherit' — lets you watch each scraper's real output live, same as running
  // it individually, rather than swallowing it until the end.
  const result = spawnSync('node', [script], { stdio: 'inherit' })
  return result.status === 0
}

function main() {
  const results = []
  const overallStart = Date.now()

  for (const step of STEPS) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Running: ${step.label}`)
    console.log('='.repeat(60))

    const stepStart = Date.now()
    const success = runStep(step.script)
    const seconds = ((Date.now() - stepStart) / 1000).toFixed(1)

    results.push({ label: step.label, success, seconds })
    if (!success) {
      console.warn(`\n⚠️  ${step.label} failed after ${seconds}s — continuing with the next step anyway.`)
    }
  }

  const totalMinutes = ((Date.now() - overallStart) / 1000 / 60).toFixed(1)

  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log('='.repeat(60))
  for (const r of results) {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.label} (${r.seconds}s)`)
  }
  console.log(`\nTotal time: ${totalMinutes} minutes.`)

  const anyFailed = results.some((r) => !r.success)
  if (anyFailed) {
    console.log('\nOne or more steps failed — see the ❌ marks above. Everything else still ran.')
    process.exit(1)
  } else {
    console.log('\nAll steps completed successfully.')
  }
}

main()
