import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const root = 'src';

// Current rose brand family -> new balanced Colour Me Wed palette (teal + pink + purple + peach)
const hexMap = {
  '#c13a53': '#C94D78', // primary  -> pink
  '#a42038': '#B52F58', // dark     -> deep pink
  '#8f1c31': '#B52F58', // darker   -> deep pink
  '#96636f': '#65777D', // muted    -> muted text
  '#c86986': '#2EA9A5', // 2ndary accent -> DEEP TEAL (teal injection)
  '#c082ae': '#A77BB5', // lavender -> purple
  '#fbeef1': '#F6DCE5', // light surface -> light blush
  '#eccdd4': '#D8E7E6', // border   -> light teal-gray border
  '#fdf7f8': '#FFF7F5', // very light -> warm cream
  '#fbf0f2': '#E8F7F5', // hover surface -> light aqua (teal injection)
  '#fff6f9': '#FFF7F5', // very light rose -> warm cream
  '#2a2327': '#24343D', // dark text
  '#8a7175': '#65777D', // muted text
  // Deals.css pink fallbacks
  '#fffbfc': '#FFF7F5',
  '#fcecef': '#F6DCE5',
  '#fff5f7': '#E8F7F5',
  '#e8b7c1': '#D8E7E6',
};

// rose rgba triplets -> new
const rgbMap = [
  [/193,\s*58,\s*83/g, '201, 77, 120'],  // #C94D78
  [/164,\s*32,\s*56/g, '181, 47, 88'],   // #B52F58
  [/143,\s*28,\s*49/g, '181, 47, 88'],
];

// Do NOT touch the login page (explicit instruction)
const exclude = new Set(['Login.css', 'Login.tsx']);
const exts = new Set(['.css', '.tsx', '.ts']);
const changed = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!exts.has(extname(p))) continue;
    if (exclude.has(basename(p))) continue;
    let src = readFileSync(p, 'utf8');
    const orig = src;
    for (const [k, v] of Object.entries(hexMap)) {
      src = src.replace(new RegExp(k, 'gi'), v);
    }
    for (const [re, v] of rgbMap) {
      src = src.replace(re, v);
    }
    if (src !== orig) { writeFileSync(p, src); changed.push(p); }
  }
}

walk(root);
console.log('Modified files:', changed.length);
changed.forEach(f => console.log(' -', f));
