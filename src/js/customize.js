/* Customization plumbing: undo/redo history, edit-mode drag & keyboard reordering,
   saved views (JSON) that re-apply to a newer version of the same workbook. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils;
  const MAX_HISTORY = 80;

  const emptyCustomizations = () => ({
    title: null, subtitle: null, charts: {}, page: null,
    kpis: { hidden: [], order: [], stripHidden: false },
  });

  const snapshot = (s) => JSON.stringify({ filters: s.filters, pageFilters: s.pageFilters || {}, customizations: s.customizations, overrides: s.overrides, selection: s.selection });
  function restore(s, snap) {
    const o = JSON.parse(snap);
    const overridesChanged = JSON.stringify(o.overrides) !== JSON.stringify(s.overrides);
    Object.assign(s, o);
    return overridesChanged;
  }
  function push(s, snap) {
    s.history.past.push(snap);
    if (s.history.past.length > MAX_HISTORY) s.history.past.shift();
    s.history.future = [];
  }
  function undo(s) {
    if (!s.history.past.length) return null;
    const cur = snapshot(s);
    const prev = s.history.past.pop();
    s.history.future.push(cur);
    return restore(s, prev);
  }
  function redo(s) {
    if (!s.history.future.length) return null;
    const cur = snapshot(s);
    s.history.past.push(cur);
    return restore(s, s.history.future.pop());
  }

  // ---- Edit-mode reordering ----
  function containerIds(container) {
    return [...container.children].map((el) => el.dataset.chart || el.dataset.section || el.dataset.kpi).filter(Boolean);
  }
  function applyOrder(st, key, ids) {
    const cz = st.customizations;
    if (key === "sections") {
      const pos = new Map(ids.map((id, i) => [id, i]));
      const p = DV.page.active(cz);
      if (p) p.sections = p.sections.slice().sort((a, b) => (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6));
    }
    else if (key === "kpis") { cz.kpis.order = ids; }
    else {
      // Reorder board items by the new card order; "bento" mixes tables, so regroup per table.
      const pos = new Map(ids.map((id, i) => [id, i]));
      const sec = DV.page.list(cz).find((x) => x.id === key);
      if (sec) sec.items = sec.items.slice().sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e6) - (pos.has(b.id) ? pos.get(b.id) : 1e6));
    }
  }
  function move(container, el, delta) {
    const ids = containerIds(container);
    const id = el.dataset.chart || el.dataset.section || el.dataset.kpi;
    const i = ids.indexOf(id), j = U.clamp(i + delta, 0, ids.length - 1);
    if (i < 0 || i === j) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    DV.app.commit((st) => applyOrder(st, container.dataset.dnd, ids));
    DV.app.afterRender(() => {
      const again = document.querySelector(`[data-chart="${CSS.escape(id)}"], [data-section="${CSS.escape(id)}"], [data-kpi="${CSS.escape(id)}"]`);
      if (again) again.focus();
    });
  }

  function enableEditing(root) {
    for (const container of root.querySelectorAll("[data-dnd]")) {
      const items = [...container.children].filter((el) => el.dataset.chart || el.dataset.section || el.dataset.kpi);
      let dragged = null;
      for (const el of items) {
        el.setAttribute("draggable", "true");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
        el.addEventListener("dragstart", (e) => {
          if (e.target !== el) return;
          dragged = el; el.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", "card"); } catch (err) { /* IE-style DataTransfer */ }
          e.stopPropagation();
        });
        el.addEventListener("dragend", () => { el.classList.remove("dragging"); items.forEach((x) => x.classList.remove("drop-before")); dragged = null; });
        el.addEventListener("dragover", (e) => {
          if (!dragged || dragged === el || dragged.parentElement !== container) return;
          e.preventDefault(); e.stopPropagation();
          items.forEach((x) => x.classList.toggle("drop-before", x === el));
        });
        el.addEventListener("drop", (e) => {
          if (!dragged || dragged.parentElement !== container) return;
          e.preventDefault(); e.stopPropagation();
          const ids = containerIds(container);
          const from = ids.indexOf(dragged.dataset.chart || dragged.dataset.section || dragged.dataset.kpi);
          const to = ids.indexOf(el.dataset.chart || el.dataset.section || el.dataset.kpi);
          ids.splice(to, 0, ids.splice(from, 1)[0]);
          DV.app.commit((st) => applyOrder(st, container.dataset.dnd, ids));
        });
        el.addEventListener("keydown", (e) => {
          if (e.target !== el || !e.altKey) return;
          const d = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
          if (d) { e.preventDefault(); move(container, el, d); }
        });
      }
    }
  }

  // ---- Saved views ----
  function exportView(s) {
    const tables = {};
    for (const sh of s.sheets) for (const t of sh.tables) tables[t.id] = { sheet: t.sheet, range: t.range, title: t.autoTitle };
    return JSON.stringify({
      app: "thesight-view", version: 2, savedAt: new Date().toISOString(), file: s.fileName,
      layoutId: s.layoutId, variantId: s.variantId, paletteId: s.paletteId, density: s.density, corners: s.corners,
      filters: s.filters, pageFilters: s.pageFilters || {}, customizations: s.customizations, overrides: s.overrides, tables,
    }, null, 2);
  }

  // Maps saved table ids onto the current workbook by sheet+range, then by title.
  function buildIdMap(saved, sheets) {
    const map = {};
    const current = sheets.flatMap((sh) => sh.tables);
    for (const [oldId, info] of Object.entries(saved.tables || {})) {
      const hit = current.find((t) => t.sheet === info.sheet && t.range === info.range)
        || current.find((t) => t.autoTitle === info.title && t.sheet === info.sheet)
        || current.find((t) => t.autoTitle === info.title);
      if (hit) map[oldId] = hit.id;
    }
    return map;
  }
  function remapKeys(obj, map) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) out[remapId(k, map)] = v;
    return out;
  }
  function remapId(id, map) {
    if (map[id]) return map[id];
    const cut = id.indexOf("::");
    if (cut > 0 && map[id.slice(0, cut)]) return map[id.slice(0, cut)] + id.slice(cut);
    if (id.startsWith("dim:") || id.startsWith("kpi:")) return id;
    return id;
  }

  function importView(s, text) {
    let v;
    try { v = JSON.parse(text); } catch (e) { throw new Error("That file isn't a saved dashboard view (invalid JSON)."); }
    if (!v || (v.app !== "thesight-view" && v.app !== "dataviz-view")) throw new Error("That file isn't a saved dashboard view.");
    const map = buildIdMap(v, s.sheets);
    const matched = Object.keys(map).length, total = Object.keys(v.tables || {}).length;
    const cz = { ...emptyCustomizations(), ...v.customizations };
    cz.charts = remapKeys(cz.charts, map);
    // v1 views (before the gallery) had no board: start from the recommended charts.
    // Sections hold items from any table; remap each item's table, and migrate older views.
    const remapSec = (sec) => ({ ...sec, items: sec.items.map((e) => ({ ...e, id: remapId(e.id, map), catalogId: remapId(e.catalogId || e.id, map), tableId: e.tableId ? remapId(e.tableId, map) : e.tableId })) });
    if (Array.isArray(cz.pages)) cz.pages = cz.pages.map((p) => ({ ...p, sections: p.sections.map(remapSec) }));
    if (Array.isArray(cz.page)) cz.page = cz.page.map((sec) => ({ ...sec, items: sec.items.map((e) => ({ ...e, id: remapId(e.id, map), catalogId: remapId(e.catalogId || e.id, map), tableId: remapId(e.tableId, map) })) }));
    else if (cz.board) cz.board = Object.fromEntries(Object.entries(remapKeys(cz.board, map)).map(([k, list]) => [k, list.map((e) => ({ ...e, id: remapId(e.id, map), tableId: remapId(e.tableId, map) }))]));
    DV.page.migrate(cz, s.sheets.flatMap((sh) => sh.tables));
    if (!DV.page.pages(cz).length) { cz.pages = DV.app.recommendedPage(); cz.activePage = cz.pages[0].id; }
    delete cz.order; delete cz.extra;
    cz.kpis = { hidden: [], order: [], stripHidden: false, ...(cz.kpis || {}) };
    cz.sections = remapKeys(cz.sections, map);
    delete cz.sections; delete cz.sectionOrder; delete cz.pinned;
    const f = { ...DV.filters.empty(), ...v.filters };
    f.members = remapKeys(f.members, map); f.topN = remapKeys(f.topN, map); f.minValue = remapKeys(f.minValue, map);
    push(s, snapshot(s));
    Object.assign(s, {
      customizations: cz, filters: f, pageFilters: v.pageFilters || {}, overrides: v.overrides || {},
      layoutId: v.layoutId || s.layoutId, variantId: v.variantId || (v.themeId ? DV.designs.migrate(v.themeId) : s.variantId), paletteId: v.paletteId === "cb" ? "cb" : "default",
      density: v.density || s.density, corners: v.corners || s.corners,
    });
    return { matched, total };
  }

  DV.customize = { emptyCustomizations, snapshot, push, undo, redo, enableEditing, exportView, importView, buildIdMap };
})();
