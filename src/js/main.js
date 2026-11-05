/* App bootstrap: the single state object, commit → render loop, top bar, pickers, shortcuts. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, iconBtn, popover, closePopover, clear, toast, download } = DV.dom;
  const C = DV.customize, U = DV.utils;
  const PREF_KEYS = ["variantId", "layoutId", "paletteId", "density", "corners"];

  // localStorage is optional (file:// in some browsers blocks it); never required.
  const store = {
    get(k) { try { return globalThis.localStorage ? localStorage.getItem(k) : null; } catch (e) { return null; } },
    set(k, v) { try { if (globalThis.localStorage) localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  const freshUI = () => ({ filtersOpen: false, focusChart: null, slide: 0, tab: "overview", tableSort: {}, dataBars: {}, memberSearch: {}, reopen: null, prevLayout: null, galleryDraft: null, galleryTable: null, galleryFamily: "all", gallerySearch: "", galleryReturn: false, galleryTarget: "auto" });
  const state = {
    workbook: null, fileName: "", sheets: null, activeSheet: 0, overrides: {},
    filters: DV.filters.empty(), selection: { highlight: null, highlightLabel: null },
    customizations: C.emptyCustomizations(), history: { past: [], future: [] },
    layoutId: "executive", variantId: "thesight-light", paletteId: "default", density: "comfortable", corners: "rounded",
    editMode: false, ui: freshUI(), stage: "dashboard",
    viewer: null, // set when this file is an exported dashboard: { allowEdit, allowDesign, allowOpen }
  };
  for (const k of PREF_KEYS) { const v = store.get("thesight:" + k); if (v) state[k] = v; }
  state.variantId = DV.designs.variant(state.variantId).id;
  if (state.paletteId !== "cb") state.paletteId = "default";
  if (!DV.layouts.LAYOUTS.some((l) => l.id === state.layoutId) || state.layoutId === "present") state.layoutId = "executive";

  const afterQueue = [];
  const sheet = () => state.sheets && state.sheets[state.activeSheet];

  function reanalyze() {
    if (!state.workbook) return; // exported viewer files carry tables only, not the raw grid
    state.sheets = state.sheets.map((sh) => DV.analyze.analyzeSheet(sh.name, state.workbook.Sheets[sh.name], state.overrides[sh.name], sh.grid));
  }

  function commit(mutator, opts = {}) {
    const snap = C.snapshot(state);
    mutator(state);
    if (opts.history !== false) C.push(state, snap);
    if (opts.reanalyze) reanalyze();
    savePrefs();
    render();
  }
  function setUI(fn) { fn(state.ui); render(); }

  function savePrefs() {
    for (const k of PREF_KEYS) if (state[k] !== "present") store.set("thesight:" + k, state[k]);
    if (state.fileName && state.sheets && !state.viewer) store.set("thesight:view:" + state.fileName, C.exportView(state));
  }

  // ---- Rendering ----
  function render() {
    DV.designs.apply(state);
    const root = document.getElementById("app");
    if (!state.sheets) return DV.loader.landing(root);
    const active = document.activeElement;
    const fk = active && active.dataset ? active.dataset.fk : null;
    const caret = fk && active.selectionStart != null ? active.selectionStart : null;
    const scroll = [window.scrollX, window.scrollY];
    DV.cards.disposeAll();
    clear(root);

    const layout = DV.layouts.get(state.layoutId);
    const sh = state.stage === "gallery" ? sheet() : pageSheet();
    if (!previewOnly()) root.appendChild(topbar(layout));
    if (state.stage === "gallery") {
      root.appendChild(DV.gallery.render(sh));
      DV.gallery.mount(root);
      window.scrollTo(scroll[0], scroll[1]);
      restoreFocus(root, fk, caret);
      while (afterQueue.length) afterQueue.shift()();
      return;
    }
    const dash = h("main", { class: "dash" + (state.editMode ? " edit-mode" : ""), "data-layout": layout.id, id: "main" });
    if (layout.kind !== "present") dash.appendChild(DV.views.pageTabs());
    if (state.editMode) dash.appendChild(h("div", { class: "banner-warn", style: { borderColor: "var(--accent)", color: "var(--text)" } }, icon("edit"),
      "Edit mode: drag cards to reorder (or focus a card and press Alt+↑/↓), drag a card’s corner to resize, click titles to rename, use Icon / Background on sections. Ctrl+Z undoes.",
      h("button", { class: "btn primary", type: "button", onclick: () => commit((st) => { st.editMode = false; }, { history: false }) }, "Done")));
    dash.appendChild(DV.views[layout.kind](sh, layout));
    DV.media.applyBackground(dash, state.customizations.background);
    if (!DV.page.list(state.customizations).length) dash.appendChild(h("div", { class: "empty-note", style: { marginTop: "16px" } },
      h("p", { text: "Your dashboard has no charts yet." }),
      canEdit() ? h("button", { class: "btn primary", type: "button", onclick: () => openGallery() }, icon("plus"), "Pick charts") : null));
    root.appendChild(dash);
    if (state.ui.filtersOpen && (layout.filters === "drawer")) {
      root.appendChild(h("aside", { class: "drawer fade-in", "aria-label": "Filters" },
        h("div", { class: "modal-head", style: { padding: "0 0 10px" } }, h("h2", { text: "Filters" }), iconBtn("close", "Close filters", () => toggleFilters())),
        DV.dashboard.filterBar(sh)));
    }

    for (const el of root.querySelectorAll("[data-chart]")) if (el.__mount) el.__mount();
    if (state.editMode) C.enableEditing(root);
    window.scrollTo(scroll[0], scroll[1]);
    restoreFocus(root, fk, caret);
    if (state.ui.reopen) {
      const key = state.ui.reopen;
      state.ui.reopen = null;
      const el = root.querySelector(`[data-pop="${CSS.escape(key)}"]`);
      if (el) el.click();
    }
    while (afterQueue.length) afterQueue.shift()();
    if (DV.review.isOpen()) DV.review.refresh();
  }

  function restoreFocus(root, fk, caret) {
    if (!fk) return;
    const el = root.querySelector(`[data-fk="${fk}"]`);
    if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (e) { /* type=search ok */ } }
  }

  function topbar(layout) {
    const s = state;
    const btn = (ic, label, onclick, extra = {}) => h("button", { class: "btn" + (extra.cls ? " " + extra.cls : ""), type: "button", onclick, title: (extra.title || label) + (extra.kbd ? ` (${extra.kbd})` : ""), "aria-pressed": extra.pressed != null ? String(extra.pressed) : null, disabled: extra.disabled, "data-pop": extra.pop }, icon(ic), h("span", { text: label }), extra.kbd ? h("kbd", { text: extra.kbd }) : null);
    const saved = s.viewer ? null : store.get("thesight:view:" + s.fileName);
    const gallery = s.stage === "gallery";
    return h("div", { class: "topbar no-print", role: "toolbar", "aria-label": "Dashboard tools" },
      brandMark(),
      h("span", { class: "chip", title: s.fileName, text: s.fileName }),
      h("span", { class: "privacy" }, icon("lock"), s.viewer ? "Offline dashboard" : "Your data stays on your computer"),
      h("div", { class: "spacer" }),
      gallery ? null : btn("filter", "Filters", () => toggleFilters(), { kbd: "F" }),
      gallery || !canEdit() ? null : btn("plus", "Add charts", () => openGallery(), { kbd: "G" }),
      gallery || previewOnly() ? null : btn("layout", "Layout", (e) => layoutPicker(e.currentTarget), { kbd: "L", pop: "layout" }),
      canDesign() ? btn("palette", "Design", (e) => designPicker(e.currentTarget), { kbd: "T", pop: "theme" }) : null,
      s.workbook ? btn("review", "Review", () => DV.review.open(), { kbd: "R" }) : null,
      gallery || !canEdit() ? null : btn("edit", s.editMode ? "Editing" : "Edit", () => commit((st) => { st.editMode = !st.editMode; }, { history: false }), { pressed: s.editMode, kbd: "E" }),
      gallery || previewOnly() ? null : iconBtn("undo", "Undo (Ctrl+Z)", () => undo(), { attrs: { disabled: !s.history.past.length } }),
      gallery || previewOnly() ? null : iconBtn("redo", "Redo (Ctrl+Y)", () => redo(), { attrs: { disabled: !s.history.future.length } }),
      previewOnly() ? btn("reset", "Clear filters", () => commit((st) => { st.filters = DV.filters.empty(); st.selection = { highlight: null, highlightLabel: null }; }), { title: "Show everything again" }) : null,
      previewOnly() ? h("span", { class: "chip", title: "This is a read-only preview. You can filter, but not edit." }, "Preview") : null,
      gallery || s.viewer ? null : btn("download", "Export", () => DV.exporter.openDialog(), { cls: "primary", title: "Export this dashboard as an interactive .html file" }),
      gallery || previewOnly() ? null : btn("more", "More", (e) => moreMenu(e.currentTarget, saved), { pop: "more" }));
  }

  function moreMenu(anchor, saved) {
    const item = (ic, label, fn) => h("button", { class: "menu-item", type: "button", onclick: () => { closePopover(); fn(); } }, icon(ic), label);
    popover(anchor, [
      h("h4", { text: "Dashboard" }),
      item("present", "Present (full screen)", () => setLayout("present")),
      item("download", "Print / save as PDF", () => window.print()),
      state.viewer ? null : item("download", "Export dashboard (.html)", () => DV.exporter.openDialog()),
      canEdit() ? item("download", "Download all tables (.xlsx)", () => exportXLSX()) : null,
      canEdit() ? item("save", "Save view (.json)", () => download(fileBase() + ".view.json", C.exportView(state), "application/json")) : null,
      canEdit() ? item("open", "Load view…", () => pickFile(".json", (text) => {
        try { const r = C.importView(state, text); reanalyze(); render(); toast(`View loaded: ${r.matched} of ${r.total} tables matched.`); } catch (e) { toast(e.message); }
      })) : null,
      saved ? item("reset", "Restore last view for this file", () => { try { C.importView(state, saved); reanalyze(); render(); toast("Last view restored."); } catch (e) { toast(e.message); } }) : null,
      canEdit() ? item("reset", "Reset dashboard to recommended", () => commit((st) => { st.customizations = C.emptyCustomizations(); st.customizations.pages = recommendedPages(); st.customizations.activePage = st.customizations.pages[0].id; st.pageFilters = {}; st.filters = DV.filters.empty(); st.selection.highlight = null; })) : null,
      canEdit() ? item("eyeOff", state.customizations.kpis.stripHidden ? "Show KPI strip" : "Hide KPI strip", () => commit((st) => { st.customizations.kpis.stripHidden = !st.customizations.kpis.stripHidden; })) : null,
      !state.viewer || state.viewer.allowOpen ? h("div", { class: "menu-sep" }) : null,
      !state.viewer || state.viewer.allowOpen ? item("upload", "Open another file…", () => pickFile(DV.loader.ACCEPT, null, (file) => DV.loader.readFile(file))) : null,
    ], { label: "More", alignRight: true });
  }

  function pickFile(accept, onText, onFile) {
    const input = h("input", { type: "file", accept, class: "sr-only" });
    input.addEventListener("change", () => {
      const f = input.files[0];
      input.remove();
      if (!f) return;
      if (onFile) return onFile(f);
      const fr = new FileReader();
      fr.onload = () => onText(String(fr.result));
      fr.readAsText(f);
    });
    document.body.appendChild(input);
    input.click();
  }
  const fileBase = () => (state.fileName || "dashboard").replace(/\.[^.]+$/, "");

  function layoutPicker(anchor) {
    popover(anchor, [h("h4", { text: "Layout" }), h("div", { class: "picker-grid" }, DV.layouts.LAYOUTS.map((l) =>
      h("button", { class: "picker-tile", type: "button", "aria-pressed": String(state.layoutId === l.id), title: l.description, onclick: () => { closePopover(); setLayout(l.id); } },
        DV.layouts.thumbNode(l), h("strong", { class: "small", text: l.name }), h("span", { class: "small muted", text: l.description }))))], { label: "Layout", alignRight: true });
  }

  function brandMark() {
    return h("div", { class: "brand" }, h("img", { src: globalThis.DV_LOGO || "", alt: "" }), h("span", null, "TheSight", h("span", { class: "ver", text: "2.0" })));
  }

  // A live mini mock rendered under each variant's own attributes (the CSS is attribute-scoped).
  function designPreview(v) {
    const bars = [72, 100, 54, 84, 38].map((ht, i) => h("span", { class: "dp-bar", style: { height: ht + "%" }, vars: { "--c": `var(--series-${(i % 4) + 1})` } }));
    return h("div", { class: "dp-mock", "data-design": v.design, "data-variant": v.id, "data-mode": v.mode, "aria-hidden": "true" },
      h("div", { class: "dp-kpi" }, h("span", { class: "dp-label", text: "Actual Cost" }), h("span", { class: "dp-value", text: "5.96M" })),
      h("div", { class: "dp-chart" }, bars));
  }

  function designPicker() {
    const pick = (fn) => { m.close(); commit(fn, { history: false }); designPicker(); };
    const seg = (label, key, opts) => h("div", { class: "field" }, label, h("div", { class: "seg", role: "group", "aria-label": label },
      opts.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(state[key] === v), onclick: () => pick((st) => { st[key] = v; }) }, l))));
    const cur = DV.designs.variant(state.variantId);
    const tiles = DV.designs.DESIGNS.map((d) => {
      const active = d.id === cur.design;
      const shown = active ? cur : d.variants.find((v) => v.mode === cur.mode) || d.variants[0];
      return h("div", { class: "dp-tile" + (active ? " active" : "") },
        h("button", { class: "dp-main", type: "button", "aria-pressed": String(active), onclick: () => pick((st) => {
          st.variantId = shown.id;
          if (d.layout && st.layoutId !== "present") st.layoutId = d.layout;
        }) }, designPreview(shown), h("strong", { text: d.name }), h("span", { class: "small muted", text: d.blurb })),
        h("div", { class: "chips" }, d.variants.map((v) => h("button", { class: "chip clickable", type: "button", "aria-pressed": String(v.id === cur.id),
          onclick: () => pick((st) => { st.variantId = v.id; if (d.layout && d.id !== cur.design && st.layoutId !== "present") st.layoutId = d.layout; }) }, v.name))));
    });
    const m = DV.dom.modal("Design", h("div", null,
      h("div", { class: "dp-grid" }, tiles),
      h("div", { class: "filter-row", style: { marginTop: "16px" } },
        seg("Colors", "paletteId", DV.designs.PALETTES.map((p) => [p.id, p.name])),
        seg("Density", "density", [["comfortable", "Comfortable"], ["compact", "Compact"]]),
        seg("Corners", "corners", [["rounded", "Design default"], ["sharp", "Sharp"]])),
      canEdit() ? h("div", { class: "menu-field", style: { marginTop: "12px" } }, "Dashboard background photo",
        DV.media.backgroundControls(state.customizations.background, (bg) => { m.close(); commit((st) => { st.customizations.background = bg; }); designPicker(); })) : null), { wide: true });
  }

  function setLayout(id) {
    commit((st) => {
      if (id === "present") { st.ui.prevLayout = st.layoutId === "present" ? st.ui.prevLayout : st.layoutId; st.ui.slide = 0; }
      st.layoutId = id;
      st.ui.filtersOpen = false;
    }, { history: false });
  }
  function exitPresentation() { setLayout(state.ui.prevLayout || "executive"); }
  function toggleFilters() {
    const layout = DV.layouts.get(state.layoutId);
    if (layout.filters === "drawer") return setUI((u) => { u.filtersOpen = !u.filtersOpen; });
    const el = document.querySelector(".filterbar input, .filterbar button");
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); }
  }

  function undo() { const ch = C.undo(state); if (ch === null) return toast("Nothing to undo."); if (ch) reanalyze(); render(); }
  function redo() { const ch = C.redo(state); if (ch === null) return toast("Nothing to redo."); if (ch) reanalyze(); render(); }
  // Re-open a popover after the commit that re-rendered the DOM under it.
  function reopen(key) {
    const el = document.querySelector(`[data-pop="${CSS.escape(key)}"]`);
    if (el) el.click();
  }

  // ---- Actions used by cards / sections ----
  function highlight(label) {
    const key = label ? DV.filters.memberKey(label) : null;
    state.selection = key && state.selection.highlight === key ? { highlight: null, highlightLabel: null } : { highlight: key, highlightLabel: label };
    render();
  }
  const allTables = () => state.sheets.flatMap((sh) => sh.tables);
  const tableById = (id) => allTables().find((t) => t.id === id) || null;
  // Active page's sections (creating a first page if needed) and every section of every page.
  function pageOf(st) {
    const cz = st.customizations;
    if (!DV.page.pages(cz).length) { const p = DV.page.newPage("Overview", []); cz.pages = [p]; cz.activePage = p.id; }
    return DV.page.list(cz);
  }
  const allSecs = (st) => DV.page.allSections(st.customizations);
  const recommendedPages = () => withComparePage(DV.page.autoPages(state.sheets, allTables().flatMap((t) => DV.recommender.recommend(t))));
  const recommendedPage = recommendedPages;
  // Workbooks that repeat a report across sheets get a "Compare" page.
  function withComparePage(pages) {
    if (DV.views.hasCompare()) pages.push(DV.page.newPage("Compare", [{ ...DV.page.newSection("Compare sheets"), items: [{ id: DV.page.newId("compare"), type: "compare", family: "other", dom: true }] }]));
    return pages;
  }

  // ---- Pages: add / rename / duplicate / move / delete / switch (filters are per page) ----
  function switchPage(id, opts = {}) {
    const cz = state.customizations;
    if (cz.activePage === id && !opts.force) return;
    state.pageFilters = { ...(state.pageFilters || {}), [cz.activePage]: state.filters };
    cz.activePage = id;
    state.filters = (state.pageFilters || {})[id] || DV.filters.empty();
    state.selection = { highlight: null, highlightLabel: null };
    state.ui.tab = null;
    window.scrollTo(0, 0);
    render();
  }
  function addPage() {
    const sec = DV.page.newSection("New section");
    const p = DV.page.newPage("Page " + (DV.page.pages(state.customizations).length + 1), [sec]);
    commit((st) => { pageOf(st); st.customizations.pages.push(p); st.pageFilters = { ...(st.pageFilters || {}), [st.customizations.activePage]: st.filters }; st.customizations.activePage = p.id; st.filters = DV.filters.empty(); });
    openGallery(sec.id);
  }
  function renamePage(id, title) {
    if (!title) return;
    commit((st) => { const p = DV.page.pages(st.customizations).find((x) => x.id === id); if (p) p.title = title; });
  }
  function duplicatePage(id) {
    commit((st) => {
      const ps = DV.page.pages(st.customizations), i = ps.findIndex((x) => x.id === id);
      if (i < 0) return;
      const taken = allSecs(st);
      const copy = DV.page.newPage(ps[i].title + " (copy)", ps[i].sections.map((sec) => {
        const ns = { ...DV.utils.deepClone(sec), id: DV.page.newId("sec"), items: [] };
        for (const it of sec.items) { const inst = DV.page.instance(taken.concat([ns]), it); ns.items.push(inst); st.customizations.charts[inst.id] = DV.utils.deepClone(st.customizations.charts[it.id] || {}); }
        return ns;
      }));
      ps.splice(i + 1, 0, copy);
    });
  }
  function movePage(id, d) {
    commit((st) => { const ps = DV.page.pages(st.customizations), i = ps.findIndex((x) => x.id === id), j = i + d; if (i >= 0 && j >= 0 && j < ps.length) ps.splice(j, 0, ps.splice(i, 1)[0]); });
  }
  function deletePage(id) {
    const ps = DV.page.pages(state.customizations);
    if (ps.length <= 1) return toast("A dashboard needs at least one page.");
    commit((st) => {
      const cz = st.customizations;
      cz.pages = cz.pages.filter((x) => x.id !== id);
      if (cz.activePage === id) { cz.activePage = cz.pages[0].id; st.filters = (st.pageFilters || {})[cz.activePage] || DV.filters.empty(); }
    });
    toast("Page deleted. Ctrl+Z to undo.");
  }
  // Header + KPI context for the active page: built from the tables its sections use.
  function pageSheet() {
    const used = DV.page.tablesUsed(DV.page.list(state.customizations));
    const tables = allTables().filter((t) => used.has(t.id));
    const sheetsUsed = state.sheets.filter((sh) => sh.tables.some((t) => used.has(t.id)));
    const base = sheetsUsed[0] || sheet();
    return {
      name: base.name, title: base.title, subtitle: sheetsUsed.length > 1 ? "" : base.subtitle,
      params: sheetsUsed.flatMap((sh) => sh.params), notes: [], tables, reconcile: DV.reconcile.reconcileSheet(tables),
      warnings: sheetsUsed.flatMap((sh) => sh.warnings), lowConfidence: tables.filter((t) => t.meta.confidence < 0.7).map((t) => t.id),
      mode: sheetsUsed.some((sh) => sh.mode === "flat") ? "flat" : "summary", detectedCount: allTables().length, titleCells: [],
    };
  }

  function duplicateChart(t, spec) {
    commit((st) => {
      const page = pageOf(st);
      const at = DV.page.find(page, spec.id);
      if (!at) return;
      const copy = DV.page.instance(allSecs(st), { ...at.item });
      at.section.items.splice(at.index + 1, 0, copy);
      const c = { ...(st.customizations.charts[spec.id] || {}) };
      delete c.hidden;
      st.customizations.charts[copy.id] = { ...c, title: (c.title || spec.title) + " (copy)" };
    });
  }
  function removeItem(t, id) {
    commit((st) => { for (const sec of allSecs(st)) sec.items = sec.items.filter((x) => x.id !== id); });
    toast("Removed. Ctrl+Z to undo.");
  }
  function moveItem(id, toSection) {
    commit((st) => {
      const page = pageOf(st);
      const at = DV.page.find(page, id), to = page.find((x) => x.id === toSection);
      if (!at || !to) return;
      at.section.items.splice(at.index, 1);
      to.items.push(at.item);
    });
    toast("Moved.");
  }
  function addSection() {
    const sec = DV.page.newSection("New section");
    commit((st) => { pageOf(st).push(sec); });
    openGallery(sec.id);
  }
  function deleteSection(id) {
    commit((st) => { const p = DV.page.active(st.customizations); if (p) p.sections = p.sections.filter((x) => x.id !== id); });
    toast("Section deleted. Ctrl+Z to undo.");
  }
  function moveSection(id, d) {
    commit((st) => {
      const page = pageOf(st), i = page.findIndex((x) => x.id === id), j = i + d;
      if (i < 0 || j < 0 || j >= page.length) return;
      page.splice(j, 0, page.splice(i, 1)[0]);
    });
  }

  // Gallery: the draft is the set of ticked CATALOG ids for the target section.
  // Target "auto" (first build) makes one section per table.
  function draftFor(target) {
    if (target === "auto") return allTables().flatMap((t) => DV.recommender.recommend(t)).map((x) => x.id);
    if (target === "new") return [];
    const sec = DV.page.list(state.customizations).find((x) => x.id === target);
    return sec ? sec.items.map((x) => x.catalogId || x.id) : [];
  }
  function openGallery(sectionId, family) {
    const page = DV.page.list(state.customizations);
    const target = sectionId || (page[0] ? page[0].id : "auto");
    Object.assign(state.ui, { galleryTarget: target, galleryDraft: draftFor(target), galleryTable: null, galleryFamily: family || "all", gallerySearch: "", galleryReturn: true });
    state.stage = "gallery";
    closePopover();
    window.scrollTo(0, 0);
    render();
  }
  function setGalleryTarget(target) {
    Object.assign(state.ui, { galleryTarget: target, galleryDraft: draftFor(target) });
    render();
  }
  function buildFromGallery() {
    const draft = new Set(state.ui.galleryDraft);
    const target = state.ui.galleryTarget || "auto";
    const catalog = allTables().flatMap((t) => DV.recommender.catalog(t));
    const picked = catalog.filter((c) => draft.has(c.id));
    if (draft.has("compare-sheets")) picked.push({ id: "compare-sheets", catalogId: "compare-sheets", type: "compare", family: "other", dom: true });
    commit((st) => {
      if (target === "auto") {
        st.customizations.pages = withComparePage(DV.page.autoPages(st.sheets, picked));
        st.customizations.activePage = st.customizations.pages[0].id;
        delete st.customizations.page;
      } else {
        const page = pageOf(st);
        let sec = page.find((x) => x.id === target);
        if (!sec) { sec = DV.page.newSection("New section"); page.push(sec); }
        const kept = sec.items.filter((x) => draft.has(x.catalogId || x.id));
        const have = new Set(kept.map((x) => x.catalogId || x.id));
        const added = picked.filter((c) => !have.has(c.id));
        sec.items = [];
        const isF = (c) => c.family === "filters";
        // New filter controls go above the charts they drive.
        for (const c of added.filter(isF)) sec.items.push(DV.page.instance(allSecs(st), c));
        sec.items.push(...kept);
        for (const c of added.filter((c) => !isF(c))) sec.items.push(DV.page.instance(allSecs(st), c));
      }
      st.stage = "dashboard";
      st.ui.galleryDraft = null;
    });
    window.scrollTo(0, 0);
  }
  async function addImage(sectionId) {
    const id = await DV.media.upload();
    if (!id) return;
    commit((st) => {
      const sec = pageOf(st).find((x) => x.id === sectionId);
      if (sec) sec.items.push({ id: DV.page.newId("image"), type: "image", asset: id, family: "media", dom: true });
    });
  }
  async function setLogo() {
    const id = await DV.media.upload(400);
    if (id) commit((st) => { st.customizations.logo = id; });
  }
  function closeGallery() { state.stage = "dashboard"; state.ui.galleryDraft = null; render(); }
  const canEdit = () => !state.viewer || (!state.viewer.previewOnly && !!state.viewer.allowEdit);
  const canDesign = () => !state.viewer || (!state.viewer.previewOnly && state.viewer.allowDesign !== false);
  const previewOnly = () => !!(state.viewer && state.viewer.previewOnly);
  function renameTable(t, v) {
    if (!v || v === t.title) return;
    commit((st) => {
      const ov = st.overrides[t.sheet] = st.overrides[t.sheet] || {};
      ov.blocks = ov.blocks || {};
      ov.blocks[t.blockId] = { ...(ov.blocks[t.blockId] || {}), title: v };
    }, { reanalyze: true });
  }

  // Clean CSV: header + body rows (+ Grand Total as a labelled last row). Guards against
  // spreadsheet formula injection when the CSV is reopened in Excel.
  function exportCSV(t) {
    const cols = t.columns;
    const cell = (v) => {
      if (v == null) return "";
      if (typeof v === "number") return String(Number(v.toPrecision(15)));
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => cell(c.label)).join(",")];
    const isNum = (c) => c.role === "measure" || c.role === "total";
    for (const r of t.rows) lines.push(cols.map((c) => cell(isNum(c) ? r.values[c.key] : r.labels[c.key])).join(","));
    if (t.totals.grand) lines.push(cols.map((c, i) => cell(isNum(c) ? t.totals.grand[c.key] : i === 0 ? t.totals.grandLabel || "Grand Total" : "")).join(","));
    download(t.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + ".csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  // Every detected table as its own clean sheet: header, body rows, Grand Total last.
  function exportXLSX() {
    const wb = XLSX.utils.book_new();
    const used = new Set();
    for (const t of allTables()) {
      const cols = t.columns;
      const isNum = (c) => c.role === "measure" || c.role === "total";
      const aoa = [cols.map((c) => c.label)];
      for (const r of t.rows) aoa.push(cols.map((c) => (isNum(c) ? r.values[c.key] : r.labels[c.key] || "")));
      if (t.totals.grand) aoa.push(cols.map((c, i) => (isNum(c) ? t.totals.grand[c.key] : i === 0 ? t.totals.grandLabel || "Grand Total" : "")));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      cols.forEach((c, j) => { if (!isNum(c) || !c.numberFormat) return; for (let i = 1; i < aoa.length; i++) { const cellRef = ws[XLSX.utils.encode_cell({ r: i, c: j })]; if (cellRef && cellRef.t === "n") cellRef.z = c.numberFormat; } });
      ws["!cols"] = cols.map((c, j) => ({ wch: Math.min(40, Math.max(10, ...aoa.map((row) => String(row[j] == null ? "" : row[j]).length))) }));
      let name = t.title.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim();
      if (name.length > 31) name = name.slice(0, 31).replace(/ [^ ]*$/, "") || name.slice(0, 31);
      name = name || "Table";
      for (let n = 2; used.has(name.toLowerCase()); n++) name = name.slice(0, 28) + " " + n;
      used.add(name.toLowerCase());
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    download(fileBase() + "-tables.xlsx", new Uint8Array(out), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  function start(wb, sheets, name) {
    Object.assign(state, {
      workbook: wb, sheets, fileName: name, activeSheet: 0, overrides: {}, filters: DV.filters.empty(),
      selection: { highlight: null, highlightLabel: null }, customizations: C.emptyCustomizations(),
      history: { past: [], future: [] }, editMode: false, ui: freshUI(), stage: "gallery", viewer: null,
    });
    // Recommended charts start ticked; nothing reaches the dashboard until "Build dashboard".
    state.customizations.pages = null;
    state.pageFilters = {};
    state.ui.galleryTarget = "auto";
    state.ui.galleryDraft = draftFor("auto");
    if (state.layoutId === "present") state.layoutId = "executive";
    render();
    const n = sheets.reduce((a, s) => a + s.tables.length, 0);
    toast(`Detected ${n} table${n === 1 ? "" : "s"}${sheets.length > 1 ? ` on ${sheets.length} sheets` : ""}.`);
  }

  // An exported dashboard: tables + view are embedded; there is no raw workbook.
  function loadEmbed(emb) {
    const v = emb.view || {};
    Object.assign(state, {
      workbook: null, sheets: emb.sheets, fileName: emb.title || emb.fileName || "Dashboard", activeSheet: 0, overrides: {},
      filters: { ...DV.filters.empty(), ...(v.filters || {}) }, pageFilters: v.pageFilters || {}, selection: { highlight: null, highlightLabel: null },
      customizations: { ...C.emptyCustomizations(), ...(v.customizations || {}) }, history: { past: [], future: [] },
      editMode: false, ui: freshUI(), stage: "dashboard", viewer: emb.viewer || { allowEdit: false, allowDesign: true, allowOpen: false },
      layoutId: v.layoutId || state.layoutId, variantId: DV.designs.variant(v.variantId).id, paletteId: v.paletteId === "cb" ? "cb" : "default",
      density: v.density || state.density, corners: v.corners || state.corners,
    });
    DV.page.migrate(state.customizations, allTables());
    if (state.layoutId === "present" || state.layoutId === "focus") state.layoutId = "executive";
  }

  // ---- Keyboard ----
  function onKey(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && state.sheets && (e.key === "PageDown" || e.key === "PageUp") && state.stage !== "gallery") {
      const ps = DV.page.pages(state.customizations), i = ps.findIndex((p) => p.id === (DV.page.active(state.customizations) || {}).id);
      const j = i + (e.key === "PageDown" ? 1 : -1);
      if (j >= 0 && j < ps.length) { e.preventDefault(); return switchPage(ps[j].id); }
    }
    if ((e.ctrlKey || e.metaKey) && !typing && state.sheets) {
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); return undo(); }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); return redo(); }
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || !state.sheets) return;
    const modalOpen = !!document.querySelector(".modal-backdrop");
    const layout = DV.layouts.get(state.layoutId);
    if (e.key === "Escape") {
      if (DV.dom.isPopoverOpen() || modalOpen) return;
      if (state.ui.filtersOpen) return setUI((u) => { u.filtersOpen = false; });
      if (layout.id === "present") return exitPresentation();
      if (state.editMode) return commit((st) => { st.editMode = false; }, { history: false });
      if (state.selection.highlight) return highlight(null);
      return;
    }
    if (modalOpen) return;
    if (layout.id === "present" && (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "PageDown" || e.key === "PageUp" || e.key === " ")) {
      e.preventDefault();
      const n = DV.views.slides(sheet(), layout).length;
      const d = e.key === "ArrowLeft" || e.key === "PageUp" ? -1 : 1;
      return setUI((u) => { u.slide = U.clamp(u.slide + d, 0, n - 1); });
    }
    const k = e.key.toLowerCase();
    const click = (pop) => { const el = document.querySelector(`.topbar [data-pop="${pop}"]`); if (el) el.click(); };
    if (previewOnly() && k !== "f") return;
    if (k === "t") { e.preventDefault(); click("theme"); }
    else if (k === "l") { e.preventDefault(); click("layout"); }
    else if (k === "f") { e.preventDefault(); toggleFilters(); }
    else if (k === "r" && state.workbook) { e.preventDefault(); DV.review.open(); }
    else if (k === "e" && canEdit() && state.stage !== "gallery") { e.preventDefault(); commit((st) => { st.editMode = !st.editMode; }, { history: false }); }
    else if (k === "g" && canEdit() && state.stage !== "gallery") { e.preventDefault(); openGallery(); }
  }

  function boot() {
    document.addEventListener("keydown", onKey);
    DV.loader.enableGlobalDrop();
    if (globalThis.matchMedia) {
      const mq = matchMedia("(prefers-color-scheme: dark)");
      const onChange = () => {};
      if (mq.addEventListener) mq.addEventListener("change", onChange); else if (mq.addListener) mq.addListener(onChange);
    }
    if (!globalThis.echarts || !globalThis.XLSX) {
      document.getElementById("app").textContent = "This file is incomplete: its built-in libraries failed to load. Please download TheSight2.0.html again.";
      return;
    }
    const emb = DV.exporter.readEmbed();
    if (emb) loadEmbed(emb);
    render();
  }

  DV.app = {
    state, commit, setUI, render, reopen, afterRender: (fn) => afterQueue.push(fn), highlight, duplicateChart, tableById, switchPage, addPage, renamePage, duplicatePage, movePage, deletePage, pageSheet, addImage, setLogo, addSection, deleteSection, moveSection, moveItem, setGalleryTarget, recommendedPage,
    renameTable, exportCSV, toggleFilters, exitPresentation, start, undo, redo, setLayout,
    exportXLSX, removeItem, openGallery, buildFromGallery, closeGallery, canEdit, canDesign, previewOnly, reanalyze,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
