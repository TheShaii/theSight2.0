/* Bar family: ranked (bars / column / lollipop / share), grouped, stacked, 100% stacked,
   plan-vs-actual, diverging variance, Pareto. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils, B = DV.charts.BUILDERS;
  const { col, label, full, isPct, compact, colorOfMeasure, mark, base, catAxis, valAxis, foldRows, itemExtra, tooltipFor, axisTooltip, brush, esc } = { ...DV.charts.h, esc: DV.charts.esc };

  const rowsFor = (ctx, key, sortByValue) => {
    let rows = ctx.view.rows.filter((r) => r.values[key] != null);
    if (sortByValue) rows = rows.slice().sort((a, b) => b.values[key] - a.values[key]);
    return rows;
  };
  const orient = (t, c, n, preferH) => (c.horizontal != null ? c.horizontal : preferH != null ? preferH : t.profile.longLabels || n > 8);
  function axes(o, th, names, horizontal, fmt, catExtra = {}) {
    const cat = catAxis(th, names, horizontal ? { inverse: true, ...catExtra }
      : { axisLabel: { color: th.text2, rotate: names.length > 6 ? 30 : 0, hideOverlap: true, width: 90, overflow: "truncate" }, ...catExtra });
    const val = valAxis(th, fmt);
    o.xAxis = horizontal ? val : cat;
    o.yAxis = horizontal ? cat : val;
  }

  // Ranked single-measure bars. Variants: bars (auto orientation), column, lollipop, share.
  B.rank = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure, c = ctx.custom || {}, variant = spec.variant || "bars";
    const rows = rowsFor(ctx, key, !c.sort && ctx.sortMode === "value");
    const { rows: shown, other } = foldRows(rows, key, c.topN || 15);
    const horizontal = variant === "column" ? (c.horizontal != null ? c.horizontal : false) : orient(t, c, shown.length);
    const dir = horizontal ? "h" : "v";
    const names = shown.map((r) => r.label).concat(other ? [other.label] : []);
    const grand = t.totals.grand && t.totals.grand[key];
    const maxV = Math.max(...shown.map((r) => r.values[key]));
    const color = c.color || th.series[0];
    const data = shown.map((r) => ({
      value: r.values[key], name: r.label, itemStyle: { ...mark(th, color, dir), ...itemExtra(ctx, r.label) },
      label: { show: !!c.labels || variant === "share" || r.values[key] === maxV },
    }));
    if (other) data.push({ value: other.value, name: other.label, itemStyle: mark(th, th.other, dir) });
    const o = base(th);
    axes(o, th, names, horizontal, compact(t, key));
    const fmtLabel = (p) => variant === "share" && grand ? `${(p.value / grand * 100).toFixed(1)}%` : U.formatCompact(p.value, { percent: isPct(t, key) });
    const lbl = { position: horizontal ? "right" : "top", color: th.text2, formatter: fmtLabel, fontFamily: th.fontNum };
    if (variant === "lollipop") {
      o.series = [
        { type: "bar", name: label(t, key), data: data.map((d) => ({ ...d, label: { show: false } })), barWidth: 3, itemStyle: { color: th.axis }, silent: true, tooltip: { show: false } },
        { id: key, type: "scatter", name: label(t, key), symbolSize: 14, data: data.map((d) => ({ ...d, itemStyle: { ...d.itemStyle, borderRadius: 0 } })), label: lbl, z: 3 },
      ];
      o.series[1].data.forEach((d, i) => { d.value = horizontal ? [d.value, i] : [i, d.value]; });
      o.tooltip.formatter = (p) => tooltipFor(t, ctx, key)({ ...p, value: Array.isArray(p.value) ? p.value[horizontal ? 0 : 1] : p.value });
    } else {
      o.series = [{ id: key, type: "bar", name: label(t, key), data, barMaxWidth: variant === "column" ? 34 : 26, barCategoryGap: "28%", label: lbl, emphasis: { focus: "none" } }];
      o.tooltip.formatter = tooltipFor(t, ctx, key);
    }
    if (names.length > 16) o.dataZoom = [{ type: "inside", [horizontal ? "yAxisIndex" : "xAxisIndex"]: 0, startValue: 0, endValue: 14 }];
    o.brush = brush(th, horizontal ? "lineY" : "lineX");
    return o;
  };

  // Grouped / stacked / 100% stacked. Stacking is only offered for proven components.
  function multi(mode) {
    return function (t, spec, ctx) {
      const th = ctx.theme, c = ctx.custom || {};
      const keys = (spec.measures || []).filter((k) => ctx.view.measures.includes(k));
      const rows = ctx.view.rows;
      const horizontal = orient(t, c, rows.length, mode !== "grouped" ? rows.length > 6 : rows.length > 6 && t.profile.longLabels);
      const dir = horizontal ? "h" : "v";
      const o = base(th, { legend: true, trigger: "axis" });
      const pct = mode === "stacked100";
      const totals = rows.map((r) => U.sum(keys.map((k) => r.values[k])));
      axes(o, th, rows.map((r) => r.label), horizontal, pct ? (v) => v + "%" : (v) => U.formatCompact(v));
      if (pct) (horizontal ? o.xAxis : o.yAxis).max = 100;
      o.series = keys.map((k, si) => ({
        id: k, type: "bar", name: label(t, k), stack: mode === "grouped" ? undefined : "s", barMaxWidth: mode === "grouped" ? 18 : 30, barGap: "12%",
        itemStyle: mark(th, colorOfMeasure(t, k, th), mode === "grouped" || si === keys.length - 1 ? dir : null),
        data: rows.map((r, i) => ({ value: pct ? (totals[i] ? +(r.values[k] / totals[i] * 100).toFixed(2) : null) : r.values[k], name: r.label, raw: r.values[k], itemStyle: itemExtra(ctx, r.label) })),
        label: { show: !!c.labels, position: mode === "grouped" ? (horizontal ? "right" : "top") : "inside", formatter: (p) => (pct ? p.value.toFixed(0) + "%" : U.formatCompact(p.value)), color: th.text2, fontSize: 10 },
      }));
      if (mode !== "grouped") o.series.forEach((s) => { s.itemStyle.borderColor = th.surface; s.itemStyle.borderWidth = th.style.outline ? 2 : 1; });
      o.tooltip.axisPointer = { type: "shadow", shadowStyle: { color: th.grid, opacity: 0.4 } };
      o.tooltip.formatter = pct
        ? (ps) => [`<b>${esc(ps[0].name)}</b>`].concat(ps.map((p) => `${p.marker}${esc(p.seriesName)}: <b>${p.value == null ? "–" : p.value.toFixed(1) + "%"}</b> (${esc(full(t, p.seriesId, p.data.raw))})`)).join("<br>")
        : axisTooltip(t);
      if (rows.length > 14) o.dataZoom = [{ type: "inside", [horizontal ? "yAxisIndex" : "xAxisIndex"]: 0, startValue: 0, endValue: 12 }];
      o.brush = brush(th, horizontal ? "lineY" : "lineX");
      return o;
    };
  }
  B.grouped = multi("grouped");
  B.stacked = multi("stacked");
  B.stacked100 = multi("stacked100");

  B.bullet = function (t, spec, ctx) {
    const th = ctx.theme, c = ctx.custom || {};
    const rows = ctx.view.rows;
    const horizontal = c.horizontal != null ? c.horizontal : true;
    const o = base(th, { legend: true, trigger: "axis" });
    axes(o, th, rows.map((r) => r.label), horizontal, (v) => U.formatCompact(v));
    o.series = [
      { id: spec.actual, type: "bar", name: label(t, spec.actual), barMaxWidth: 16, itemStyle: mark(th, colorOfMeasure(t, spec.actual, th), horizontal ? "h" : "v"),
        data: rows.map((r) => ({ value: r.values[spec.actual], name: r.label, itemStyle: itemExtra(ctx, r.label) })),
        label: { show: !!c.labels, position: horizontal ? "right" : "top", formatter: (p) => U.formatCompact(p.value), color: th.text2 } },
      { id: spec.plan, type: "scatter", name: label(t, spec.plan) + " (marker)", symbol: "rect", symbolSize: horizontal ? [4, 22] : [22, 4], z: 5,
        itemStyle: { color: th.text }, data: rows.map((r) => ({ value: r.values[spec.plan], name: r.label })) },
    ];
    o.tooltip.axisPointer = { type: "shadow", shadowStyle: { color: th.grid, opacity: 0.4 } };
    o.tooltip.formatter = (ps) => {
      const row = rows.find((r) => r.label === (ps[0] && ps[0].name));
      if (!row) return "";
      const a = row.values[spec.actual], p = row.values[spec.plan], d = a != null && p != null ? a - p : null;
      return [`<b>${esc(row.label)}</b>`, `${esc(label(t, spec.actual))}: <b>${esc(full(t, spec.actual, a))}</b>`, `${esc(label(t, spec.plan))}: ${esc(full(t, spec.plan, p))}`,
        d != null ? `${d > 0 ? "Over" : "Under"} by ${esc(full(t, spec.actual, Math.abs(d)))} (${p ? (d / p * 100).toFixed(1) + "%" : "–"})` : ""].join("<br>");
    };
    return o;
  };

  B.variance = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure, c = ctx.custom || {};
    const d = col(t, key).derived;
    const vi = DV.filters.varianceInfo(t) || { overIsPositive: true };
    let rows = ctx.view.rows.filter((r) => r.values[key] != null);
    if (ctx.sortMode === "value" || ctx.sortMode === "variance") rows = rows.slice().sort((a, b) => b.values[key] - a.values[key]);
    const horizontal = c.horizontal != null ? c.horizontal : true;
    const isOverV = (v) => (vi.overIsPositive ? v > 0 : v < 0);
    const mk = (pred) => rows.map((r) => (pred(r.values[key]) ? { value: r.values[key], name: r.label, itemStyle: itemExtra(ctx, r.label) } : null));
    const o = base(th, { legend: true });
    const cat = catAxis(th, rows.map((r) => r.label), horizontal ? { inverse: true, axisLine: { show: false, onZero: false } } : { axisLine: { show: false, onZero: false } });
    const val = valAxis(th, (v) => U.formatSigned(v));
    o.xAxis = horizontal ? val : cat;
    o.yAxis = horizontal ? cat : val;
    const lbl = (side) => ({ show: c.labels !== false, position: side, formatter: (p) => U.formatSigned(p.value), color: th.text2, fontSize: 11 });
    const over = d.positiveLabel && /^over/i.test(d.positiveLabel) ? d.positiveLabel : d.negativeLabel || "Over";
    const under = over === d.positiveLabel ? d.negativeLabel : d.positiveLabel;
    const r = th.style.radius;
    o.series = [
      { type: "bar", name: over, stack: "v", data: mk(isOverV), itemStyle: { ...mark(th, th.over, null), borderRadius: r }, barMaxWidth: 20, label: lbl(horizontal ? "right" : "top"),
        markLine: { silent: true, symbol: "none", lineStyle: { color: th.axis, type: "solid", width: 1 }, data: [horizontal ? { xAxis: 0 } : { yAxis: 0 }], label: { show: false } } },
      { type: "bar", name: under, stack: "v", data: mk((v) => !isOverV(v)), itemStyle: { ...mark(th, th.under, null), borderRadius: r }, barMaxWidth: 20, label: lbl(horizontal ? "left" : "bottom") },
    ];
    o.tooltip.formatter = tooltipFor(t, ctx, key);
    return o;
  };

  // Two stacked plots sharing the category order: bars on top, cumulative % below (no dual axis).
  B.pareto = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure;
    const rows = ctx.view.rows.filter((r) => r.values[key] > 0).slice().sort((a, b) => b.values[key] - a.values[key]);
    const names = rows.map((r) => r.label);
    const tot = U.sum(rows.map((r) => r.values[key]));
    let run = 0;
    const cum = rows.map((r) => { run += r.values[key]; return +(run / tot * 100).toFixed(2); });
    const o = base(th, { trigger: "axis" });
    o.grid = [{ left: 24, right: 40, top: 12, height: "52%", containLabel: true }, { left: 24, right: 40, top: "68%", bottom: 6, containLabel: true }];
    o.xAxis = [catAxis(th, names, { gridIndex: 0, axisLabel: { show: false } }), catAxis(th, names, { gridIndex: 1, axisLabel: { color: th.text2, rotate: 30, hideOverlap: true, width: 80, overflow: "truncate" } })];
    o.yAxis = [valAxis(th, compact(t, key), { gridIndex: 0 }), valAxis(th, (v) => v + "%", { gridIndex: 1, max: 100, interval: 50 })];
    o.series = [
      { type: "bar", name: label(t, key), xAxisIndex: 0, yAxisIndex: 0, barMaxWidth: 26, itemStyle: mark(th, th.series[0], "v"),
        data: rows.map((r) => ({ value: r.values[key], name: r.label, itemStyle: itemExtra(ctx, r.label) })) },
      { type: "line", name: "Cumulative share", xAxisIndex: 1, yAxisIndex: 1, data: cum, symbolSize: 6, smooth: th.style.smooth, lineStyle: { width: 2, color: th.series[1] }, itemStyle: { color: th.series[1] },
        markLine: { silent: true, symbol: "none", data: [{ yAxis: 80 }], lineStyle: { color: th.axis, type: "solid" }, label: { formatter: "80%", color: th.muted } } },
    ];
    o.axisPointer = { link: [{ xAxisIndex: "all" }] };
    o.tooltip.formatter = (ps) => {
      const i = ps[0].dataIndex, r = rows[i];
      return `<b>${esc(r.label)}</b><br>${esc(label(t, key))}: <b>${esc(full(t, key, r.values[key]))}</b><br>Cumulative: ${cum[i].toFixed(1)}% of shown`;
    };
    return o;
  };
})();
