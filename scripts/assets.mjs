import { readFile, writeFile } from 'node:fs/promises';

const production = 'https://daily-fifty.vercel.app';

// The committed snapshots start out empty, so a fallback that returns an empty file just moves
// the failure somewhere less obvious. Only a snapshot with real content is worth falling back to.
async function fallbackText(fallbackPath, error) {
  if (process.env.VERCEL || !fallbackPath) throw error;
  const text = await readFile(fallbackPath, 'utf8').catch(() => '');
  if (!text.trim()) {
    throw new Error(
      `${error.message} No usable snapshot in ${fallbackPath}; run "npm run snapshot" with access to ${production} first.`,
    );
  }
  console.warn(`Using local snapshot ${fallbackPath}: ${error.message}`);
  return text;
}

async function getText(url, fallbackPath) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
    return await response.text();
  } catch (error) {
    return await fallbackText(fallbackPath, error);
  }
}

async function stylesheetFor(pathname, position, fallbackPath) {
  let html;
  try {
    const response = await fetch(`${production}${pathname}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${production}${pathname} returned ${response.status}.`);
    html = await response.text();
  } catch (error) {
    // The stylesheet name is hashed into the page, so without the HTML there is nothing to
    // resolve. Previously this fetch passed no fallbackPath and threw straight past the
    // snapshot, failing every offline build even though the CSS was already on disk.
    return await fallbackText(fallbackPath, error);
  }
  const hrefs = [...html.matchAll(/href="([^"]+\.css)"/g)].map((match) => match[1]);
  const href = position === 'first' ? hrefs[0] : hrefs.at(-1);
  if (!href) return await fallbackText(fallbackPath, new Error(`No stylesheet found for ${pathname}.`));
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

// isValidSession treated an unfinished session from an earlier day as still valid, so the app
// never rolled over to a new day: it kept serving yesterday's plan and yesterday's progress
// count until all 50 were completed. A daily set belongs to its own date, full stop.
function patchDailyRollover(source) {
  const carryOver = "if(session.date===date)return true;const answers=session.answers&&typeof session.answers==='object'?session.answers:{};const values=Object.values(answers);const hasProgress=values.some(answer=>answer&&typeof answer==='object'&&(answer.completed||answer.checked||answer.revealed||answer.selected||String(answer.input||'').trim()));const finished=values.filter(answer=>answer?.completed).length>=50;return hasProgress&&!finished}";
  const strictDate = "return session.date===date}";
  if (source.includes(carryOver)) return source.replace(carryOver, strictDate);
  if (source.includes(strictDate) && !source.includes('hasProgress&&!finished')) return source;
  throw new Error('Could not verify the daily rollover behavior in isValidSession.');
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
const queue = patchDailyRollover(patchQueue(rawQueue));

await Promise.all([
  writeFile('public/practice-app.js', `${app}\n${addon.trim()}\n`),
  writeFile('public/queue.js', queue),
  writeFile('public/answers.js', answers),
  writeFile('app/home.css', homeCss),
  writeFile('app/practice/practice.css', practiceCss),
]);

console.log('Shared database sync, no-repeat queue, and current styles snapshotted.');
