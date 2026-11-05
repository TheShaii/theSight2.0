/* Shared pure helpers: addresses, tolerant math, text normalization, number formatting. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";

  function colName(c) {
    let s = "";
    for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
    return s;
  }
  const addr = (r, c) => colName(c) + (r + 1);
  const rangeStr = (r0, c0, r1, c1) => addr(r0, c0) + ":" + addr(r1, c1);

  function parseAddr(a) {
    const m = /^([A-Z]+)(\d+)$/i.exec(a.trim());
    if (!m) return null;
    let c = 0;
    for (const ch of m[1].toUpperCase()) c = c * 26 + (ch.charCodeAt(0) - 64);
    return { r: parseInt(m[2], 10) - 1, c: c - 1 };
  }
  function parseRange(s) {
    const [a, b] = s.split(":");
    const p = parseAddr(a), q = parseAddr(b || a);
    return p && q ? { r0: Math.min(p.r, q.r), c0: Math.min(p.c, q.c), r1: Math.max(p.r, q.r), c1: Math.max(p.c, q.c) } : null;
  }

  // Kahan summation: money totals over many rows stay within a cent.
  function sum(values) {
    let s = 0, comp = 0;
    for (const v of values) {
      if (v == null || !isFinite(v)) continue;
      const y = v - comp, t = s + y;
      comp = (t - s) - y;
      s = t;
    }
    return s;
  }

  // Floats from Excel are never compared with ===; ±0.01 absolute or 1e-9 relative.
  function approxEqual(a, b, abs = 0.01, rel = 1e-9) {
    if (a == null || b == null) return false;
    const d = Math.abs(a - b);
    return d <= abs || d <= rel * Math.max(Math.abs(a), Math.abs(b));
  }

  function normText(s) {
    return String(s).replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
  }

  const DASHES = /^(-|–|—|n\/a|na|#n\/a|none)$/i;
  // Parses "1,234", "$50", "12%", "(500)", "1.2e3"; returns null for anything else.
  function parseLooseNumber(raw) {
    let s = normText(raw);
    if (!s || DASHES.test(s)) return null;
    let neg = false, pct = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    if (/%$/.test(s)) { pct = true; s = s.slice(0, -1).trim(); }
    s = s.replace(/^[-+]?\s*[$€£¥₹]\s*/, (m) => (m.includes("-") ? "-" : "")).replace(/\s*[$€£¥₹]$/, "");
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
    if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?([eE][-+]?\d+)?$|^\.\d+$/.test(s)) return null;
    let n = parseFloat(s.replace(/,/g, ""));
    if (pct) n /= 100;
    return neg ? -n : n;
  }
  const isDashText = (s) => DASHES.test(normText(s));

  // Excel number format sections: positive;negative;zero;text. We only need to know
  // whether negatives are red and whether zero renders as a dash.
  function formatSections(z) {
    const parts = [];
    let cur = "", inQuote = false;
    for (let i = 0; i < (z || "").length; i++) {
      const ch = z[i];
      if (ch === "\\") { cur += ch + (z[i + 1] || ""); i++; continue; }
      if (ch === '"') inQuote = !inQuote;
      if (ch === ";" && !inQuote) { parts.push(cur); cur = ""; continue; }
      cur += ch;
    }
    parts.push(cur);
    return {
      negativeRed: parts.length > 1 && /\[red\]/i.test(parts[1]),
      zeroDash: parts.length > 2 && /^\s*(\\-|"-"|-|\\—)\s*$/.test(parts[2].replace(/_\)|_\(/g, "")),
      percent: /%/.test(parts[0]),
      decimals: (/\.(0+)/.exec(parts[0]) || [, ""])[1].length,
    };
  }

  function formatNumber(v, z) {
    if (v == null || !isFinite(v)) return { text: "", red: false };
    const sec = formatSections(z);
    if (z && z !== "General" && globalThis.XLSX && XLSX.SSF) {
      try {
        const text = XLSX.SSF.format(z, v).trim();
        return { text, red: v < 0 && sec.negativeRed };
      } catch (e) { /* fall through to locale formatting */ }
    }
    // Excel "General": no thousands separators (a year stays 2026), up to 11 significant digits.
    if (z === "General") return { text: String(Number(v.toPrecision(11))), red: false };
    const abs = Math.abs(v);
    const digits = Number.isInteger(v) ? 0 : abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
    return { text: v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }), red: false };
  }

  function formatCompact(v, opts = {}) {
    if (v == null || !isFinite(v)) return "–";
    if (opts.percent) return (v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0) + "%";
    const a = Math.abs(v), sign = v < 0 ? "-" : "";
    const units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (const [n, u] of units) if (a >= n) return sign + trimZeros((a / n).toFixed(a / n >= 100 ? 1 : 2)) + u;
    return sign + trimZeros(a.toFixed(a >= 100 ? 0 : 2));
  }
  const trimZeros = (s) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

  function formatSigned(v, opts) { return (v > 0 ? "+" : "") + formatCompact(v, opts); }

  const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "per", "with"]);
  const ACRONYMS = new Set(["EAC", "SES", "PR", "PO", "USD", "EUR", "KPI", "YTD", "QTD", "MTD", "ID", "CC", "IT", "HR", "OPEX", "CAPEX", "ROI", "Q1", "Q2", "Q3", "Q4", "FY", "UK", "US", "EU"]);
  // ALL-CAPS banners become Title Case; acronyms (known or present in headers) survive.
  function titleCase(s, extraAcronyms) {
    s = normText(s);
    if (/[a-z]/.test(s)) return s;
    const keep = new Set([...ACRONYMS, ...(extraAcronyms || [])].map((x) => x.toUpperCase()));
    let first = true;
    return s.replace(/[A-Z0-9&'.\-]+/g, (w) => {
      const lower = w.toLowerCase();
      let out;
      if (keep.has(w) || /\d/.test(w)) out = w;
      else if (!first && SMALL.has(lower)) out = lower;
      else out = lower.charAt(0).toUpperCase() + lower.slice(1);
      first = false;
      return out;
    });
  }

  const normKey = (s) => normText(s).toLowerCase().replace(/^(sum|count|average|avg) of\s+/, "").replace(/\s+amount$/, "").replace(/[^a-z0-9]+/g, " ").trim();

  function pluralize(word, n) {
    if (n === 1) return word;
    const w = word.toLowerCase();
    if (/(s|x|ch|sh)$/.test(w)) return word + "es";
    if (/[^aeiou]y$/.test(w)) return word.slice(0, -1) + "ies";
    return word + "s";
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const uid = (() => { let n = 0; return (p = "id") => p + "-" + (++n).toString(36); })();
  const deepClone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  DV.utils = {
    colName, addr, rangeStr, parseAddr, parseRange, sum, approxEqual, normText, parseLooseNumber,
    isDashText, formatSections, formatNumber, formatCompact, formatSigned, titleCase, normKey,
    pluralize, clamp, uid, deepClone,
  };
})();
