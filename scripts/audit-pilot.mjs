// Read-only release audit. Print paths/rule names, never matched secret values.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const staged = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR');
const files = [...new Set([...git('ls-files', '-z'), ...git('ls-files', '--others', '--exclude-standard', '-z')])];
const findings = [];
const secrets = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['provider-key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['google-key', /\bAIza[A-Za-z0-9_-]{30,}/],
  ['aws-access-key', /\bAKIA[A-Z0-9]{16}\b/],
];
for (const file of files) {
  if (/(?:^|\/)(?:\.env(?:\..*)?|auth\.json|credentials\.json)$/.test(file) && !file.endsWith('.env.example')) findings.push({ file, rule: 'credential-file' });
  const full = path.join(root, file);
  if (!existsSync(full) || !statSync(full).isFile() || !/\.(?:m?js|cjs|json|md|html|css|ya?ml|txt|log|py|bat)$/.test(file)) continue;
  const content = readFileSync(full, 'utf8');
  for (const [rule, regex] of secrets) if (regex.test(content)) findings.push({ file, rule });
  const runtime = /^(?:src|api|pilot|scripts|tests)\//.test(file);
  if (runtime && /[A-Za-z]:[/\\](?:Users|Program Files)|\/Users\/|\/home\/[^\s/]+\//.test(content)) findings.push({ file, rule: 'machine-absolute-path' });
}
for (const file of staged) if (/^(?:dist|node_modules|qa-artifacts|\.vercel|\.pilot-deploy)\//.test(file)) findings.push({ file, rule: 'local-artifact-staged' });
console.log(JSON.stringify({ checkedFiles: files.length, stagedFiles: staged.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
