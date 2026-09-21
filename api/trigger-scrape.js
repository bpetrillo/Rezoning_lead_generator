/**
 * Vercel serverless function: triggers the "Scrape rezoning data" GitHub Actions
 * workflow (.github/workflows/scrape.yml) on demand, via GitHub's workflow_dispatch
 * API. This is what the app's "Refresh" button calls.
 *
 * WHY THIS EXISTS, NOT A DIRECT SCRAPE: running all 25 scrapers (some Playwright-based,
 * some fetching 90+ pages) directly inside this serverless function would almost
 * certainly exceed Vercel's execution time limits. GitHub Actions runners have no such
 * limit, so this function's only job is to ask GitHub to start that existing workflow
 * — the actual scraping happens over there, not here, over the next several minutes.
 *
 * REQUIRES a new environment variable in Vercel (Project Settings → Environment
 * Variables): GITHUB_PAT — a GitHub Personal Access Token with permission to trigger
 * workflows on this repo (classic token: "repo" scope; fine-grained token: "Actions:
 * write" on this repository). This is separate from the SUPABASE_SERVICE_ROLE_KEY
 * already set up for the geocode-address function — never exposed to the frontend,
 * used only here, server-side.
 */

const GITHUB_OWNER = 'bpetrillo'
const GITHUB_REPO = 'Rezoning_lead_generator'
const WORKFLOW_FILE = 'scrape.yml'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const token = process.env.GITHUB_PAT
  if (!token) {
    return res.status(500).json({ error: 'Server is missing the GITHUB_PAT environment variable.' })
  }

  try {
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    )

    if (dispatchRes.status === 204) {
      // GitHub's dispatch endpoint returns 204 No Content immediately — the workflow
      // run itself starts within a few seconds but isn't returned synchronously.
      return res.status(200).json({
        ok: true,
        message: 'Refresh started. This runs all 25 town scrapers on GitHub Actions and typically takes several minutes to finish — check the Actions tab on GitHub for live progress, or just check back here shortly.',
        actionsUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/actions`,
      })
    }

    // Anything other than 204 is a real failure — surface GitHub's own error text
    // rather than a generic message, since the cause (bad token, wrong scope, wrong
    // workflow filename) matters for fixing it.
    const errorBody = await dispatchRes.text()
    console.error(`GitHub workflow dispatch failed (${dispatchRes.status}):`, errorBody)
    return res.status(502).json({
      error: `GitHub declined the request (status ${dispatchRes.status}). This usually means the GITHUB_PAT token is missing, expired, or doesn't have permission to trigger workflows on this repo.`,
      details: errorBody,
    })
  } catch (err) {
    console.error('Failed to reach GitHub API:', err)
    return res.status(500).json({ error: 'Could not reach GitHub to trigger the workflow.', details: err.message })
  }
}
