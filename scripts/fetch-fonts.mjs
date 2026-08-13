// Fetches the exact latin woff2 files the hub's three faces use, so the build
// stops depending on a live request to Google. Run once; the output is vendored.
import { mkdir, writeFile } from "node:fs/promises";

// A modern desktop UA, or the CSS API answers with ttf instead of woff2.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Exactly what fonts.ts asks next/font/google for today.
const FAMILIES = [
  { name: "Space Grotesk", slug: "space-grotesk", weights: [500, 700] },
  { name: "DM Sans", slug: "dm-sans", weights: [400, 500, 700] },
  { name: "JetBrains Mono", slug: "jetbrains-mono", weights: [400, 500] },
];

const OUT = process.argv[2];
await mkdir(OUT, { recursive: true });

/**
 * The latin @font-face block's woff2 URL for one family at one weight.
 *
 * `subsets: ["latin"]` in fonts.ts means only the block whose unicode-range
 * starts at U+0000-00FF is wanted — the others are latin-ext, vietnamese, etc.
 *
 * @param family - the Google Fonts family name.
 * @param weight - the numeric weight.
 * @returns the woff2 URL.
 */
async function latinUrl(family, weight) {
  const href =
    `https://fonts.googleapis.com/css2?family=` +
    `${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weight}` +
    `&display=swap`;
  const css = await (
    await fetch(href, { headers: { "User-Agent": UA } })
  ).text();

  // Blocks are emitted subset-by-subset; take the one whose range is plain latin.
  const blocks = css.split("@font-face").slice(1);
  const latin = blocks.find((b) => /unicode-range:\s*U\+0000-00FF\b/.test(b));
  if (!latin) throw new Error(`no latin block for ${family} ${weight}`);
  const url = latin.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!url) throw new Error(`no src url for ${family} ${weight}`);
  return url;
}

for (const { name, slug, weights } of FAMILIES) {
  for (const weight of weights) {
    const url = await latinUrl(name, weight);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const file = `${OUT}/${slug}-${weight}.woff2`;
    await writeFile(file, bytes);
    console.log(`${slug}-${weight}.woff2  ${bytes.length} bytes  <- ${url}`);
  }
}
