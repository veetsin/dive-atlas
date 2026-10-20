// Static preview of a d3 orthographic globe with the atlas's real data, day + night, to judge the idea.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { geoOrthographic, geoPath, geoGraticule, geoArea } from 'd3-geo';
import { merge } from 'topojson-client';

const ROOT = '/Users/veetsin/Documents/coding/dive-atlas';
const topo = JSON.parse(readFileSync(`${ROOT}/public/geo/countries.topo.json`, 'utf8'));
const obj = topo.objects[Object.keys(topo.objects)[0]];
const land = merge(topo, obj.geometries.filter((g) => g.type === 'Polygon' || g.type === 'MultiPolygon'));
const big = { type: 'MultiPolygon', coordinates: land.coordinates.filter((c) => { const a = geoArea({ type: 'Polygon', coordinates: c }); return Math.min(a, 4 * Math.PI - a) >= 1e-4; }) };
const sites = JSON.parse(readFileSync(`${ROOT}/data/sites.json`, 'utf8'));
const labels = JSON.parse(readFileSync(`${ROOT}/data/labels.json`, 'utf8'));

const DAY = { deep: '#0e2a47', mid: '#124a6c', ocean: '#19858f', ring: '#6fcbbe', land: '#f3e6cb', edge: '#d8c49a', line: '#fbf8f1', coral: '#f2795b', paper: '#fbf8f1', ink: '#13293d', bg: '#0b1f35' };
const NIGHT = { deep: '#0e2a47', mid: '#0b1f35', ocean: '#123a5c', ring: '#4a8fa6', land: '#3d5b77', edge: 'none', line: '#9ed9c9', coral: '#f2795b', paper: '#13293d', ink: '#fbf8f1', bg: '#07162a' };
const SERIF = `'Songti SC','STSong','Noto Serif CJK SC',Georgia,serif`;
const SANS = `-apple-system,'PingFang SC','Noto Sans CJK SC',Arial,sans-serif`;

function globe(size, center, C) {
  const r = size / 2 - 40;
  const proj = geoOrthographic().rotate([-center[0], -center[1]]).scale(r).translate([size / 2, size / 2]).clipAngle(90);
  const path = geoPath(proj);
  const grat = path(geoGraticule().step([30, 30])());
  const landD = path(land), bigD = path(big);
  const rings = [[26, 0.06, bigD], [14, 0.12, bigD], [7, 0.22, landD], [3, 0.36, landD]]
    .map(([w, o, d]) => `<path d="${d}" fill="none" stroke="${C.ring}" stroke-width="${w}" stroke-opacity="${o}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const seas = labels.filter((l) => l.tier <= 2).map((l) => {
    const p = proj(l.at); if (!p) return '';
    const sz = l.tier === 1 ? 20 : 12;
    return `<text x="${p[0]}" y="${p[1]}" font-family="${SERIF}" font-size="${sz}" letter-spacing="${l.tier === 1 ? '.45em' : '.25em'}" fill="${C.line}" fill-opacity=".6" text-anchor="middle" dy=".35em">${l.name.zh}</text>`;
  }).join('');
  const marks = sites.map((s) => {
    const p = proj(s.coords); if (!p) return '';
    // on the back? orthographic returns null when clipped by clipAngle
    return `<g transform="translate(${p[0].toFixed(1)},${p[1].toFixed(1)})"><circle r="7" fill="${C.paper}" fill-opacity=".9"/><circle r="4.8" fill="${C.coral}"/><text x="11" y="4" font-family="${SANS}" font-size="11" font-weight="600" fill="${C.ink}" paint-order="stroke" stroke="${C.paper}" stroke-width="3" stroke-opacity=".9">${s.name.zh}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<defs>
  <radialGradient id="sea" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="${C.ocean}"/><stop offset=".55" stop-color="${C.mid}"/><stop offset="1" stop-color="${C.deep}"/></radialGradient>
  <radialGradient id="atmo" cx=".5" cy=".5" r=".5"><stop offset=".86" stop-color="${C.ring}" stop-opacity="0"/><stop offset=".94" stop-color="${C.ring}" stop-opacity=".35"/><stop offset="1" stop-color="${C.ring}" stop-opacity="0"/></radialGradient>
  <radialGradient id="shade" cx=".38" cy=".34" r=".8"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>
  <clipPath id="disc"><circle cx="${size / 2}" cy="${size / 2}" r="${r}"/></clipPath>
</defs>
<rect width="${size}" height="${size}" fill="${C.bg}"/>
<circle cx="${size / 2}" cy="${size / 2}" r="${r * 1.08}" fill="url(#atmo)"/>
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="url(#sea)"/>
<g clip-path="url(#disc)">
  <path d="${grat}" fill="none" stroke="${C.line}" stroke-opacity=".12" stroke-width=".8"/>
  ${rings}
  <path d="${landD}" fill="${C.land}" stroke="${C.edge}" stroke-width="1" stroke-opacity=".8" stroke-linejoin="round"/>
  <g>${seas}</g>
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="url(#shade)"/>
  <g>${marks}</g>
</g>
<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.line}" stroke-opacity=".35" stroke-width="1"/>
</svg>`;
}

const S = 900;
const a = await sharp(Buffer.from(globe(S, [118, 8], DAY)), { density: 144 }).png().toBuffer();
const b = await sharp(Buffer.from(globe(S, [118, 8], NIGHT)), { density: 144 }).png().toBuffer();
const m = await sharp(a).metadata();
await sharp({ create: { width: m.width * 2 + 24, height: m.height, channels: 3, background: '#000' } })
  .composite([{ input: a, left: 0, top: 0 }, { input: b, left: m.width + 24, top: 0 }])
  .png({ compressionLevel: 9 }).toFile('globe-preview.png');
console.log('ok', m.width, m.height);
