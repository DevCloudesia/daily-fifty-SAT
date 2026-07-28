import { copyFile, stat } from "node:fs/promises";
import { join } from "node:path";

const source = join(process.cwd(), "assets", "homepage.css");
const target = join(process.cwd(), "app", "globals.css");

const info = await stat(source);
if (info.size < 1000) {
  throw new Error(`Canonical homepage CSS is too small: ${info.size} bytes.`);
}

await copyFile(source, target);
console.log(`Restored ${info.size} bytes of canonical homepage CSS.`);
