/* Chart catalog: every chart that fits a table, ranked. The gallery shows the catalog and the
   user picks; `recommended` (top 2 per table) are pre-checked. Nothing here invents numbers:
   stacked charts need proven components, KPI items need Grand Totals, waterfalls need a
   derived variance whose totals reconcile. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;

  const TYPE_NAMES = {
    "rank:bars": "Ranked bars", "rank:column": "Column chart", "rank:lollipop": "Lollipop", "rank:share": "Bars with % of total",
    grouped: "Grouped bars", stacked: "Stacked bars", stacked100: "100% stacked bars", bullet: "Plan vs actual bars",
    variance: "Variance bars", pareto: "Pareto", stat: "Big number", varianceTile: "Variance tile", ring: "Progress ring",
    gauge: "Gauge", bulletTotal: "Total vs plan bar", donut: "Donut", treemap: "Treemap", radar: "Radar", funnel: "Funnel",
    polar: "Polar bars", waterfall: "Waterfall", scatter: "Scatter (plan vs actual)", heatmap: "Heatmap", table: "Data table",
    "buttonBar:measures": "Measure switcher buttons", "buttonBar:custom": "Custom button bar",
    trend: "Trend line", lines: "Lines across columns", sunburst: "Sunburst (hierarchy)",
    filterPane: "Filter pane", dropdown: "Dropdown filter", buttons: "Button filter", range: "Range filter", dateRange: "Date range filter", valueRange: "Value range slider",
  };
  const FAMILIES = [["bars", "Bars"], ["kpi", "KPI"], ["filters", "Filters"], ["composition", "Composition"], ["other", "Other"], ["table", "Tables"]];
  const FAMILY_OF = { rank: "bars", grouped: "bars", stacked: "bars", stacked100: "bars", bullet: "bars", variance: "bars", pareto: "bars",
    stat: "kpi", varianceTile: "kpi", ring: "kpi", gauge: "kpi", bulletTotal: "kpi", donut: "composition", treemap: "composition",
    radar: "other", funnel: "other", polar: "other", waterfall: "other", scatter: "other", heatmap: "other", table: "table",
    trend: "other", lines: "other", sunburst: "composition", buttonBar: "filters", filterPane: "filters", dropdown: "filters", buttons: "filters", range: "filters", dateRange: "filters", valueRange: "filters" };
  const DOM_TYPES = new Set(["buttonBar", "stat", "varianceTile", "table", "filterPane", "dropdown", "buttons", "range", "dateRange", "valueRange"]);

  const colLabel = (t, k) => (t.columns.find((c) => c.key === k) || { label: k }).label;
  const baseMeasures = (t) => t.columns.filter((c) => c.role === "measure" && !c.derived && c.measureType !== "percent");
  const typeName = (s) => TYPE_NAMES[s.variant ? `${s.type}:${s.variant}` : s.type] || TYPE_NAMES[s.type] || s.type;
  const nonNeg = (t, k) => t.rows.every((r) => r.values[k] == null || r.values[k] >= 0);

  function topShare(t, key, n) {
    const vals = t.rows.map((r) => r.values[key]).filter((v) => v != null && v > 0).sort((a, b) => b - a);
    const tot = U.sum(vals);
    return tot ? U.sum(vals.slice(0, n)) / tot : 0;
  }

  // Measures worth a chart, most relevant first: primary, plan, then by Grand Total size.
  function rankedMeasures(t) {
    const p = t.profile, base = baseMeasures(t);
    const g = (k) => (t.totals.grand && t.totals.grand[k]) || U.sum(t.rows.map((r) => r.values[k]));
    const rest = base.filter((m) => m.key !== p.primary && m.key !== p.plan).sort((a, b) => g(b.key) - g(a.key));
    return [p.primary, p.plan, ...rest.map((m) => m.key)].filter((k, i, a) => k && a.indexOf(k) === i);
  }

  function titleFor(t, s) {
    const dim = t.dimensionLabels[0] || "Item";
    const m = s.measure ? colLabel(t, s.measure) : "";
    switch (s.type) {
      case "rank": return s.variant === "share" ? `${m} share of total by ${dim}` : `${m} by ${dim}`;
      case "grouped": case "stacked": case "stacked100": {
        const ms = (s.measures || []).map((k) => colLabel(t, k));
        const what = ms.length <= 3 ? ms.join(" vs ") : "Measures compared";
        return `${what} by ${dim}${s.type === "stacked100" ? " (100%)" : ""}`;
      }
      case "bullet": return `${colLabel(t, s.actual)} against ${colLabel(t, s.plan)} by ${dim}`;
      case "variance": return `${m} variance by ${dim}`;
      case "pareto": return `${m} concentration by ${dim}`;
      case "stat": return `${t.totals.grandLabel || "Grand Total"}: ${m}`;
      case "varianceTile": return `${m}: total variance`;
      case "ring": return `${colLabel(t, s.actual)} as % of ${colLabel(t, s.plan)}`;
      case "gauge": return `${colLabel(t, s.actual)} vs ${colLabel(t, s.plan)} gauge`;
      case "bulletTotal": return `Total ${colLabel(t, s.actual)} vs ${colLabel(t, s.plan)}`;
      case "donut": case "treemap": return `Share of ${m} by ${dim}`;
      case "radar": return `Measure profile of top ${dim.toLowerCase()} members`;
      case "funnel": return `Top ${dim.toLowerCase()} members by ${m}`;
      case "polar": return `${m} by ${dim} (radial)`;
      case "waterfall": { const d = t.columns.find((c) => c.key === s.measure).derived; return `From ${colLabel(t, d.b)} to ${colLabel(t, d.a)} by ${dim}`; }
      case "scatter": return `${colLabel(t, s.plan)} vs ${colLabel(t, s.actual)} per ${dim.toLowerCase()}`;
      case "heatmap": return `All measures by ${dim} (column-scaled)`;
      case "table": return `${t.title}: data`;
      case "trend": return `${m} over time`;
      case "lines": return `${t.dimensionLabels[0] || "Members"} across ${baseMeasures(t).map((c) => c.label).slice(0, 1).concat(baseMeasures(t).slice(-1).map((c) => c.label)).join("–")}`;
      case "sunburst": return `${m} by ${t.dimensionLabels.join(" › ")}`;
      case "buttonBar": return s.variant === "measures" ? "Show measure" : "Buttons";
      case "filterPane": return `Filters: ${t.title}`;
      case "dropdown": return `Choose ${dim}`;
      case "buttons": return `${dim} buttons`;
      case "range": return `${dim} range`;
      case "dateRange": return `${dim}: date range`;
      case "valueRange": return `${m} range`;
      default: return m;
    }
  }

  function catalog(t) {
    const n = t.rows.length, p = t.profile, g = t.totals.grand;
    const items = [];
    const isFlat = t.meta.structure === "flat";
    const add = (spec, score) => {
      const s = { ...spec, tableId: t.id, family: FAMILY_OF[spec.type], dom: DOM_TYPES.has(spec.type), score };
      s.id = `${t.id}::${[s.type, s.variant || "", s.measure || "", s.plan || "", s.actual || "", (s.measures || []).length || ""].join(":")}`;
      s.title = titleFor(t, s);
      s.typeName = typeName(s);
      items.push(s);
    };
    const ms = rankedMeasures(t).slice(0, 3);
    const longTail = p.primary ? topShare(t, p.primary, Math.max(1, Math.ceil(n * 0.3))) : 0;

    // Raw flat rows repeat members, so they only get the data table and filters; the
    // summary tables built from them carry the charts.
    if (isFlat) {
      add({ type: "table" }, 30);
      add({ type: "filterPane", measure: p.primary }, 28);
      add({ type: "dropdown" }, 27);
      items.forEach((it) => (it.recommended = false));
      return items;
    }
    // Trend for time/date members (months, years, quarters)
    if ((p.dimensionType === "time" || DV.filters.isDateDim(t)) && p.primary && n >= 3) add({ type: "trend", measure: p.primary }, 93);
    // Cross-tab: one line per member across the time columns
    if (p.timeColumns && n >= 2) add({ type: "lines" }, 87);
    // Hierarchy: parent → child rings
    if (p.hierarchy && p.primary && nonNeg(t, p.primary)) add({ type: "sunburst", measure: p.primary }, 84);
    // Bars
    ms.forEach((k, i) => {
      if (n < 2) return;
      const w = i === 0 ? 0 : 12 + i * 4;
      add({ type: "rank", variant: "bars", measure: k }, (n >= 4 ? 90 : 60) - w);
      add({ type: "rank", variant: "column", measure: k }, 70 - w);
      add({ type: "rank", variant: "lollipop", measure: k }, 62 - w);
      if (g && g[k] && nonNeg(t, k)) add({ type: "rank", variant: "share", measure: k }, 66 - w);
    });
    const base = baseMeasures(t).map((c) => c.key);
    // Side-by-side bars share one axis, so only measures of the same kind (all money, all counts).
    const kindOf = (k) => (t.columns.find((c) => c.key === k) || {}).measureType;
    const primaryKind = kindOf(p.primary) || kindOf(base[0]);
    const sameKind = base.filter((k) => kindOf(k) === primaryKind);
    if (sameKind.length >= 2) add({ type: "grouped", measures: sameKind.slice(0, 5) }, n <= 3 ? 95 : n <= 12 ? 74 : 45);
    if (p.components) {
      add({ type: "stacked", measures: p.components.parts }, 78);
      add({ type: "stacked100", measures: p.components.parts }, 64);
    }
    p.pairs.slice(0, 2).forEach((pr, i) => { if (n >= 2) add({ type: "bullet", plan: pr.plan, actual: pr.actual }, (n <= 15 ? 80 : 62) - i * 10); });
    p.variance.forEach((k, i) => { if (n >= 2) add({ type: "variance", measure: k }, 89 - i * 6); });
    if (p.primary && n >= 5 && nonNeg(t, p.primary)) add({ type: "pareto", measure: p.primary }, n >= 8 && longTail >= 0.5 ? 88 : 48);

    // KPI items (Grand Totals only)
    if (g) {
      ms.forEach((k, i) => { if (g[k] != null) add({ type: "stat", measure: k }, 58 - i * 4); });
      p.variance.forEach((k) => { if (g[k] != null) add({ type: "varianceTile", measure: k }, 60); });
      const pr = p.pairs[0];
      if (pr && g[pr.plan] && g[pr.actual] != null) {
        add({ type: "ring", plan: pr.plan, actual: pr.actual }, 57);
        add({ type: "gauge", plan: pr.plan, actual: pr.actual }, 52);
        add({ type: "bulletTotal", plan: pr.plan, actual: pr.actual }, 50);
      }
    }

    // Composition + other
    if (p.primary && nonNeg(t, p.primary)) {
      if (n >= 2 && n <= 8) add({ type: "donut", measure: p.primary }, n <= 6 ? 72 : 50);
      if (n >= 3) add({ type: "treemap", measure: p.primary }, n > 8 ? 58 : 38);
      if (n >= 3) add({ type: "funnel", measure: p.primary }, 40);
      if (n >= 3 && n <= 12) add({ type: "polar", measure: p.primary }, 36);
    }
    if (base.length >= 3 && n >= 3) add({ type: "radar", measures: base.slice(0, 6), measure: p.primary }, 34);
    for (const k of p.variance) {
      const d = t.columns.find((c) => c.key === k).derived;
      // Waterfall only when plan total + Σ variances = actual total (it must reconcile on screen).
      if (g && g[d.a] != null && g[d.b] != null && U.approxEqual(g[d.b] + U.sum(t.rows.map((r) => r.values[k])), g[d.a])) add({ type: "waterfall", measure: k }, 70);
    }
    if (p.pairs.length && n >= 4) add({ type: "scatter", plan: p.pairs[0].plan, actual: p.pairs[0].actual }, n >= 6 ? 60 : 40);
    if (t.columns.filter((c) => c.role === "measure").length >= 3 && n >= 4) add({ type: "heatmap" }, n >= 6 ? 50 : 32);
    add({ type: "table" }, 30);

    // Filter controls (they show/hide members; they never recompute totals)
    if (n >= 2) {
      add({ type: "filterPane", measure: p.primary }, 28);
      if (baseMeasures(t).length >= 2) add({ type: "buttonBar", variant: "measures" }, 27.5);
      add({ type: "buttonBar", variant: "custom" }, 22);
      add({ type: "dropdown" }, 27);
      if (n <= 12) add({ type: "buttons" }, 26);
      if (DV.filters.isDateDim(t)) add({ type: "dateRange" }, 26);
      else if (["time", "ordered"].includes(p.dimensionType) && n >= 3) add({ type: "range" }, 25);
      ms.slice(0, 2).forEach((k, i) => add({ type: "valueRange", measure: k }, 24 - i));
    }

    items.sort((a, b) => b.score - a.score);
    // Recommend the two best charts from different families of meaning.
    const picked = [];
    for (const it of items) {
      if (picked.length >= 2) break;
      if (it.family === "kpi" || it.family === "filters" || it.type === "table") continue;
      if (picked.some((x) => x.type === it.type)) continue;
      picked.push(it);
    }
    picked.forEach((it) => (it.recommended = true));
    return items;
  }

  // Default spec for a type on a table (used by "swap type" in the chart menu).
  function specFor(t, type, prev) {
    const [ty, variant] = type.split(":");
    const cand = catalog(t).filter((c) => c.type === ty && (!variant || c.variant === variant));
    const same = prev && cand.find((c) => c.measure && c.measure === prev.measure);
    return same || cand[0] || null;
  }
  const fits = (t) => Object.fromEntries(catalog(t).filter((c) => !c.dom).map((c) => [c.variant ? `${c.type}:${c.variant}` : c.type, true]));

  function insight(t, view) {
    const p = t.profile, n = t.rows.length;
    const noun = U.pluralize((t.dimensionLabels[0] || "item").toLowerCase(), n);
    const parts = [`${n} ${noun}`];
    if (p.primary && n >= 4) {
      const k = Math.min(3, n - 1);
      parts.push(`top ${k} account for ${Math.round(topShare(t, p.primary, k) * 100)}% of ${colLabel(t, p.primary)}`);
    }
    const vi = DV.filters.varianceInfo(t);
    if (vi) parts.push(`${t.rows.filter((r) => DV.filters.isOver(vi, r.values[vi.key])).length} of ${n} over budget`);
    let s = parts.join("; ");
    if (view && view.isFiltered && view.share != null) s += ` · showing ${view.rows.length} of ${n}`;
    return s;
  }

  // Backwards-compatible: the recommended items (used for "Skip: use recommended").
  const recommend = (t) => catalog(t).filter((c) => c.recommended);

  DV.recommender = { catalog, recommend, fits, specFor, titleFor, typeName, insight, baseMeasures, colLabel, TYPE_NAMES, FAMILIES, FAMILY_OF };
})();
