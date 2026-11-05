/* Dashboard pages → sections → items. customizations.pages = [{ id, title, sections }] and
   customizations.activePage. Items are catalog specs plus an instance id and may come from ANY
   table of ANY Excel sheet. list(cz) returns the ACTIVE page's sections (what most code needs). */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";

  let seq = 0;
  const newId = (p) => `${p}-${Date.now().toString(36)}${(++seq).toString(36)}`;

  const pages = (cz) => (cz && Array.isArray(cz.pages) ? cz.pages : []);
  const active = (cz) => { const ps = pages(cz); return ps.find((p) => p.id === cz.activePage) || ps[0] || null; };
  function list(cz) {
    const a = active(cz);
    if (a) return a.sections;
    return cz && Array.isArray(cz.page) ? cz.page : [];
  }
  const allSections = (cz) => (pages(cz).length ? pages(cz).flatMap((p) => p.sections) : list(cz));
  const allItems = (sections) => sections.flatMap((s) => s.items);
  const tablesUsed = (sections) => new Set(allItems(sections).map((i) => i.tableId).filter(Boolean));

  function newSection(title) { return { id: newId("sec"), title: title || "New section", note: "", items: [] }; }
  function newPage(title, sections) { return { id: newId("pg"), title: title || "New page", sections: sections || [] }; }

  // A catalog item placed on the dashboard. `sections` should be every section of every page,
  // so instance ids (which key per-card customizations) stay unique across pages.
  function instance(sections, cat) {
    const catalogId = cat.catalogId || cat.id;
    const taken = new Set(allItems(sections).map((i) => i.id));
    let id = catalogId, n = 1;
    while (taken.has(id)) id = `${catalogId}::${++n}`;
    return { ...cat, id, catalogId };
  }

  function find(sections, itemId) {
    for (const sec of sections) {
      const i = sec.items.findIndex((x) => x.id === itemId);
      if (i >= 0) return { section: sec, item: sec.items[i], index: i };
    }
    return null;
  }

  // One section per table, titled after it (used for each auto-built page).
  function autoSections(tables, picked, taken) {
    const out = [];
    for (const t of tables) {
      const items = picked.filter((c) => c.tableId === t.id);
      if (!items.length) continue;
      const sec = newSection(t.title);
      sec.fromTable = t.id;
      const isF = (c) => c.family === "filters";
      for (const c of items.filter(isF).concat(items.filter((c) => !isF(c)))) sec.items.push(instance((taken || []).concat(out, [sec]), c));
      out.push(sec);
    }
    return out;
  }

  // First build: one page for a single sheet, otherwise one page per Excel sheet.
  function autoPages(sheets, picked) {
    const used = sheets.filter((sh) => sh.tables.some((t) => picked.some((c) => c.tableId === t.id)));
    if (used.length <= 1) return [newPage("Overview", autoSections(sheets.flatMap((sh) => sh.tables), picked))];
    const out = [];
    for (const sh of used) out.push(newPage(sh.name, autoSections(sh.tables, picked, out.flatMap((p) => p.sections))));
    return out;
  }

  // Older models: { board: { tableId: [items] } } → page (sections) → pages.
  function migrate(cz, tables) {
    if (Array.isArray(cz.pages)) { if (!cz.activePage && cz.pages[0]) cz.activePage = cz.pages[0].id; return cz; }
    if (!Array.isArray(cz.page)) {
      const picked = Object.values(cz.board || {}).flat().map((x) => ({ ...x, catalogId: x.catalogId || x.id }));
      cz.page = picked.length ? autoSections(tables, picked) : null;
    }
    if (Array.isArray(cz.page)) {
      const p = newPage("Overview", cz.page);
      cz.pages = [p];
      cz.activePage = p.id;
    }
    delete cz.page; delete cz.board; delete cz.order; delete cz.extra; delete cz.sectionOrder;
    return cz;
  }

  DV.page = { pages, active, list, allSections, allItems, tablesUsed, newSection, newPage, instance, find, autoSections, autoPages, migrate, newId };
})();
