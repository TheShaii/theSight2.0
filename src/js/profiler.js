/* Stage 6: semantic enrichment — measure types, derived/variance columns, plan-vs-actual pairs. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;

  const PLAN = /\b(budget|plan(ned)?|target|forecast|baseline|goal|quota)\b/i;
  const ACTUAL = /\b(actual|spent|spend|eac|ses|po|pr|cost|revenue|committed|invoiced|sales)\b/i;
  const CURRENCY_WORDS = /budget|cost|amount|eac|spend|spent|revenue|price|\bpr\b|\bpo\b|\bses\b|value|usd|eur|sales|profit|margin|invoice|paid/i;

  function measureType(col, values) {
    const z = col.numberFormat || "";
    const l = col.label;
    if (/%/.test(z) || /%|percent|pct|share/i.test(l)) return "percent";
    if (/[$€£¥₹]|\[\$/.test(z) || CURRENCY_WORDS.test(l)) return "currency";
    if (/\b(avg|average|mean|rate|ratio)\b/i.test(l)) return "ratio";
    if (/\b(days|hours|hrs|minutes|duration)\b/i.test(l)) return "duration";
    if (/\b(count|qty|quantity|number|#|units|headcount)\b/i.test(l) || values.every((v) => v == null || Number.isInteger(v))) return "count";
    return /#,##0\.00/.test(z) ? "currency" : "number";
  }

  const close = (a, b) => U.approxEqual(a, b, 0.011, 1e-9);

  // Tests whether column m equals a − b (or a / b) on every body row with values.
  function inferDerived(table, m, measures) {
    const col = (k) => table.rows.map((r) => r.values[k]);
    const mv = col(m.key);
    const ok = (fn) => {
      let n = 0;
      for (let i = 0; i < mv.length; i++) {
        const r = fn(i);
        if (mv[i] == null || r == null || !isFinite(r)) continue;
        if (!close(mv[i], r)) return false;
        n++;
      }
      return n >= 2;
    };
    const others = measures.filter((x) => x.key !== m.key);
    for (const a of others) for (const b of others) {
      if (a === b) continue;
      const av = col(a.key), bv = col(b.key);
      if (ok((i) => (av[i] == null || bv[i] == null ? null : av[i] - bv[i]))) return { op: "diff", a: a.key, b: b.key };
    }
    for (const a of others) for (const b of others) {
      if (a === b) continue;
      const av = col(a.key), bv = col(b.key);
      if (ok((i) => (av[i] == null || !bv[i] ? null : av[i] / bv[i]))) return { op: "ratio", a: a.key, b: b.key };
    }
    return null;
  }

  function signConvention(derived, colsByKey) {
    const a = colsByKey[derived.a].label, b = colsByKey[derived.b].label;
    if (ACTUAL.test(a) && PLAN.test(b)) return { positiveLabel: "Over budget", negativeLabel: "Under budget", positiveIsGood: false };
    if (PLAN.test(a) && ACTUAL.test(b)) return { positiveLabel: "Under budget", negativeLabel: "Over budget", positiveIsGood: true };
    return { positiveLabel: `${a} above ${b}`, negativeLabel: `${a} below ${b}`, positiveIsGood: true };
  }

  function dimensionType(labels) {
    const ls = labels.filter(Boolean);
    if (!ls.length) return "category";
    if (ls.every((l) => /^(19|20)\d{2}$/.test(l))) return "time";
    if (ls.every((l) => /^(q[1-4]|fy\s?\d{2,4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s+\d{2,4})?|\d{4}-\d{2}(-\d{2})?)$/i.test(l))) return "time";
    const m = ls.map((l) => /^([A-Za-z\- ]*?)\s*(\d+)$/.exec(l));
    if (ls.length >= 2 && m.every(Boolean) && new Set(m.map((x) => x[1])).size === 1) return "ordered";
    return "category";
  }

  function profileTable(table, ov) {
    ov = ov || {};
    const measures = table.columns.filter((c) => c.role === "measure");
    const byKey = Object.fromEntries(table.columns.map((c) => [c.key, c]));
    for (const m of measures) {
      m.measureType = measureType(m, table.rows.map((r) => r.values[m.key]));
      m.derived = null;
    }
    // Variance-named columns first, then right to left: in "Budget | EAC | Budget vs EAC",
    // Budget also equals EAC − variance, but the variance column is the derived one.
    const VARIANCE = /\b(vs\.?|variance|var|diff(erence)?|delta|gap|over|under|change)\b/i;
    const order = measures.slice().reverse().sort((x, y) => VARIANCE.test(y.label) - VARIANCE.test(x.label));
    // "Labor + Material = Total Cost" reads as parts of a whole, not as Material = Total − Labor.
    const comps = findComponents(table, measures.filter((m) => !VARIANCE.test(m.label)));
    const inWhole = new Set(comps ? [comps.total, ...comps.parts] : []);
    for (const m of order) {
      if (inWhole.has(m.key)) continue;
      const d = inferDerived(table, m, measures.filter((x) => !x.derived));
      if (d) {
        m.derived = { ...d, ...(d.op === "diff" ? signConvention(d, byKey) : {}) };
        if (ov.signFlip && ov.signFlip[m.key]) m.derived.positiveIsGood = !m.derived.positiveIsGood;
      }
    }
    const base = measures.filter((m) => !m.derived);
    const plans = base.filter((m) => PLAN.test(m.label));
    const actuals = base.filter((m) => ACTUAL.test(m.label) && !PLAN.test(m.label));
    const rank = (m) => (/\beac\b/i.test(m.label) ? 0 : /actual/i.test(m.label) ? 1 : /total/i.test(m.label) ? 2 : 3);
    actuals.sort((x, y) => rank(x) - rank(y));
    const pairs = plans.length && actuals.length ? actuals.map((a) => ({ plan: plans[0].key, actual: a.key })) : [];

    // Cross-tabs: the row-total column is the natural single measure; its parts stack.
    const totalCol = table.columns.find((c) => c.role === "total");
    const timeCols = base.length >= 2 && base.every((m) => /^((19|20)[0-9]{2}|q[1-4]|fy ?[0-9]{2,4}|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)$/i.test(m.label));
    const primary = totalCol || actuals.find((m) => /total|eac|actual/i.test(m.label)) || actuals[0] || (timeCols ? base[base.length - 1] : base[0]) || measures[0] || null;
    const dimType = dimensionType(table.rows.map((r) => r.label));
    table.profile = {
      primary: primary && primary.key,
      plan: plans[0] ? plans[0].key : null,
      pairs,
      variance: measures.filter((m) => m.derived && m.derived.op === "diff").map((m) => m.key),
      dimensionType: dimType,
      memberNoun: (table.dimensionLabels[0] || "item"),
      longLabels: table.rows.some((r) => r.label.length > 14),
      components: comps || (totalCol && base.length >= 2 ? { total: totalCol.key, parts: base.map((m) => m.key) } : null),
      timeColumns: timeCols,
      hierarchy: table.dimensionLabels.length > 1,
    };
    return table;
  }

  // A measure that equals the sum of 2–3 other measures on every row: the parts may be
  // stacked (stacking measures that aren't parts of a whole would invent a total).
  function findComponents(table, base) {
    const add = base.filter((m) => m.additive !== false && m.measureType !== "percent");
    const rowsOk = (total, parts) => {
      let n = 0;
      for (const r of table.rows) {
        const vs = parts.map((p) => r.values[p.key]);
        if (r.values[total.key] == null || vs.some((v) => v == null)) continue;
        if (!close(r.values[total.key], vs.reduce((a, b) => a + b, 0))) return false;
        n++;
      }
      return n >= 2;
    };
    for (const total of add) {
      const others = add.filter((m) => m !== total);
      for (let i = 0; i < others.length; i++) for (let j = i + 1; j < others.length; j++) {
        if (rowsOk(total, [others[i], others[j]])) return { total: total.key, parts: [others[i].key, others[j].key] };
        for (let k = j + 1; k < others.length; k++)
          if (rowsOk(total, [others[i], others[j], others[k]])) return { total: total.key, parts: [others[i].key, others[j].key, others[k].key] };
      }
    }
    return null;
  }

  DV.profiler = { profileTable, measureType, inferDerived, dimensionType, findComponents, PLAN, ACTUAL };
})();
