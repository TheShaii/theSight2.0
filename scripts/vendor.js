"use strict";
// Copies pinned libraries from node_modules into vendor/ so builds work offline afterwards.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = [
  ["node_modules/xlsx/dist/xlsx.full.min.js", "vendor/xlsx.full.min.js"],
  ["node_modules/echarts/dist/echarts.min.js", "vendor/echarts.min.js"],
];
for (const [from, to] of files) {
  fs.copyFileSync(path.join(root, from), path.join(root, to));
  console.log(`vendor: ${to} (${(fs.statSync(path.join(root, to)).size / 1024).toFixed(0)} KB)`);
}
