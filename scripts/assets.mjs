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

// The carry-over bug did not just show yesterday's questions: the app re-stamped the carried
// session with the current date, so the corrupted session became indistinguishable from real
// progress and even a correct isValidSession accepts it. PLAN_VERSION is the app's own
// invalidation lever - bumping it retires every stored session on every device at once.
function patchPlanVersion(source) {
  const previous = "export const PLAN_VERSION = 'hard-vocab-live-v7';";
  const current = "export const PLAN_VERSION = 'hard-vocab-live-v8';";
  if (source.includes(current)) return source;
  if (source.includes(previous)) return source.replace(previous, current);
  throw new Error('Could not find PLAN_VERSION to invalidate carried-over sessions.');
}

// The rw_vocab source is a small, fixed external list (historically as few as 15 questions
// total). Once a user has permanently retired all of them, requiring exactly 5 fresh vocab
// picks every day throws "Not enough usable questions remain in rw_vocab" and blocks the app
// forever - the daily rollover fix above made this reachable by finally trying to build a real
// plan instead of endlessly recycling a stale one. Falling back to extra hard R&W questions for
// unavailable vocab slots keeps the app usable without ever repeating a retired question.
function patchVocabShortfall(source) {
  const oldValidate = "if(counts.rw_vocab!==5||counts.rw_hard!==25||counts.math_hard!==20)throw new Error('Daily plan mix mismatch.');";
  const newValidate = "if(counts.rw_vocab+counts.rw_hard!==30||counts.math_hard!==20)throw new Error('Daily plan mix mismatch.');";
  const oldBuild = "export function buildOrderedPlan(rawBuckets,{completed=[],blocked=[]}={}){const pools=buildCandidatePools(rawBuckets),completedSet=new Set(sanitizeIdArray(completed)),blockedSet=new Set(sanitizeIdArray(blocked)),used=new Set();const vocab=takeAvailable(pools.rw_vocab,5,RESERVE_COUNT,completedSet,blockedSet,used),reading=takeAvailable(pools.rw_hard,25,RESERVE_COUNT,completedSet,blockedSet,used),math=takeAvailable(pools.math_hard,20,RESERVE_COUNT,completedSet,blockedSet,used);const plan=[];let vi=0,ri=0,mi=0;for(let block=0;block<10;block+=1){if(block%2===0){plan.push(vocab.chosen[vi++],reading.chosen[ri++],reading.chosen[ri++])}else{plan.push(reading.chosen[ri++],reading.chosen[ri++],reading.chosen[ri++])}plan.push(math.chosen[mi++],math.chosen[mi++])}validatePlan(plan);return{plan,reserve:{rw_vocab:vocab.reserve,rw_hard:reading.reserve,math_hard:math.reserve}}}";
  const newBuild = "export function buildOrderedPlan(rawBuckets,{completed=[],blocked=[]}={}){const pools=buildCandidatePools(rawBuckets),completedSet=new Set(sanitizeIdArray(completed)),blockedSet=new Set(sanitizeIdArray(blocked)),used=new Set();const vocabPool=pools.rw_vocab.filter((item)=>!blockedSet.has(item.id)&&!used.has(item.id)&&!completedSet.has(item.id));const vocabCount=Math.min(5,vocabPool.length);const vocab=takeAvailable(pools.rw_vocab,vocabCount,RESERVE_COUNT,completedSet,blockedSet,used);const reading=takeAvailable(pools.rw_hard,25+(5-vocabCount),RESERVE_COUNT,completedSet,blockedSet,used);const math=takeAvailable(pools.math_hard,20,RESERVE_COUNT,completedSet,blockedSet,used);const combinedReading=[...vocab.chosen,...reading.chosen];const plan=[];let ci=0,mi=0;for(let block=0;block<10;block+=1){plan.push(combinedReading[ci++],combinedReading[ci++],combinedReading[ci++],math.chosen[mi++],math.chosen[mi++])}validatePlan(plan);return{plan,reserve:{rw_vocab:vocab.reserve,rw_hard:reading.reserve,math_hard:math.reserve}}}";

  if (source.includes(newBuild) && source.includes(newValidate)) return source;
  if (!source.includes(oldValidate)) throw new Error('Could not find validatePlan mix check to relax for vocab shortfall.');
  if (!source.includes(oldBuild)) throw new Error('Could not find buildOrderedPlan to patch for vocab shortfall.');
  return source.replace(oldValidate, newValidate).replace(oldBuild, newBuild);
}

// practice.css is re-scraped from production on every build, so a rule added directly to
// app/practice/practice.css would be silently wiped out the next time this script runs. Appended
// rules survive because they are re-added here every time, after the fetch, not edited in place.
function appendLoaderStyles(css) {
  const marker = '/* Daily Fifty custom loader */';
  if (css.includes(marker)) return css;
  const rules = `
${marker}
.df-loader { position: relative; width: 60px; height: 60px; margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; }
.df-loader-ring { width: 100%; height: 100%; animation: dfLoaderSpin 1.1s linear infinite; }
.df-loader-track { fill: none; stroke: rgba(236, 72, 153, 0.12); stroke-width: 5; }
.df-loader-arc { fill: none; stroke: url(#dailyFiftyLoaderGradient); stroke-width: 5; stroke-linecap: round; stroke-dasharray: 108 300; }
.df-loader-mark { position: absolute; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; color: #ec4899; }
@keyframes dfLoaderSpin { to { transform: rotate(360deg); } }
`;
  return `${css.trimEnd()}\n${rules}`;
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
const queue = patchVocabShortfall(patchPlanVersion(patchDailyRollover(patchQueue(rawQueue))));

await Promise.all([
  writeFile('public/practice-app.js', `${app}\n${addon.trim()}\n`),
  writeFile('public/queue.js', queue),
  writeFile('public/answers.js', answers),
  writeFile('app/home.css', homeCss),
  writeFile('app/practice/practice.css', appendLoaderStyles(practiceCss)),
]);

console.log('Shared database sync, no-repeat queue, and current styles snapshotted.');
