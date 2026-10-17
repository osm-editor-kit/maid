// Builds the Maid logo from the osmberlin OSM logo (docs/logo/source/) and writes it into each app:
// apps/<app>/src/brand/logo.svg (the tile, 300 x 285) and favicon.svg (the same, on a square canvas).
// Run: bun run logo-build
//
// Every shape that is not named as new below is copied verbatim from
// source/osm-openstreetmap-logo-2025.svg.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = import.meta.dir;
const ROOT = join(OUT, "../..");

// --- From the source files, unchanged ---------------------------------------

const BASE = readFileSync(join(OUT, "source/osm-openstreetmap-logo-2025.svg"), "utf8");
// The d attribute of the element with this id, verbatim
const d = (svg: string, id: string) => {
  const m = svg.match(new RegExp(`id="${id}" d="([^"]+)"`));
  if (!m) throw new Error(`no path ${id}`);
  return m[1];
};

const TILE = d(BASE, "Karte_grün");
const GREENS = ["path3", "path4", "path5", "path6"].map((id) => d(BASE, id));
const WATER = d(BASE, "Wasser");
const ROAD = d(BASE, "AZ");

// --- New for Maid ------------------------------------------------------------

type Fork = "maid" | "bicycle" | "parking";
const FORKS: Fork[] = ["maid", "bicycle", "parking"];
// The lane colours: cycle lanes and parking lanes (the blue of the Parkraum lens). maid has none.
const ACCENT: Record<Fork, string> = { maid: "#f6634f", bicycle: "#0d8f6f", parking: "#376feb" };
const VERTEX = 'fill="#fff" stroke="#222"';

// Points on ROAD every 60 units of length, measured with getPointAtLength, rounded.
const ROAD_VERTICES = [
  [50.2, 34.5],
  [73.7, 78.8],
  [59.2, 113.3],
  [66, 167.5],
  [101.1, 213.5],
  [127.5, 246.9],
  [174.4, 228],
  [218.4, 223.9],
  [216.6, 164.4],
  [257.6, 122.5],
];
const TIP = ROAD_VERTICES[4]; // the vertex the pencil points at

class Svg {
  constructor(readonly id: string) {}
  ref = (name: string) => `url(#${this.id}-${name})`;
  clip = (name: string, shape: string) => `<clipPath id="${this.id}-${name}">${shape}</clipPath>`;
}

// The tile, simplified: land, the two large green areas and the river. No houses, footway or small greens.
const tile = (s: Svg, content: string) =>
  `<path fill="#e6ebbf" d="${TILE}"/>` +
  `<g clip-path="${s.ref("tile")}"><g fill="#aad273"><path d="${GREENS[2]}"/><path d="${GREENS[3]}"/></g>` +
  `<path fill="#9bc4ff" d="${WATER}"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">${content}</g></g>` +
  `<path d="${TILE}" fill="none" stroke="#ccc" stroke-width=".74"/>`;

// The edited way: a road, plus cycle lanes or parking lanes on both sides. w is the road width.
function way(d: string, fork: Fork, w: number) {
  const parts: string[] = [];
  if (fork === "bicycle")
    parts.push(`<path d="${d}" stroke="${ACCENT.bicycle}" stroke-width="${w * 2.2}"/>`);
  if (fork === "parking")
    parts.push(
      `<path d="${d}" stroke="${ACCENT.parking}" stroke-width="${w * 2.5}" stroke-dasharray="${w * 0.9} ${w * 0.4}" stroke-linecap="butt"/>`,
    );
  if (fork !== "maid") parts.push(`<path d="${d}" stroke="#fff" stroke-width="${w * 1.5}"/>`);
  parts.push(`<path d="${d}" stroke="#e08584" stroke-width="${w}"/>`);
  return parts.join("");
}

const vertices = (pts: number[][], r: number) =>
  pts
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" ${VERTEX} stroke-width="${r * 0.36}"/>`)
    .join("");

// The mode icons, white, drawn along the pen: x runs from tip to end, -y is "up".
// About 40 x 24, so they keep a margin on the pencil's body.
const ICON: Record<Fork, string> = {
  maid: "",
  bicycle:
    '<g fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="-12.5" cy="4" r="7.5"/><circle cx="12.5" cy="4" r="7.5"/>' +
    '<path d="M-12.5 4H-2l-4.5-11ZM-6.5-7h13L-2 4m8.5-11 6 11m-6-11-1.5-4h4.5M-10-9.5h6.5"/></g>',
  parking:
    '<path fill="#fff" d="M-19 6V0c0-2 1.2-3.3 3.2-3.8L-10.5-5l4.6-6c1-1.3 2.3-2 4-2h9.2c1.7 0 3 .7 4 2l4.6 6 3.8 1.2c2 .6 3.3 1.8 3.3 3.8v6Z"/>' +
    '<path fill="#262626" d="M-5-5.5l3.8-5H2.6v5ZM5.4-5.5v-5h3.8L13-5.5Z"/>' +
    '<circle cx="-10" cy="6" r="4.6" fill="#fff" stroke="#262626" stroke-width="2.2"/><circle cx="10" cy="6" r="4.6" fill="#fff" stroke="#262626" stroke-width="2.2"/>',
};

// A pencil the size of the OSM lens, tip at the vertex, pointing down-left.
// From the tip: graphite, sharpened wood, the body with a lit facet, the ferrule, the eraser.
// Tip, wood, ferrule and eraser are the same for every app; only the icon changes.
function pen(fork: Fork) {
  const [x, y] = [TIP[0] + 5, TIP[1] - 5];
  const w = 26; // half width
  const L = 240; // tip to end
  const body = [52, L - 40]; // where the body starts and ends
  const facet = -w + 10; // lower edge of the lit facet
  const [bx0, bx1] = body;
  return (
    `<g transform="translate(${x} ${y}) rotate(-45)">` +
    `<path fill="#f1cf9a" d="M0 0 ${bx0} -${w}V${w}Z"/>` +
    `<path fill="#2b2b2b" d="M.6-.4 14-7.2Q16 0 14 7.2L.6.4Q0 0 .6-.4Z"/>` +
    // body: the edge towards the tip is scalloped like a sharpened pencil
    `<path fill="#262626" d="M${bx0} ${facet}Q${bx0 - 9} ${(facet + w) / 2} ${bx0} ${w}H${bx1}V${facet}Z"/>` +
    `<path fill="#4a4a4a" d="M${bx0} -${w}Q${bx0 - 6} ${(facet - w) / 2} ${bx0} ${facet}H${bx1}V-${w}Z"/>` +
    `<path fill="#c8c8c2" d="M${bx1} -${w}h22V${w}h-22Z"/>` +
    `<path fill="none" stroke="#9a9a94" stroke-width="2" d="M${bx1 + 7} -${w}V${w}M${bx1 + 15} -${w}V${w}"/>` +
    `<path fill="#e08584" d="M${bx1 + 22} -${w}H${L - 7}a7 7 0 0 1 7 7V${w - 7}a7 7 0 0 1-7 7H${bx1 + 22}Z"/>` +
    (ICON[fork]
      ? `<g transform="translate(${(bx0 + bx1) / 2 + 4} ${(facet + w) / 2})">${ICON[fork]}</g>`
      : "") +
    `</g>`
  );
}

const frame = (s: Svg, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 285">\n` +
  `<defs>${s.clip("tile", `<path d="${TILE}"/>`)}</defs>\n${body}\n</svg>\n`;

/** The app each version goes to */
const APP_DIR: Record<Fork, string> = {
  maid: "apps/maid",
  bicycle: "apps/maid-bicycle",
  parking: "apps/maid-parking",
};

const logo = (fork: Fork, viewBox: string) => {
  const s = new Svg(`maid-${fork}`);
  return frame(s, tile(s, way(ROAD, fork, 8)) + vertices(ROAD_VERTICES, 7.5) + pen(fork)).replace(
    'viewBox="0 0 300 285"',
    `width="${viewBox.split(" ")[2]}" height="${viewBox.split(" ")[3]}" viewBox="${viewBox}"`,
  );
};

for (const fork of FORKS) {
  const dir = join(ROOT, APP_DIR[fork], "src/brand");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "logo.svg"), logo(fork, "0 0 300 285"));
  // square, as browsers draw a favicon
  writeFileSync(join(dir, "favicon.svg"), logo(fork, "0 -7.5 300 300"));
  console.log(`Wrote ${APP_DIR[fork]}/src/brand/logo.svg and favicon.svg`);
}
