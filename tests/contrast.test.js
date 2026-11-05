"use strict";
// WCAG AA for every design variant × palette (CLAUDE.md §2.7) plus the brand rules:
// navy top bar with white text, navy text on yellow, and yellow never used as text color.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const buildSrc = fs.readFileSync(path.join(ROOT, "build.js"), "utf8");
const CSS_FILES = JSON.parse(/const CSS_FILES = (\[[^\]]+\])/.exec(buildSrc)[1]);
const rawCss = CSS_FILES.map((f) => fs.readFileSync(path.join(ROOT, "src", "styles", f), "utf8")).join("\n");
// Drop comments and @supports fallbacks (those only kick in without backdrop-filter).
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "").replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
const designsJs = fs.readFileSync(path.join(ROOT, "src", "js", "designs.js"), "utf8");
const VARIANTS = [...designsJs.matchAll(/\{ id: "([\w-]+)", name: "[^"]+", mode: "(light|dark)"/g)].map((m) => ({ id: m[1], mode: m[2], design: m[1].split("-")[0] }));

const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
  sel: m[1].trim(),
  vars: Object.fromEntries([...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].replace(/!important/, "").trim()])),
}));

function resolve(v, palette) {
  const attrs = { "data-design": v.design, "data-variant": v.id, "data-mode": v.mode, "data-palette": palette };
  const matches = (sel) => sel.split(",").some((part) => {
    part = part.trim();
    if (part === ":root") return true;
    const conds = [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)];
    return conds.length > 0 && part.replace(/\[[^\]]+\]/g, "") === "" && conds.every(([, a, val]) => (val === undefined ? a in attrs : attrs[a] === val));
  });
  const spec = (sel) => Math.max(...sel.split(",").map((p) => (p.match(/\[/g) || []).length));
  const out = {};
  blocks.map((b, i) => ({ ...b, i })).filter((b) => matches(b.sel))
    .sort((a, b) => spec(a.sel) - spec(b.sel) || a.i - b.i).forEach((b) => Object.assign(out, b.vars));
  const deref = (x) => { let n = 0; while (x && /^var\(--[\w-]+\)$/.test(x) && n++ < 5) x = out[x.slice(4, -1)]; return x; };
  for (const k of Object.keys(out)) out[k] = deref(out[k]);
  return out;
}

function lum(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return la == null || lb == null ? null : (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TEXT = ["--text", "--text-2", "--muted", "--good-text", "--bad-text", "--warn-text", "--accent-text"];
const MARKS = ["--series-1", "--over", "--under", "--focus"];

for (const v of VARIANTS) {
  for (const palette of ["default", "cb"]) {
    test(`contrast: ${v.id} / ${palette}`, () => {
      const c = resolve(v, palette);
      const surface = c["--surface-solid"] || c["--surface"];
      const fails = [];
      for (const [bgName, bg] of [["surface", surface], ["bg", c["--bg"]]]) {
        for (const k of TEXT) { const r = ratio(c[k], bg); if (r != null && r < 4.5) fails.push(`${k} on ${bgName}: ${r.toFixed(2)}`); }
        for (const k of MARKS) { const r = ratio(c[k], bg); if (r != null && r < 3) fails.push(`${k} on ${bgName}: ${r.toFixed(2)}`); }
      }
      // Title text sits on the header band in designs that have one.
      if (/^#/.test(c["--band"] || "")) {
        for (const k of ["--band-text", "--band-text-2"]) { const r = ratio(c[k], c["--band"]); if (r != null && r < 4.5) fails.push(`${k} on --band: ${r.toFixed(2)}`); }
      }
      const badge = ratio(c["--badge-fg"], c["--badge-bg"]);
      if (badge != null && badge < 3) fails.push(`--badge-fg on --badge-bg: ${badge.toFixed(2)}`);
      assert.deepEqual(fails, []);
    });
  }
}

test("brand: navy top bar, white text, navy-on-yellow highlights", () => {
  const c = resolve(VARIANTS[0], "default");
  assert.equal(c["--brand-navy"].toUpperCase(), "#0B1220");
  assert.equal(c["--brand-yellow"].toUpperCase(), "#FACC15");
  assert.ok(ratio(c["--brand-white"], c["--brand-navy"]) >= 4.5, "white on navy");
  assert.ok(ratio(c["--brand-muted"], c["--brand-navy"]) >= 4.5, "muted on navy");
  assert.ok(ratio(c["--accent-ink"], c["--accent"]) >= 4.5, "navy on yellow");
  assert.ok(ratio(c["--brand-yellow"], c["--brand-navy"]) >= 4.5, "yellow on navy");
});

test("brand: yellow is never used as text color (except on the navy bars)", () => {
  const rules = [...rawCss.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const onNavy = /\.topbar|\.brand|\.g-footer/;
  const offenders = rules
    .filter(([, sel, body]) => /(^|[\s;])color\s*:\s*var\(--(accent|brand-yellow|highlight)\)/.test(body) && !onNavy.test(sel))
    .map(([, sel]) => sel.trim());
  assert.deepEqual(offenders, []);
});

test("the variant list is complete and the resolver finds real colors", () => {
  assert.ok(!VARIANTS.some((v) => v.design === "glass"), "Glass design was removed");
  for (const id of ["exec-light", "exec-dark", "bank-light", "bank-dark", "estate-light", "plum-light"]) assert.ok(VARIANTS.some((v) => v.id === id), id);
  for (const id of ["thesight-light", "thesight-dark", "neon-cyber", "neon-synth", "bento-light", "bento-dark", "brutal-light", "brutal-dark", "classic-mono", "classic-hc"]) {
    assert.ok(VARIANTS.some((v) => v.id === id), id);
  }
  for (const v of VARIANTS) {
    const c = resolve(v, "default");
    for (const k of ["--text", "--bg", "--series-1", "--over", "--under", "--accent-text"]) assert.match(c[k] || "", /^#[0-9a-f]{6}$/i, `${v.id} ${k}`);
    assert.match(c["--surface-solid"] || c["--surface"] || "", /^#[0-9a-f]{6}$/i, `${v.id} surface`);
  }
  assert.equal(resolve(VARIANTS.find((v) => v.id === "thesight-light"), "cb")["--over"], "#c2410c");
});
