// Fetches the two brand typefaces (SIL Open Font License) from the google/fonts
// repository before build and dev, verifying a pinned SHA-256 for each file.
// Binary font files are not committed; this keeps the repository text-only and the
// build independent of Google Fonts' CSS service.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "fonts");

const FONTS = [
  {
    file: "sora-variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/sora/Sora%5Bwght%5D.ttf",
    sha256: "84ff7096ae3ec6c8be47d906d1a0ba4de7f2ce78c615275c77301964a316e16c",
  },
  {
    file: "manrope-variable.ttf",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/manrope/Manrope%5Bwght%5D.ttf",
    sha256: "3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6",
  },
];

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function present(path, sha256) {
  try {
    return hash(await readFile(path)) === sha256;
  } catch {
    return false;
  }
}

await mkdir(outDir, { recursive: true });

for (const font of FONTS) {
  const path = join(outDir, font.file);
  if (await present(path, font.sha256)) {
    continue;
  }
  const response = await fetch(font.url);
  if (!response.ok) {
    throw new Error(`Could not download ${font.file}: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = hash(bytes);
  if (actual !== font.sha256) {
    throw new Error(
      `${font.file} changed upstream (sha256 ${actual}); review the new file and update the pin.`,
    );
  }
  await writeFile(path, bytes);
  console.log(`fetched ${font.file} (${bytes.length} bytes)`);
}
