import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('repository documentation names the canonical practice sources', async () => {
  const [readme, agents, architecture] = await Promise.all([
    read('README.md'),
    read('AGENTS.md'),
    read('docs/ARCHITECTURE.md'),
  ]);
  for (const source of [readme, agents, architecture]) {
    assert.ok(source.includes('app/practice/practice.css'));
    assert.ok(source.includes('app/practice/page.js'));
    assert.ok(source.includes('public/practice-app.js'));
  }
  assert.ok(readme.includes('The committed repository is the source of truth'));
  assert.ok(agents.includes('Never edit `.next`'));
  assert.ok(architecture.includes('Do not scrape CSS from production'));
});

test('legacy production snapshotting is explicit and cannot copy CSS', async () => {
  const [pkgSource, snapshot] = await Promise.all([
    read('package.json'),
    read('scripts/snapshot-production.mjs'),
  ]);
  const pkg = JSON.parse(pkgSource);
  assert.equal(pkg.scripts.snapshot, undefined);
  assert.equal(pkg.scripts['snapshot:legacy'], 'node scripts/snapshot-production.mjs');
  assert.ok(snapshot.includes("process.env.ALLOW_PRODUCTION_SNAPSHOT !== '1'"));
  assert.equal(snapshot.includes('practice.css'), false);
});

test('GitHub pull requests run tests and the complete production build', async () => {
  const [workflow, template] = await Promise.all([
    read('.github/workflows/ci.yml'),
    read('.github/pull_request_template.md'),
  ]);
  assert.ok(workflow.includes('pull_request:'));
  assert.ok(workflow.includes('run: npm test'));
  assert.ok(workflow.includes('run: npm run build'));
  assert.ok(template.includes('app/practice/practice.css'));
  assert.ok(template.includes('Promote the exact verified deployment'));
});
