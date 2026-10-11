// Checks that the Docker image would contain every file the server needs. It follows each local
// import from server/server.js, directly and indirectly, and compares the files it finds with the
// COPY line in server/Dockerfile. A file that is imported but not copied would make the container
// fail the moment it starts. A file that is copied but never imported is reported too.
//
//   npm run check:docker
//
// This is a developer check that only reads files. It lives outside server/ and src/ because it
// uses node:fs, which the zero-data audit (rightly) flags in the code that ships.
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = join(root, "server");

const dockerfile = readFileSync(join(serverDir, "Dockerfile"), "utf8");
const copied = new Set(
  [...dockerfile.matchAll(/^COPY\s+(.+?)\s+\.\/\s*$/gm)]
    .flatMap((match) => match[1].split(/\s+/))
    .filter((name) => name.endsWith(".js")),
);

const needed = new Set();
const queue = ["server.js"];
while (queue.length) {
  const file = queue.pop();
  if (needed.has(file)) continue;
  needed.add(file);
  const source = readFileSync(join(serverDir, file), "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["']\.\/([A-Za-z0-9_.-]+\.js)["']/g)) queue.push(match[1]);
}

const missing = [...needed].filter((file) => !copied.has(file)).sort();
const unused = [...copied].filter((file) => !needed.has(file)).sort();

console.log(`server.js needs ${needed.size} files; the Dockerfile copies ${copied.size}.`);
if (missing.length) console.log(`FAIL  imported but not copied into the image: ${missing.join(", ")}`);
else console.log("PASS  every file the server imports is copied into the image");
if (unused.length) console.log(`WARN  copied but never imported: ${unused.join(", ")}`);
console.log(`(Dockerfile: ${relative(root, join(serverDir, "Dockerfile"))})`);
process.exit(missing.length ? 1 : 0);
