import { readFile, writeFile } from 'node:fs/promises';

const production = 'https://daily-fifty.vercel.app';

async function getText(url, fallbackPath) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.text();
  } catch (error) {
    if (process.env.VERCEL || !fallbackPath) throw error;
    return await readFile(fallbackPath, 'utf8');
  }
}

async function stylesheetFor(pathname, position, fallbackPath) {
  const html = await getText(`${production}${pathname}`);
  const hrefs = [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);
  const href = position === 'first' ? hrefs[0] : hrefs.at(-1);
  if (!href) throw new Error(`No stylesheet found for ${pathname}.`);
  return await getText(new URL(href, production).href, fallbackPath);
}

function stripAddon(text, marker) {
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(0, index).trimEnd() : text.trimEnd();
}

function patchQueue(source) {
  const oldFallback = "const unseen=clean.filter((item)=>!excluded.has(item.id));const previouslyCompleted=clean.filter((item)=>excluded.has(item.id));const available=[...unseen,...previouslyCompleted];";
  const strictPool = "const available=clean.filter((item)=>!excluded.has(item.id));";
  if (source.includes(oldFallback)) return source.replace(oldFallback, strictPool);
  if (source.includes(strictPool) && !source.includes('previouslyCompleted')) return source;
  throw new Error('Could not verify the permanent no-repeat queue behavior.');
}

const [rawApp, rawQueue, answers, homeCss, practiceCss, addon] = await Promise.all([
  getText(`${production}/practice-app.js`, 'public/practice-app.js'),
  getText(`${production}/queue.js`, 'public/queue.js'),
  getText(`${production}/answers.js`, 'public/answers.js'),
  stylesheetFor('/', 'first', 'app/home.css'),
  stylesheetFor('/practice', 'last', 'app/practice/practice.css'),
  readFile('no-repeat-addon.js', 'utf8'),
]);

const app = stripAddon(rawApp, '// Daily Fifty retired-question migration.');
const queue = patchQueue(rawQueue);

await Promise.all([
  writeFile('public/practice-app.js', `${app}\n${addon.trim()}\n`),
  writeFile('public/queue.js', queue),
  writeFile('public/answers.js', answers),
  writeFile('app/home.css', homeCss),
  writeFile('app/practice/practice.css', practiceCss),
]);

console.log('Shared database sync, no-repeat queue, and current styles snapshotted.');
