export const meta = {
  name: 'slice-and-verify',
  description: 'Run disjoint build slices in parallel git worktrees, then verify the merged result',
  whenToUse: 'Parallel feature work where each slice owns separate paths. args: {rules, slices:[{label,branch,owns,task}], verifyNote}',
  phases: [{ title: 'Build' }, { title: 'Verify' }],
}
const { rules = '', slices = [], verifyNote = '' } = args || {}
const BASE = `${rules}
Method: never edit the main checkout; create your own worktree 'git worktree add /home/vorte/code/_work/<name> -b <branch> main' and remove it when done. Never read or print .env or environment variables. Never commit sponsor data, data/raw|normalized|derived, assets, logs or large JSON. Do not push; do not merge. Small commits ending 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'. Return plain text under 400 words (what you built, what you ran verbatim on failure, branch, commits, blockers). Never claim something works unless you ran it.`
phase('Build')
const reports = await parallel(slices.map(s => () =>
  agent(`${BASE}\nBranch '${s.branch}'. You own ONLY: ${s.owns}.\n${s.task}`, { label: s.label, phase: 'Build' })))
phase('Verify')
const verify = await agent(`Merge these branches locally into 'verify/merged' and run all checks: ${slices.map(s => s.branch).join(', ')}. ${verifyNote}\nUnverified builder reports:\n${JSON.stringify(reports).slice(0, 10000)}`,
  { label: 'verify', phase: 'Verify', agentType: 'verifier' })
return { reports, verify }
