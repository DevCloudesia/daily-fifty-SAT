import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const cssDir = join(process.cwd(), '.next', 'static', 'css');
const files = (await readdir(cssDir)).filter((name) => name.endsWith('.css'));

if (!files.length) {
  throw new Error('Build produced no CSS bundles.');
}

let totalBytes = 0;
let homepageStylesFound = false;

for (const name of files) {
  const path = join(cssDir, name);
  const info = await stat(path);
  const content = await readFile(path, 'utf8');
  totalBytes += info.size;

  if (
    content.includes('.tropical-home') &&
    content.includes('.tropical-title') &&
    content.includes('.tropical-start')
  ) {
    homepageStylesFound = true;
  }
}

if (totalBytes < 1000) {
  throw new Error(`CSS bundles are suspiciously small: ${totalBytes} total bytes.`);
}

if (!homepageStylesFound) {
  throw new Error('Homepage styles are missing from the built CSS bundles.');
}

console.log(`Verified ${files.length} CSS bundle(s), ${totalBytes} total bytes, with homepage styles present.`);
