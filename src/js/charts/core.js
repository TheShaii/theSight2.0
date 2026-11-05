/* Shared chart plumbing: base option, axes, tooltips, design-driven mark styling.
   Builders are pure (table, spec, ctx) → ECharts option; no DOM. Rules everywhere:
   one value axis per plot, colors follow the entity, Grand Total rows never in a series. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;

  // ECharts renders tooltips as HTML, so every spreadsheet string is escaped.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const col = (t, k) => t.columns.find((c) => c.key === k);
  const label = (t, k) => (col(t, k) || { label: k }).label;
  const full = (t, k, v) => { const c = col(t, k); return U.formatNumber(v, c && c.numberFormat).text || "–"; };
  const isPct = (t, k) => { const c = col(t, k); return !!c && c.measureType === "percent"; };
  const compact = (t, k) => (v) => U.formatCompact(v, { percent: isPct(t, k) });
  const measureIndex = (t, k) => t.columns.filter((c) => c.role === "measure").findIndex((c) => c.key === k);
  const colorOfMeasure = (t, k, th) => th.series[Math.max(0, measureIndex(t, k)) % 8];
  const colorOfRow = (r, th) => (r.index < 8 ? th.series[r.index % 8] : th.other);

  function alpha(color, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Fill + glow + outline + radius according to the active design's chartStyle.
  function fill(th, color, dir) {
    if (th.style.bar !== "gradient") return color;
    const v = dir === "v";
    return { type: "linear", x: 0, y: v ? 1 : 0, x2: v ? 0 : 1, y2: 0, colorStops: [{ offset: 0, color: alpha(color, 0.35) }, { offset: 1, color }] };
  }
  function mark(th, color, dir, extra = {}) {
    const r = th.style.radius;
    const radius = dir === "h" ? [0, r, r, 0] : dir === "v" ? [r, r, 0, 0] : r;
    const st = { color: fill(th, color, dir), borderRadius: radius, ...extra };
    if (th.style.glow) { st.shadowBlur = th.style.glow; st.shadowColor = alpha(color, 0.55); }
    if (th.style.outline && th.markBorder) { st.borderColor = th.markBorder; st.borderWidth = 2; }
    return st;
  }

  function base(th, opts = {}) {
    return {
      backgroundColor: "transparent",
      animation: !th.reducedMotion, animationDuration: 450, animationEasing: "cubicOut",
      textStyle: { fontFamily: th.font, color: th.text2 },
      color: th.series,
      aria: { enabled: true, decal: { show: th.texture } },
      grid: { left: 8, right: 52, top: opts.legend ? 40 : 26, bottom: 8, containLabel: true },
      tooltip: {
        trigger: opts.trigger || "item", confine: true, backgroundColor: th.tooltipBg, borderColor: th.border,
        textStyle: { color: th.tooltipText, fontSize: 12 }, extraCssText: "border-radius:10px;",
      },
      legend: opts.legend ? { top: 0, left: 0, right: 56, icon: "roundRect", itemWidth: 12, itemHeight: 8, textStyle: { color: th.text2 }, type: "scroll" } : undefined,
    };
  }
  const catAxis = (th, data, extra) => ({
    type: "category", data, axisTick: { show: false }, axisLine: { lineStyle: { color: th.axis } },
    axisLabel: { color: th.text2, hideOverlap: true, width: 150, overflow: "truncate" }, ...extra,
  });
  const valAxis = (th, fmt, extra) => ({
    type: "value", splitLine: { lineStyle: { color: th.grid } }, axisLine: { show: false },
    axisLabel: { color: th.muted, formatter: fmt, hideOverlap: true }, splitNumber: 4, ...extra,
  });

  // Folds the tail into "Other": a real sum of body rows, never a total row.
  function foldRows(rows, key, maxN) {
    if (rows.length <= maxN) return { rows, other: null };
    const head = rows.slice(0, maxN - 1), tail = rows.slice(maxN - 1);
    return { rows: head, other: { label: `Other (${tail.length})`, value: U.sum(tail.map((r) => r.values[key])), count: tail.length } };
  }

  const isHl = (ctx, l) => !!ctx.highlight && DV.filters.memberKey(l) === ctx.highlight;
  const dimmed = (ctx, l) => !!ctx.highlight && !isHl(ctx, l);
  // Cross-highlight: the selected member gets the brand-yellow ring, the rest fade.
  function itemExtra(ctx, l) {
    if (isHl(ctx, l)) return { opacity: 1, borderColor: ctx.theme.highlight, borderWidth: 3 };
    return { opacity: dimmed(ctx, l) ? 0.28 : 1 };
  }

  function tooltipFor(t, ctx, key) {
    const grand = t.totals.grand;
    const vi = DV.filters.varianceInfo(t);
    return (p) => {
      const row = t.rows.find((r) => r.label === p.name);
      const lines = [`<b>${esc(p.name)}</b>`];
      const k = p.seriesId && col(t, p.seriesId) ? p.seriesId : key;
      const v = row ? row.values[k] : Array.isArray(p.value) ? p.value[p.value.length - 1] : p.value;
      lines.push(`${esc(col(t, k) ? col(t, k).label : p.seriesName)}: <b>${esc(full(t, k, v))}</b>`);
      if (grand && grand[k] && v != null && col(t, k) && !col(t, k).derived) lines.push(`${(v / grand[k] * 100).toFixed(1)}% of ${esc(t.totals.grandLabel || "Grand Total")}`);
      if (row && vi && k !== vi.key && row.values[vi.key] != null) {
        lines.push(`${esc(vi.col.label)}: ${esc(full(t, vi.key, row.values[vi.key]))} (${DV.filters.isOver(vi, row.values[vi.key]) ? "over" : "under"} budget)`);
      }
      return lines.join("<br>");
    };
  }
  const axisTooltip = (t) => (ps) => [`<b>${esc(ps[0] ? ps[0].name : "")}</b>`]
    .concat(ps.filter((p) => p.value != null).map((p) => `${p.marker}${esc(p.seriesName)}: <b>${esc(full(t, p.seriesId, p.value))}</b>`)).join("<br>");

  const brush = (th, type) => ({ toolbox: [type, "clear"], brushStyle: { color: alpha(th.accent, 0.15), borderColor: th.accent, borderWidth: 1 }, throttleType: "debounce", throttleDelay: 250, outOfBrush: { colorAlpha: 0.3 } });

  const BUILDERS = {};
  function buildOption(t, spec, ctx) {
    const fn = BUILDERS[spec.type];
    if (!fn) throw new Error("Unknown chart type " + spec.type);
    const o = fn(t, spec, ctx);
    if (o.brush) o.toolbox = { show: true, right: 0, top: 0, itemSize: 13, iconStyle: { borderColor: ctx.theme.muted }, feature: {} };
    return o;
  }

  DV.charts = {
    BUILDERS, buildOption, esc,
    h: { col, label, full, isPct, compact, colorOfMeasure, colorOfRow, alpha, fill, mark, base, catAxis, valAxis, foldRows, isHl, itemExtra, tooltipFor, axisTooltip, brush },
  };
})();
