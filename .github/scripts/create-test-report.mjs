import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const findReports = (directory) => {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? findReports(path) : name === 'test-results.json' ? [path] : []
  })
}

const reports = findReports('test-results').map((path) => {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const project = path.includes('frontend') ? 'frontend' : path.includes('backend') ? 'backend' : 'unknown'
  const failedTests = (data.testResults ?? []).flatMap((suite) =>
    (suite.assertionResults ?? [])
      .filter((test) => test.status === 'failed')
      .map((test) => test.fullName),
  )
  return {
    project,
    total: data.numTotalTests ?? 0,
    passed: data.numPassedTests ?? 0,
    failed: data.numFailedTests ?? 0,
    skipped: data.numPendingTests ?? 0,
    failedTests,
  }
})

const reportFor = (project) => reports.find((report) => report.project === project)
const projects = ['frontend', 'backend']
const totals = reports.reduce((result, report) => ({
  total: result.total + report.total,
  passed: result.passed + report.passed,
  failed: result.failed + report.failed,
  skipped: result.skipped + report.skipped,
}), { total: 0, passed: 0, failed: 0, skipped: 0 })
const successful = process.env.WORKFLOW_RESULT === 'success'

const rows = projects.map((project) => {
  const report = reportFor(project)
  if (!report) return `<tr><td>${project}</td><td colspan="4">結果を取得できませんでした</td></tr>`
  return `<tr><td>${project}</td><td>${report.total}</td><td>${report.passed}</td><td>${report.failed}</td><td>${report.skipped}</td></tr>`
}).join('')

const failures = reports.flatMap((report) => report.failedTests.map((name) => `<li><strong>${report.project}:</strong> ${escapeHtml(name)}</li>`))
const failureSection = failures.length ? `<h3>失敗したテスト</h3><ul>${failures.join('')}</ul>` : ''

const html = `<!doctype html>
<html lang="ja">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#243c49;line-height:1.6">
  <h2 style="color:${successful ? '#21836f' : '#c43f3f'}">Unit Tests: ${successful ? '成功' : '失敗'}</h2>
  <table style="border-collapse:collapse;min-width:480px">
    <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #dce9e6">対象</th><th style="padding:8px;border-bottom:2px solid #dce9e6">合計</th><th style="padding:8px;border-bottom:2px solid #dce9e6">成功</th><th style="padding:8px;border-bottom:2px solid #dce9e6">失敗</th><th style="padding:8px;border-bottom:2px solid #dce9e6">スキップ</th></tr></thead>
    <tbody>${rows}<tr style="font-weight:bold"><td style="padding:8px;border-top:1px solid #dce9e6">合計</td><td style="text-align:center;border-top:1px solid #dce9e6">${totals.total}</td><td style="text-align:center;border-top:1px solid #dce9e6">${totals.passed}</td><td style="text-align:center;border-top:1px solid #dce9e6">${totals.failed}</td><td style="text-align:center;border-top:1px solid #dce9e6">${totals.skipped}</td></tr></tbody>
  </table>
  ${failureSection}
  <p><strong>ブランチ:</strong> ${escapeHtml(process.env.BRANCH_NAME ?? '')}<br><strong>コミット:</strong> ${escapeHtml((process.env.COMMIT_SHA ?? '').slice(0, 7))}</p>
  <p><a href="${escapeHtml(process.env.RUN_URL ?? '')}">GitHub Actionsで詳細を確認</a></p>
</body>
</html>`

writeFileSync('test-report.html', html)
