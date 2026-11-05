/* Summary-mode filters. Pre-aggregated rows are shown/hidden, never re-aggregated:
   we report "Selected X of Y: Z% of Grand Total" instead of inventing a new total. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;

  const empty = () => ({ members: {}, topN: {}, minValue: {}, range: {}, valueRange: {}, sectionMeasure: {}, measures: null, sort: "value", variance: "all", search: "" });

  // Dates in labels: ISO "2024-03-31", "2024-03", "Mar 2024", "31/03/2024". Years and plain
  // numbers are not dates (they are ordered categories). Returns epoch ms or null.
  function dateOf(label) {
    const s = U.normText(label);
    let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(s);
    if (m) return Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
    m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    if (/^[A-Za-z]{3,9}\.? \d{4}$/.test(s) || /^[A-Za-z]{3,9} \d{1,2},? \d{4}$/.test(s)) { const t = Date.parse(s + " UTC"); return isNaN(t) ? null : t; }
    return null;
  }
  // ---- Field scopes: filters target a FIELD ("dim:scope", "m:total eac"), not a table, so one
  // filter card filters every table on the page that has that field. Tables without the field
  // are left untouched (and report it in view().unaffected). Legacy table-id keys still work.
  const dimKeyOf = (label) => "dim:" + U.normKey(label || "");
  const dimKey = (table) => dimKeyOf(table.dimensionLabels[0]);
  const measureKeyOf = (label) => "m:" + U.normKey(label || "");
  const memberKey = (label) => U.normText(label).toLowerCase();
  const firstDim = (t) => t.columns.find((c) => c.role === "dimension") || null;
  // A row's value for a dimension column (first dimension by default; whole label otherwise).
  const dimValue = (t, r, col) => { col = col || firstDim(t); return col ? (r.labels[col.key] || "") : r.label; };
  const colForScope = (t, scope) => (scope.startsWith("dim:") ? t.columns.find((c) => c.role === "dimension" && U.normKey(c.label) === scope.slice(4)) || null : null);
  const measureForScope = (t, scope) => (scope.startsWith("m:") ? t.columns.find((c) => (c.role === "measure" || c.role === "total") && U.normKey(c.label) === scope.slice(2)) || null : null);

  // Distinct values of a dimension in natural order: by date when they are dates, else Excel order.
  function memberOrder(table, col) {
    const seen = new Set(), out = [];
    for (const r of table.rows) { const v = dimValue(table, r, col); if (!seen.has(memberKey(v))) { seen.add(memberKey(v)); out.push(v); } }
    if (out.length >= 2 && out.every((v) => dateOf(v) != null)) out.sort((a, b) => dateOf(a) - dateOf(b));
    return out;
  }
  const isDateDim = (table) => { const v = memberOrder(table); return v.length >= 2 && v.every((x) => dateOf(x) != null); };

  // Dimensions shared by ≥2 tables get one page-wide member filter in the filter bar.
  function sharedDimensions(tables) {
    const by = {};
    for (const t of tables) {
      for (const c of t.columns.filter((x) => x.role === "dimension")) {
        const k = dimKeyOf(c.label);
        const e = (by[k] = by[k] || { key: k, label: c.label, tables: [], members: new Map() });
        if (!e.tables.includes(t.id)) e.tables.push(t.id);
        for (const r of t.rows) { const v = dimValue(t, r, c); e.members.set(memberKey(v), v); }
      }
    }
    return Object.values(by).filter((d) => d.tables.length >= 2);
  }

  function varianceInfo(table) {
    const key = table.profile && table.profile.variance[0];
    if (!key) return null;
    const col = table.columns.find((c) => c.key === key);
    const overIsPositive = /^over/i.test(col.derived.positiveLabel) || (!/^under/i.test(col.derived.positiveLabel) && !col.derived.positiveIsGood);
    return { key, col, overIsPositive };
  }
  const isOver = (vi, v) => v != null && (vi.overIsPositive ? v > 0 : v < 0);

  function effectiveMeasures(table, filters) {
    const ms = table.columns.filter((c) => c.role === "measure");
    if (!filters.measures || !filters.measures.length) return ms.map((m) => m.key);
    return ms.filter((m) => filters.measures.includes(U.normKey(m.label))).map((m) => m.key);
  }

  function sortRows(rows, mode, key, vi) {
    const out = rows.slice();
    if (mode === "label") out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    else if (mode === "original") out.sort((a, b) => a.index - b.index);
    else if (mode === "variance" && vi) out.sort((a, b) => (b.values[vi.key] ?? -Infinity) - (a.values[vi.key] ?? -Infinity));
    else if (key) out.sort((a, b) => (b.values[key] ?? -Infinity) - (a.values[key] ?? -Infinity));
    return out;
  }

  // Row predicates for every active filter that applies to this table.
  function predicates(table, filters, unaffected) {
    const tests = [];
    const note = (scope) => { if (scope.startsWith("dim:") || scope.startsWith("m:")) unaffected.add(scope); };
    for (const [scope, labels] of Object.entries(filters.members || {})) {
      const set = new Set(labels.map(memberKey));
      if (scope === table.id) { tests.push((r) => set.has(memberKey(r.label))); continue; }
      const col = colForScope(table, scope);
      if (col) tests.push((r) => set.has(memberKey(dimValue(table, r, col)))); else note(scope);
    }
    for (const [scope, rg] of Object.entries(filters.range || {})) {
      const col = scope === table.id ? firstDim(table) : colForScope(table, scope);
      if (!col && scope !== table.id) { note(scope); continue; }
      if (rg.dates) {
        tests.push((r) => { const p = dateOf(dimValue(table, r, col)); return p != null && (rg.from == null || p >= rg.from) && (rg.to == null || p <= rg.to); });
      } else {
        const order = memberOrder(table, col).map(memberKey);
        const lo = rg.from != null ? order.indexOf(memberKey(rg.from)) : 0, hi = rg.to != null ? order.indexOf(memberKey(rg.to)) : order.length - 1;
        // A bound this table doesn't have can't be applied honestly: leave the table as is.
        if (lo < 0 || hi < 0) { note(scope); continue; }
        tests.push((r) => { const p = order.indexOf(memberKey(dimValue(table, r, col))); return p >= lo && p <= hi; });
      }
    }
    for (const [scope, vr] of Object.entries(filters.valueRange || {})) {
      const col = scope === table.id ? table.columns.find((c) => c.key === vr.key) : measureForScope(table, scope);
      if (!col) { if (scope !== table.id) note(scope); continue; }
      tests.push((r) => { const v = r.values[col.key]; return v != null && (vr.min == null || v >= vr.min - 1e-9) && (vr.max == null || v <= vr.max + 1e-9); });
    }
    return tests;
  }

  function view(table, filters, opts = {}) {
    const primary = opts.measure || table.profile.primary;
    const vi = varianceInfo(table);
    const unaffected = new Set();
    const tests = predicates(table, filters, unaffected);
    const q = (filters.search || "").trim().toLowerCase();
    const min = (filters.minValue || {})[table.id];
    let rows = table.rows.filter((r) => {
      for (const t of tests) if (!t(r)) return false;
      if (q && !r.label.toLowerCase().includes(q)) return false;
      if (vi && filters.variance !== "all") {
        const over = isOver(vi, r.values[vi.key]);
        if (filters.variance === "over" ? !over : over || r.values[vi.key] == null) return false;
      }
      if (min != null && primary && (r.values[primary] == null || r.values[primary] < min)) return false;
      return true;
    });
    const filtered = rows.length;
    rows = sortRows(rows, opts.sort || filters.sort, primary, vi);
    let tn = opts.topN || (filters.topN || {})[table.id];
    if (!tn) for (const [scope, x] of Object.entries(filters.topN || {})) { if (colForScope(table, scope)) { tn = x; break; } else if (scope.startsWith("dim:")) unaffected.add(scope); }
    if (tn && tn.n > 0 && rows.length > tn.n) {
      const ranked = sortRows(rows, "value", primary, vi);
      const keep = new Set((tn.dir === "bottom" ? ranked.slice(-tn.n) : ranked.slice(0, tn.n)).map((r) => r.index));
      rows = rows.filter((r) => keep.has(r.index));
    }
    const grand = table.totals.grand && primary ? table.totals.grand[primary] : null;
    const selSum = primary ? U.sum(rows.map((r) => r.values[primary])) : null;
    return {
      rows, total: table.rows.length, filtered, primary, variance: vi,
      measures: effectiveMeasures(table, filters),
      isFiltered: rows.length !== table.rows.length,
      selectedSum: selSum,
      share: grand ? selSum / grand : null,
      unaffected: [...unaffected],
    };
  }

  // Display name of a field scope, found on any of the given tables.
  function scopeLabel(scope, tables) {
    for (const t of tables || []) {
      const c = colForScope(t, scope) || measureForScope(t, scope);
      if (c) return c.label;
    }
    return scope.replace(/^(dim|m):/, "");
  }

  // Pure transforms. Each returns a new filters object.
  const clone = (f) => U.deepClone(f);
  function toggleMember(f, scope, label, allLabels) {
    f = clone(f);
    const cur = f.members[scope] ? f.members[scope].slice() : allLabels.slice();
    const i = cur.findIndex((x) => memberKey(x) === memberKey(label));
    if (i >= 0) cur.splice(i, 1); else cur.push(label);
    if (cur.length === allLabels.length) delete f.members[scope]; else f.members[scope] = cur;
    return f;
  }
  function setMembers(f, scope, labels) { f = clone(f); if (labels == null) delete f.members[scope]; else f.members[scope] = labels.slice(); return f; }
  function setTopN(f, tableId, tn) { f = clone(f); if (!tn || !tn.n) delete f.topN[tableId]; else f.topN[tableId] = tn; return f; }
  function setRange(f, tableId, r) { f = clone(f); f.range = f.range || {}; if (!r || (r.from == null && r.to == null)) delete f.range[tableId]; else f.range[tableId] = r; return f; }
  function setValueRange(f, tableId, r) { f = clone(f); f.valueRange = f.valueRange || {}; if (!r || (r.min == null && r.max == null)) delete f.valueRange[tableId]; else f.valueRange[tableId] = r; return f; }
  // Button bars: "show column X" for one section (or "*" = whole dashboard). Stored by the
  // column's normalized name so it applies to every table that has that column.
  function setSectionMeasure(f, scope, m) { f = clone(f); f.sectionMeasure = f.sectionMeasure || {}; if (!m) delete f.sectionMeasure[scope]; else f.sectionMeasure[scope] = m; return f; }
  // Clear every filter that reaches this table (its fields, plus legacy table-id keys).
  function clearTable(f, table) {
    f = clone(f);
    const mine = (scope) => scope === table.id || !!colForScope(table, scope) || !!measureForScope(table, scope);
    for (const k of ["members", "topN", "minValue", "range", "valueRange"]) if (f[k]) for (const scope of Object.keys(f[k])) if (mine(scope)) delete f[k][scope];
    return f;
  }
  function setMin(f, tableId, v) { f = clone(f); if (v == null || v === "" || isNaN(v)) delete f.minValue[tableId]; else f.minValue[tableId] = +v; return f; }
  function toggleMeasure(f, key, all) {
    f = clone(f);
    const cur = f.measures ? f.measures.slice() : all.slice();
    const i = cur.indexOf(key);
    if (i >= 0) cur.splice(i, 1); else cur.push(key);
    f.measures = cur.length === all.length || !cur.length ? null : cur;
    return f;
  }

  // Chips describing every active filter, each with a transform that removes it.
  function describe(f, tables) {
    const chips = [];
    const nameOf = (scope) => {
      if (scope.startsWith("dim:") || scope.startsWith("m:")) return scopeLabel(scope, tables);
      const t = tables.find((x) => x.id === scope); return t ? t.title : scope;
    };
    for (const [scope, labels] of Object.entries(f.members || {})) {
      const what = labels.length <= 2 ? labels.join(", ") : `${labels.length} selected`;
      chips.push({ label: `${nameOf(scope)}: ${what || "none"}`, remove: (x) => setMembers(x, scope, null) });
    }
    for (const [id, tn] of Object.entries(f.topN || {})) chips.push({ label: `${nameOf(id)}: ${tn.dir === "bottom" ? "Bottom" : "Top"} ${tn.n}`, remove: (x) => setTopN(x, id, null) });
    for (const [id, r] of Object.entries(f.range || {})) {
      const fmt = (v) => (r.dates ? new Date(v).toISOString().slice(0, 10) : v);
      chips.push({ label: `${nameOf(id)}: ${r.from != null ? fmt(r.from) : "start"} → ${r.to != null ? fmt(r.to) : "end"}`, remove: (x) => setRange(x, id, null) });
    }
    for (const [id, r] of Object.entries(f.valueRange || {})) {
      const t = tables.find((x) => x.id === id);
      const lbl = id.startsWith("m:") ? scopeLabel(id, tables) : t ? (t.columns.find((c) => c.key === r.key) || { label: r.key }).label : r.key;
      chips.push({ label: `${lbl} ${r.min != null ? U.formatCompact(r.min) : "…"}–${r.max != null ? U.formatCompact(r.max) : "…"}`, remove: (x) => setValueRange(x, id, null) });
    }
    for (const [sec, m] of Object.entries(f.sectionMeasure || {})) chips.push({ label: `Showing: ${m.label}${sec === "*" ? "" : " (section)"}`, remove: (x) => { x = clone(x); delete x.sectionMeasure[sec]; return x; } });
    for (const [id, v] of Object.entries(f.minValue || {})) chips.push({ label: `${nameOf(id)}: ≥ ${U.formatCompact(v)}`, remove: (x) => setMin(x, id, null) });
    if (f.measures) chips.push({ label: `Measures: ${f.measures.length}`, remove: (x) => ({ ...clone(x), measures: null }) });
    if (f.variance !== "all") chips.push({ label: f.variance === "over" ? "Only over budget" : "Only under budget", remove: (x) => ({ ...clone(x), variance: "all" }) });
    if (f.search) chips.push({ label: `Search: "${f.search}"`, remove: (x) => ({ ...clone(x), search: "" }) });
    return chips;
  }

  DV.filters = { dimKeyOf, measureKeyOf, dimValue, firstDim, colForScope, measureForScope, scopeLabel, setSectionMeasure, dateOf, isDateDim, memberOrder, setRange, setValueRange, clearTable, empty, view, sharedDimensions, dimKey, memberKey, varianceInfo, isOver, toggleMember, setMembers, setTopN, setMin, toggleMeasure, describe, effectiveMeasures };
})();
