/* Stage 7: totals checks — within each table and across tables (shared KPIs). */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;

  function reconcileTable(table) {
    const checks = [];
    if (!table.totals.grand) return checks;
    for (const col of table.columns) {
      if (col.role !== "measure" || !col.additive) continue;
      const grand = table.totals.grand[col.key];
      if (grand == null) continue;
      const bodySum = U.sum(table.rows.map((r) => r.values[col.key]));
      checks.push({ measure: col.key, bodySum, grand, ok: U.approxEqual(bodySum, grand) });
    }
    return checks;
  }

  // Groups grand totals by normalized measure name and clusters equal values. A cluster
  // shared by ≥2 tables is reported once on the overview.
  function reconcileSheet(tables) {
    const groups = {};
    tables.forEach((t, ti) => {
      if (!t.totals.grand) return;
      for (const col of t.columns) {
        if (col.role !== "measure" || col.derived || !col.additive) continue;
        const v = t.totals.grand[col.key];
        if (v == null) continue;
        const k = U.normKey(col.label);
        (groups[k] = groups[k] || []).push({ table: ti, tableId: t.id, key: col.key, label: col.label, value: v, col });
      }
    });
    const clusters = [];
    for (const [k, items] of Object.entries(groups)) {
      const cl = [];
      for (const it of items) {
        const hit = cl.find((c) => U.approxEqual(c.value, it.value));
        if (hit) hit.items.push(it); else cl.push({ normKey: k, value: it.value, items: [it] });
      }
      cl.forEach((c) => {
        c.label = c.items[0].label;
        c.tables = c.items.map((i) => i.table);
        clusters.push(c);
      });
    }
    const shared = clusters.filter((c) => c.tables.length >= 2);
    const tablesInShared = new Set(shared.flatMap((c) => c.tables));
    const internal = tables.map((t) => ({ tableId: t.id, title: t.title, checks: reconcileTable(t) }));
    const mismatches = internal.flatMap((x) => x.checks.filter((c) => !c.ok).map((c) => ({ ...c, tableId: x.tableId, title: x.title })));
    // Same measure, different total, while ≥2 other tables agree: informational, not an error
    // (e.g. a past-season table that legitimately covers a different scope).
    const differs = [];
    for (const c of shared) {
      for (const o of clusters) if (o !== c && o.normKey === c.normKey && o.tables.length === 1)
        differs.push({ label: o.label, value: o.value, table: o.tables[0], sharedValue: c.value, sharedTables: c.tables });
    }
    return { clusters, shared, internal, mismatches, differs, reconciledTables: tablesInShared.size, ok: mismatches.length === 0 };
  }

  DV.reconcile = { reconcileTable, reconcileSheet };
})();
