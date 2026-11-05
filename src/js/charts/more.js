/* Other families: donut, treemap, radar, funnel, polar bars, waterfall, scatter, heatmap. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils, B = DV.charts.BUILDERS;
  const { label, full, colorOfRow, mark, alpha, base, catAxis, valAxis, foldRows, itemExtra, tooltipFor, brush, esc } = { ...DV.charts.h, esc: DV.charts.esc };

  const positiveRows = (ctx, key) => ctx.view.rows.filter((r) => r.values[key] > 0).slice().sort((a, b) => b.values[key] - a.values[key]);

  function composition(t, spec, ctx, kind) {
    const th = ctx.theme, key = spec.measure, c = ctx.custom || {};
    const { rows: shown, other } = foldRows(positiveRows(ctx, key), key, c.topN || (kind === "donut" ? 6 : 40));
    // Colors follow the member's original position, so filtering never repaints survivors.
    const data = shown.map((r) => ({ name: r.label, value: r.values[key], itemStyle: { color: kind === "donut" ? colorOfRow(r, th) : th.series[0], ...itemExtra(ctx, r.label) } }));
    if (other) data.push({ name: other.label, value: other.value, itemStyle: { color: th.other } });
    const o = base(th, { legend: kind === "donut" });
    o.tooltip.formatter = tooltipFor(t, ctx, key);
    if (kind === "donut") {
      const tot = U.sum(data.map((x) => x.value));
      o.legend = { ...o.legend, top: "auto", bottom: 0, left: "center", right: "auto" };
      o.series = [{ type: "pie", radius: ["48%", "70%"], center: ["50%", "46%"], data, avoidLabelOverlap: true,
        itemStyle: { borderColor: th.style.outline ? th.markBorder : th.surface, borderWidth: 2, borderRadius: th.style.radius, shadowBlur: th.style.glow, shadowColor: alpha(th.series[0], 0.4) },
        label: { show: true, formatter: (p) => (p.percent >= 6 ? p.percent.toFixed(0) + "%" : ""), color: th.text2 }, labelLine: { length: 6, length2: 6 } }];
      o.title = { text: U.formatCompact(tot), subtext: ctx.view.isFiltered ? "selected" : "total", left: "50%", top: "38%", textAlign: "center", itemGap: 2,
        textStyle: { color: th.text, fontSize: 16, fontWeight: 700, fontFamily: th.fontNum }, subtextStyle: { color: th.muted, fontSize: 11 } };
    } else {
      o.series = [{ type: "treemap", data, roam: false, nodeClick: false, breadcrumb: { show: false }, width: "100%", height: "100%", top: 0, left: 0,
        itemStyle: { borderColor: th.style.outline ? th.markBorder : th.surface, borderWidth: 2, gapWidth: 2, borderRadius: Math.min(th.style.radius, 8) },
        label: { show: true, formatter: (p) => `${p.name}\n${U.formatCompact(p.value)}`, fontSize: 11, overflow: "truncate", color: th.mode === "dark" ? th.text : th.surface } }];
    }
    return o;
  }
  B.donut = (t, s, c) => composition(t, s, c, "donut");
  B.treemap = (t, s, c) => composition(t, s, c, "treemap");

  // Radar: each measure scaled to its column max, top members only (≤5 series).
  B.radar = function (t, spec, ctx) {
    const th = ctx.theme;
    const keys = (spec.measures || []).filter((k) => ctx.view.measures.includes(k)).slice(0, 6);
    const rows = positiveRows(ctx, spec.measure || keys[0]).slice(0, 5);
    const maxOf = (k) => Math.max(...t.rows.map((r) => Math.abs(r.values[k] || 0))) || 1;
    const o = base(th, { legend: true });
    o.radar = { indicator: keys.map((k) => ({ name: label(t, k), max: 100 })), radius: "62%", center: ["50%", "56%"],
      axisName: { color: th.text2 }, splitLine: { lineStyle: { color: th.grid } }, splitArea: { show: false }, axisLine: { lineStyle: { color: th.grid } } };
    o.series = [{ type: "radar", symbolSize: 5, data: rows.map((r) => ({
      name: r.label, value: keys.map((k) => +((r.values[k] || 0) / maxOf(k) * 100).toFixed(1)), raw: keys.map((k) => r.values[k]),
      lineStyle: { color: colorOfRow(r, th), width: 2 }, itemStyle: { color: colorOfRow(r, th) }, areaStyle: { color: alpha(colorOfRow(r, th), 0.12) },
    })) }];
    o.tooltip.formatter = (p) => [`<b>${esc(p.name)}</b>`].concat(keys.map((k, i) => `${esc(label(t, k))}: ${esc(full(t, k, p.data.raw[i]))}`)).join("<br>");
    return o;
  };

  B.funnel = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure;
    const rows = positiveRows(ctx, key).slice(0, 8);
    const o = base(th);
    o.series = [{ type: "funnel", left: "8%", width: "84%", top: 8, bottom: 8, sort: "descending", gap: 3, minSize: "12%",
      label: { show: true, position: "inside", formatter: (p) => `${p.name}  ${U.formatCompact(p.value)}`, color: th.mode === "dark" ? th.text : th.surface, overflow: "truncate" },
      itemStyle: { borderColor: th.style.outline ? th.markBorder : th.surface, borderWidth: th.style.outline ? 2 : 1 },
      data: rows.map((r) => ({ name: r.label, value: r.values[key], itemStyle: { color: colorOfRow(r, th), ...itemExtra(ctx, r.label) } })) }];
    o.tooltip.formatter = tooltipFor(t, ctx, key);
    return o;
  };

  B.polar = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure;
    const rows = positiveRows(ctx, key).slice(0, 12);
    const o = base(th);
    o.polar = { radius: ["14%", "78%"] };
    o.angleAxis = { type: "category", data: rows.map((r) => r.label), axisLabel: { color: th.text2, width: 80, overflow: "truncate" }, axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false } };
    o.radiusAxis = { axisLabel: { color: th.muted, formatter: (v) => U.formatCompact(v) }, splitLine: { lineStyle: { color: th.grid } }, axisLine: { show: false } };
    o.series = [{ type: "bar", coordinateSystem: "polar", name: label(t, key), roundCap: th.style.radius > 0,
      data: rows.map((r) => ({ value: r.values[key], name: r.label, itemStyle: { ...mark(th, th.series[0], null), ...itemExtra(ctx, r.label) } })) }];
    o.tooltip.formatter = tooltipFor(t, ctx, key);
    return o;
  };

  // Waterfall: plan Grand Total → each member's variance → actual Grand Total.
  // Hidden members are one "Other members" step, so the end bar always reconciles.
  B.waterfall = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure;
    const d = t.columns.find((c) => c.key === key).derived;
    const start = t.totals.grand[d.b], end = t.totals.grand[d.a];
    const shown = ctx.view.rows.filter((r) => r.values[key] != null).slice().sort((a, b) => b.values[key] - a.values[key]).slice(0, 12);
    const shownSet = new Set(shown.map((r) => r.index));
    const rest = U.sum(t.rows.filter((r) => !shownSet.has(r.index)).map((r) => r.values[key]));
    const steps = shown.map((r) => ({ name: r.label, v: r.values[key] }));
    if (Math.abs(rest) > 0.005) steps.push({ name: "Other members", v: rest, other: true });
    const names = [label(t, d.b), ...steps.map((s) => s.name), label(t, d.a)];
    let run = start;
    const baseData = [0], up = [{ value: start, itemStyle: { color: th.series[0] } }], down = [null];
    for (const s of steps) {
      const lo = s.v >= 0 ? run : run + s.v;
      baseData.push(lo);
      const item = { value: Math.abs(s.v), name: s.name, signed: s.v, itemStyle: { color: s.other ? th.other : s.v >= 0 ? th.over : th.under, ...itemExtra(ctx, s.name) } };
      if (s.v >= 0) { up.push(item); down.push(null); } else { down.push(item); up.push(null); }
      run += s.v;
    }
    baseData.push(0); up.push({ value: end, itemStyle: { color: th.series[0] } }); down.push(null);
    const o = base(th);
    o.grid.bottom = 8;
    o.xAxis = catAxis(th, names, { axisLabel: { color: th.text2, rotate: 35, width: 80, overflow: "truncate", interval: 0, hideOverlap: true } });
    o.yAxis = valAxis(th, (v) => U.formatCompact(v), { min: (v) => Math.max(0, v.min - (v.max - v.min) * 0.15) });
    const r = th.style.radius;
    o.series = [
      { type: "bar", stack: "w", data: baseData, itemStyle: { color: "transparent" }, silent: true, tooltip: { show: false } },
      { type: "bar", stack: "w", name: "Increase", data: up, barMaxWidth: 28, itemStyle: { borderRadius: r } },
      { type: "bar", stack: "w", name: "Decrease", data: down, barMaxWidth: 28, itemStyle: { borderRadius: r } },
    ];
    o.tooltip.formatter = (p) => {
      if (p.dataIndex === 0) return `<b>${esc(label(t, d.b))}</b><br>${esc(full(t, d.b, start))}`;
      if (p.dataIndex === names.length - 1) return `<b>${esc(label(t, d.a))}</b><br>${esc(full(t, d.a, end))}`;
      return `<b>${esc(p.name)}</b><br>${esc(label(t, key))}: <b>${esc(full(t, key, p.data.signed))}</b>`;
    };
    return o;
  };

  B.scatter = function (t, spec, ctx) {
    const th = ctx.theme, c = ctx.custom || {};
    const rows = ctx.view.rows.filter((r) => r.values[spec.plan] != null && r.values[spec.actual] != null);
    const all = rows.flatMap((r) => [r.values[spec.plan], r.values[spec.actual]]);
    const lo = Math.min(0, ...all), hi = Math.max(...all) * 1.05;
    const pt = (r) => ({ value: [r.values[spec.plan], r.values[spec.actual]], name: r.label, itemStyle: itemExtra(ctx, r.label) });
    const ring = { borderColor: th.surface, borderWidth: 2 };
    const o = base(th, { legend: true });
    o.xAxis = valAxis(th, (v) => U.formatCompact(v), { name: label(t, spec.plan), nameLocation: "middle", nameGap: 26, nameTextStyle: { color: th.text2 }, min: lo, max: hi });
    o.yAxis = valAxis(th, (v) => U.formatCompact(v), { name: label(t, spec.actual), nameTextStyle: { color: th.text2 }, min: lo, max: hi });
    o.grid.bottom = 28;
    const lbl = { show: !!c.labels, formatter: (p) => p.name, position: "right", color: th.text2, fontSize: 10 };
    o.series = [
      { type: "scatter", name: "Over plan", symbolSize: 12, itemStyle: { color: th.over, ...ring, shadowBlur: th.style.glow, shadowColor: alpha(th.over, 0.6) }, data: rows.filter((r) => r.values[spec.actual] > r.values[spec.plan]).map(pt), label: lbl },
      { type: "scatter", name: "At or under plan", symbolSize: 12, itemStyle: { color: th.under, ...ring, shadowBlur: th.style.glow, shadowColor: alpha(th.under, 0.6) }, data: rows.filter((r) => r.values[spec.actual] <= r.values[spec.plan]).map(pt), label: lbl },
      { type: "line", name: "y = x", data: [[lo, lo], [hi, hi]], symbol: "none", silent: true, lineStyle: { color: th.axis, width: 1 }, tooltip: { show: false }, endLabel: { show: true, formatter: "on plan", color: th.muted, fontSize: 10 } },
    ];
    o.legend.data = ["Over plan", "At or under plan"];
    o.tooltip.formatter = (p) => `<b>${esc(p.name)}</b><br>${esc(label(t, spec.plan))}: ${esc(full(t, spec.plan, p.value[0]))}<br>${esc(label(t, spec.actual))}: <b>${esc(full(t, spec.actual, p.value[1]))}</b>`;
    o.brush = brush(th, "rect");
    return o;
  };

  B.heatmap = function (t, spec, ctx) {
    const th = ctx.theme;
    const keys = t.columns.filter((c) => c.role === "measure" && ctx.view.measures.includes(c.key)).map((c) => c.key);
    const rows = ctx.view.rows, data = [];
    keys.forEach((k, xi) => {
      const vs = rows.map((r) => r.values[k]).filter((v) => v != null);
      const lo = Math.min(...vs), hi = Math.max(...vs);
      rows.forEach((r, yi) => {
        const v = r.values[k];
        data.push({ value: [xi, yi, v == null ? null : hi === lo ? 0.5 : (v - lo) / (hi - lo)], raw: v, key: k, name: r.label });
      });
    });
    const o = base(th);
    o.grid = { left: 8, right: 16, top: 8, bottom: 40, containLabel: true };
    o.xAxis = catAxis(th, keys.map((k) => label(t, k)), { position: "top", axisLabel: { color: th.text2, interval: 0, width: 80, overflow: "truncate" } });
    o.yAxis = catAxis(th, rows.map((r) => r.label), { inverse: true });
    o.visualMap = { min: 0, max: 1, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 120, text: ["high", "low (per column)"],
      textStyle: { color: th.muted, fontSize: 11 }, inRange: { color: [th.neutral, th.series[0]] } };
    o.series = [{ type: "heatmap", data, itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: Math.min(th.style.radius, 4) },
      label: { show: rows.length <= 16, formatter: (p) => U.formatCompact(p.data.raw), fontSize: 10, color: th.text } }];
    o.tooltip.formatter = (p) => `<b>${esc(p.data.name)}</b><br>${esc(label(t, p.data.key))}: <b>${esc(full(t, p.data.key, p.data.raw))}</b>`;
    return o;
  };

  // Trend: members in their natural (time) order, one measure, line + soft area.
  B.trend = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure;
    const rows = ctx.view.rows.slice().sort((a, b) => a.index - b.index).filter((r) => r.values[key] != null);
    const o = base(th, { trigger: "axis" });
    o.xAxis = catAxis(th, rows.map((r) => r.label), { boundaryGap: false, axisLabel: { color: th.text2, hideOverlap: true } });
    o.yAxis = valAxis(th, (v) => U.formatCompact(v));
    const color = th.series[0];
    o.series = [{ type: "line", name: label(t, key), smooth: th.style.smooth, symbolSize: 6, lineStyle: { width: 2.5, color }, itemStyle: { color },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha(color, 0.28) }, { offset: 1, color: alpha(color, 0.02) }] } },
      data: rows.map((r) => ({ value: r.values[key], name: r.label, itemStyle: itemExtra(ctx, r.label) })) }];
    o.tooltip.formatter = (ps) => `<b>${esc(ps[0].name)}</b><br>${esc(label(t, key))}: <b>${esc(full(t, key, ps[0].value))}</b>`;
    if (rows.length > 24) o.dataZoom = [{ type: "inside" }];
    return o;
  };

  // Cross-tab lines: x = the time columns, one line per member (top 6 by row total).
  B.lines = function (t, spec, ctx) {
    const th = ctx.theme;
    const cols = t.columns.filter((c) => c.role === "measure" && !c.derived && ctx.view.measures.includes(c.key));
    const tot = (r) => U.sum(cols.map((c) => r.values[c.key]));
    const rows = ctx.view.rows.slice().sort((a, b) => tot(b) - tot(a)).slice(0, 6);
    const o = base(th, { legend: true, trigger: "axis" });
    o.xAxis = catAxis(th, cols.map((c) => c.label), { boundaryGap: false });
    o.yAxis = valAxis(th, (v) => U.formatCompact(v));
    o.series = rows.map((r) => ({ type: "line", name: r.label, smooth: th.style.smooth, symbolSize: 6, lineStyle: { width: 2, color: colorOfRow(r, th) },
      itemStyle: { color: colorOfRow(r, th), ...itemExtra(ctx, r.label) }, emphasis: { focus: "series" }, data: cols.map((c) => r.values[c.key]) }));
    o.tooltip.formatter = (ps) => [`<b>${esc(ps[0].axisValue)}</b>`].concat(ps.map((p) => `${p.marker}${esc(p.seriesName)}: <b>${esc(full(t, cols[p.dataIndex].key, p.value))}</b>`)).join("<br>");
    return o;
  };

  // Sunburst: parent ring (first dimension) → children; subtotal rows never enter it.
  B.sunburst = function (t, spec, ctx) {
    const th = ctx.theme, key = spec.measure;
    const groups = new Map();
    for (const r of ctx.view.rows) {
      if (!(r.values[key] > 0)) continue;
      const p = r.parent || r.label;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(r);
    }
    let i = 0;
    const data = [...groups.entries()].map(([p, rs]) => {
      const color = th.series[i++ % 8];
      return { name: p, itemStyle: { color }, children: rs.map((r) => ({ name: r.label.split(" › ").pop(), value: r.values[key], full: r.label, itemStyle: { color: alpha(color, 0.72), ...itemExtra(ctx, r.label) } })) };
    });
    const o = base(th);
    o.series = [{ type: "sunburst", data, radius: ["12%", "92%"], sort: null, nodeClick: false,
      itemStyle: { borderColor: th.surface, borderWidth: 2, borderRadius: Math.min(th.style.radius, 6) },
      label: { color: th.mode === "dark" ? th.text : th.surface, fontSize: 11, minAngle: 12 },
      levels: [{}, { label: { rotate: 0, fontWeight: 600 } }, { label: { rotate: "radial" } }] }];
    o.tooltip.formatter = (p) => `<b>${esc(p.data.full || p.name)}</b><br>${esc(label(t, key))}: <b>${esc(full(t, key, p.value))}</b>`;
    return o;
  };
})();
