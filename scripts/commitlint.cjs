const msg = require('fs').readFileSync(process.argv[2], 'utf-8').trim();

const commitRE =
  /^(.+ )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore|types|release)(\(.+\))?: .{1,100}/;

if (!commitRE.test(msg)) {
  console.error(`
Error: invalid commit message format:

  ${msg}
`);
  process.exit(1);
}
