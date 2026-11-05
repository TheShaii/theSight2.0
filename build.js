"use strict";
// Inlines vendor libs, CSS, app JS and the logo into dist/TheSight2.0.html.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const r = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const ORDER = JSON.parse(r("src", "order.json"));
const OUT = path.join(ROOT, "dist", "TheSight2.0.html");
const LOGO = path.join(ROOT, "docs", "logo.png");
const CSS_FILES = ["base.css", "designs/brand.css", "designs/thesight.css", "designs/executive.css", "designs/bank.css", "designs/estate.css", "designs/plum.css", "designs/neon.css", "designs/bento.css", "designs/brutal.css", "designs/classic.css", "layouts.css"];
const ALLOWED_URLS = ["http://www.w3.org/2000/svg"]; // SVG namespace string, not a request

// "</script" inside inlined JS would end the script element early.
const safeScript = (js) => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

function build() {
  const css = CSS_FILES.map((f) => `/* ${f} */\n` + r("src", "styles", f)).join("\n");
  const vendor = ["xlsx.full.min.js", "echarts.min.js"].map((f) => `/* vendor/${f} */\n` + r("vendor", f)).join("\n;\n");
  const files = ORDER.pure.concat(ORDER.ui);
  const app = files.map((f) => `/* src/js/${f} */\n` + r("src", "js", f)).join("\n");
  const logo = "data:image/png;base64," + fs.readFileSync(LOGO).toString("base64");

  // Function replacers: vendor code contains "$&"-style sequences that string replace would expand.
  const html = r("src", "index.template.html")
    .replace("/*__CSS__*/", () => css)
    .replace("/*__VENDOR__*/", () => safeScript(vendor))
    .split("__LOGO_DATA_URI__").join(logo)
    .replace("/*__APP__*/", () => safeScript(app));

  checkOffline(html, app, css);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, html);
  // Static hosts (GitHub Pages, Netlify, ...) serve index.html at "/", so ship a copy under that name.
  fs.writeFileSync(path.join(path.dirname(OUT), "index.html"), html);
  const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
  console.log(`built dist/TheSight2.0.html  ${mb} MB  (${files.length} modules)`);
  if (mb > 3) console.warn("warning: output exceeds the ~3 MB target");
}

// Zero network: no remote src/href/url()/@import anywhere, and no URLs at all in our own code.
function checkOffline(html, app, css) {
  const problems = [];
  const resourceRefs = [
    /\b(?:src|href|action|poster|data)\s*=\s*["']?\s*(?:https?:)?\/\/[^"'\s>]+/gi,
    /url\(\s*["']?\s*(?:https?:)?\/\/[^)"']+/gi,
    /@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//gi,
  ];
  for (const re of resourceRefs) for (const m of html.matchAll(re)) problems.push(m[0].slice(0, 120));
  for (const m of (app + css).matchAll(/https?:\/\/[^\s"'`)]+/g)) if (!ALLOWED_URLS.includes(m[0])) problems.push(m[0]);
  if (problems.length) {
    console.error("offline check FAILED: network references found:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("offline check: no http(s) resource references");
}

build();
if (process.argv.includes("--watch")) {
  let t = null;
  for (const dir of ["src", "src/js", "src/js/structure", "src/js/charts", "src/styles", "src/styles/designs"]) {
    fs.watch(path.join(ROOT, dir), () => { clearTimeout(t); t = setTimeout(() => { try { build(); } catch (e) { console.error(e.message); } }, 150); });
  }
  console.log("watching src/ for changes…");
}
