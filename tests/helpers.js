"use strict";
// Loads vendor XLSX + the pure src modules into a fresh vm context, exactly as the browser would.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const order = require(path.join(ROOT, "src", "order.json"));

function loadDV() {
  const ctx = { console, Uint8Array, ArrayBuffer, Date, Math, JSON, Set, Map };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "vendor", "xlsx.full.min.js"), "utf8"), ctx, { filename: "xlsx.full.min.js" });
  for (const f of order.pure) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "src", "js", f), "utf8"), ctx, { filename: f });
  }
  return ctx;
}

function analyzeSample(ctx, file) {
  const buf = fs.readFileSync(path.join(ROOT, "samples", file));
  const wb = ctx.DV.grid.readWorkbook(new ctx.Uint8Array(buf));
  return ctx.DV.analyze.analyzeWorkbook(wb);
}

module.exports = { loadDV, analyzeSample, ROOT };
