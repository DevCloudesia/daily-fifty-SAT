import { writeFile } from 'node:fs/promises';

if (process.env.ALLOW_PRODUCTION_SNAPSHOT !== '1') {
  throw new Error(
    'Production snapshotting is a legacy recovery tool. Set ALLOW_PRODUCTION_SNAPSHOT=1 only after reading README.md and reviewing the production deployment.',
  );
}

const production = 'https://daily-fifty.vercel.app';
for (const file of ['practice-app.js', 'queue.js', 'answers.js']) {
  const response = await fetch(`${production}/${file}?snapshot=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${file} returned ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error(`${file} was empty`);
  await writeFile(`public/${file}`, text);
}
console.log('Updated public browser assets from production. Review the diff before committing.');
