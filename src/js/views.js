/* Layout renderers: the user's sections (customizations.page) arranged per layout.
   In an exported preview there is no filter sidebar/bar: filtering happens through the
   filter cards on the page and by clicking charts. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, iconBtn } = DV.dom;
  const D = DV.dashboard;
  const app = () => DV.app;

  const sectionsOf = () => DV.page.list(app().state.customizations);
  const filtersShown = () => !app().previewOnly();
  // Title + KPI row share a "head zone" so designs with a header band (Executive, Banking,
  // Plum) can paint it behind them.
  const top = (sheet) => h("div", { class: "head-zone" }, D.header(sheet), D.kpiRow(sheet));

  // ---- Page tabs: add / switch / rename (double-click) / ⋯ menu in edit mode ----
  function pageTabs() {
    const s = app().state, cz = s.customizations;
    const pages = DV.page.pages(cz);
    const cur = DV.page.active(cz);
    const canEdit = app().canEdit();
    if (!pages.length || (pages.length === 1 && !canEdit)) return null;
    const tab = (p, i) => {
      const on = cur && p.id === cur.id;
      const label = h("span", { text: p.title, contenteditable: s.editMode && on ? "true" : null, spellcheck: "false",
        onblur: s.editMode && on ? (e) => app().renamePage(p.id, e.target.textContent.trim()) : null,
        onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } } });
      const btn = h("button", { type: "button", role: "tab", class: "page-tab", "aria-selected": String(!!on), onclick: () => app().switchPage(p.id),
        ondblclick: canEdit ? () => { if (!s.editMode) app().commit((st) => { st.editMode = true; }, { history: false }); } : null }, label);
      const menu = s.editMode && on ? h("button", { type: "button", class: "btn ghost icon-only page-menu", "aria-label": "Page options", "data-pop": "page:" + p.id,
        onclick: (e) => DV.dom.popover(e.currentTarget, [
          h("h4", { text: "Page" }),
          h("button", { class: "menu-item", type: "button", onclick: () => { DV.dom.closePopover(); app().duplicatePage(p.id); } }, icon("copy"), "Duplicate page"),
          i > 0 ? h("button", { class: "menu-item", type: "button", onclick: () => { DV.dom.closePopover(); app().movePage(p.id, -1); } }, icon("left"), "Move left") : null,
          i < pages.length - 1 ? h("button", { class: "menu-item", type: "button", onclick: () => { DV.dom.closePopover(); app().movePage(p.id, 1); } }, icon("right"), "Move right") : null,
          pages.length > 1 ? h("button", { class: "menu-item", type: "button", onclick: () => { DV.dom.closePopover(); app().deletePage(p.id); } }, icon("close"), "Delete page") : null,
        ], { label: "Page options" }) }, icon("more")) : null;
      return h("span", { class: "page-tab-wrap" }, btn, menu);
    };
    return h("nav", { class: "page-tabs no-print", role: "tablist", "aria-label": "Dashboard pages" },
      pages.map(tab),
      canEdit ? h("button", { type: "button", class: "page-add", onclick: () => app().addPage(), title: "Add a page" }, icon("plus"), "Add page") : null);
  }

  // Sheets that repeat the same report (periods/scenarios), grouped by title without years.
  function compareGroups() {
    const s = app().state, U = DV.utils;
    const norm = (title) => U.normKey(title.replace(/\b(19|20)[0-9]{2}\b/g, "").replace(/\b(q[1-4]|fy[0-9]*)\b/gi, ""));
    const groups = new Map();
    for (const sh of s.sheets || []) for (const t of sh.tables) {
      if (t.meta.virtual || !t.totals.grand) continue;
      const k = norm(t.title);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ sh, t });
    }
    return [...groups.values()].filter((list) => new Set(list.map((x) => x.sh.name)).size >= 2);
  }
  const hasCompare = () => compareGroups().length > 0;

  // "Compare sheets" card: Grand Totals per sheet with the change between consecutive sheets.
  function compareCard(spec, opts = {}) {
    const U = DV.utils;
    const groups = compareGroups();
    const fmt = (v) => (v == null ? "–" : U.formatCompact(v));
    const body = groups.length ? groups.map((list) => {
      const measures = DV.recommender.baseMeasures(list[0].t);
      return h("div", { class: "cmp-block" },
        h("h4", { class: "cmp-title", text: list[0].t.title.replace(/\s*(19|20)[0-9]{2}\s*/g, " ").trim() }),
        h("div", { class: "table-wrap" }, h("table", { class: "data" },
          h("thead", null, h("tr", null, h("th", { text: "Measure" }), list.map((x) => h("th", { text: x.sh.name })), list.slice(1).map((x, i) => h("th", { text: `Δ ${list[i].sh.name}→${x.sh.name}` })))),
          h("tbody", null, measures.map((m) => {
            const vals = list.map((x) => { const c = x.t.columns.find((cc) => U.normKey(cc.label) === U.normKey(m.label)); return c ? x.t.totals.grand[c.key] : null; });
            return h("tr", null, h("td", { text: m.label }), vals.map((v) => h("td", { class: "num", text: fmt(v) })),
              vals.slice(1).map((v, i) => { const p = vals[i]; const d = v != null && p ? (v - p) / Math.abs(p) * 100 : null;
                return h("td", { class: "num", text: d == null ? "–" : `${d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}${d.toFixed(1)}%` }); }));
          })))));
    }) : h("p", { class: "muted", text: "No repeated reports across sheets to compare." });
    const card = h("article", { class: "card table-card fade-in", "data-chart": opts.preview ? null : spec.id },
      h("div", { class: "card-head" }, h("h3", null, "Compare sheets", h("span", { class: "caption", text: "Grand Totals per sheet; change vs the previous sheet" }))),
      body,
      !opts.preview && app().state.editMode ? DV.cards.editBar(null, spec) : null);
    return DV.cards.sized(card, { ...spec, type: "table" }, opts);
  }



  function addSectionRow() {
    if (!app().canEdit()) return null;
    return h("div", { class: "more-row no-print" }, h("button", { class: "btn", type: "button", onclick: () => app().addSection() }, icon("plus"), "Add section"));
  }
  const sectionList = (layout, opts) => h("div", { class: "sections", "data-dnd": "sections" }, sectionsOf().map((sec) => D.section(sec, layout, opts)));

  function exec(sheet, layout) {
    const main = h("div", null, top(sheet), sectionList(layout), addSectionRow());
    if (!filtersShown()) return h("div", { class: "lay-plain" }, main);
    return h("div", { class: "lay-exec" }, h("aside", { class: "sidebar no-print" }, D.filterBar(sheet)), main);
  }

  // Boards: sections as boards in two columns.
  function boards(sheet, layout) {
    return h("div", { class: "lay-boards" }, top(sheet), filtersShown() ? D.filterBar(sheet) : null,
      h("div", { class: "sections", vars: { "--board-cols": sectionsOf().length > 1 ? "2" : "1" } }, sectionsOf().map((sec) => D.section(sec, layout))), addSectionRow());
  }

  function story(sheet, layout) {
    return h("div", { class: "lay-story" }, top(sheet), filtersShown() ? D.filterBar(sheet) : null, sectionList(layout), addSectionRow());
  }

  // Bento: same sections, denser tiles (the first chart of each section is a large hero).
  function bento(sheet, layout) {
    return h("div", { class: "lay-bento" }, top(sheet), filtersShown() ? D.filterBar(sheet) : null, sectionList(layout, { bento: true }), addSectionRow());
  }

  function allItems() {
    return sectionsOf().flatMap((sec) => D.itemsOf(sec).visible.map((x) => ({ ...x, sec })));
  }

  function focus(sheet, layout) {
    const s = app().state;
    const list = allItems();
    const charts = list.filter((x) => !x.spec.dom);
    const cur = charts.find((x) => x.spec.id === s.ui.focusChart) || charts[0];
    const hero = cur ? DV.cards.itemCard(cur.t, cur.spec, { caption: cur.sec.title, fixedW: 12, fixedH: 560, noResize: true }) : h("div", { class: "empty-note", text: "No charts to show." });
    const rail = charts.map((x) => DV.cards.itemCard(x.t, x.spec, { thumb: true, current: x === cur, onclick: () => app().setUI((u) => { u.focusChart = x.spec.id; }) }));
    rail.forEach((el) => { el.setAttribute("tabindex", "0"); el.setAttribute("role", "button"); el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } }); });
    const tiles = list.filter((x) => x.spec.dom).map((x) => DV.cards.itemCard(x.t, x.spec, { noResize: true }));
    return h("div", null, top(sheet), tiles.length ? h("div", { class: "cards" }, tiles) : null,
      h("div", { class: "lay-focus" }, h("div", { class: "cards" }, hero), h("nav", { class: "rail", "aria-label": "All charts" }, rail)));
  }

  function slides(sheet) {
    const out = [{ title: app().state.customizations.title || DV.utils.titleCase(sheet.title), kind: "kpi" }];
    for (const x of allItems()) if (x.spec.family !== "filters") out.push({ title: x.spec.title, sub: x.sec.title, t: x.t, sp: x.spec, kind: x.spec.type === "table" ? "table" : "chart" });
    return out;
  }

  function present(sheet, layout) {
    const s = app().state;
    const list = slides(sheet);
    const i = Math.max(0, Math.min(s.ui.slide, list.length - 1));
    const sl = list[i];
    let body;
    if (sl.kind === "kpi") body = h("div", null, D.kpiRow(sheet));
    else if (sl.kind === "table") body = DV.cards.tableCard(sl.t, { title: sl.title, spec: sl.sp, noResize: true });
    else body = h("div", { class: "cards" }, DV.cards.itemCard(sl.t, sl.sp, { fixedW: 12, noResize: true }));
    const go = (d) => app().setUI((u) => { u.slide = Math.max(0, Math.min(list.length - 1, i + d)); });
    return h("div", { class: "lay-present", role: "region", "aria-roledescription": "slideshow", "aria-label": "Presentation" },
      h("div", { class: "slide-head" },
        h("h2", { text: sl.title }), sl.sub ? h("span", { class: "muted", text: sl.sub }) : null,
        h("button", { class: "btn", type: "button", onclick: () => app().toggleFilters() }, icon("filter"), "Filters ", h("kbd", { text: "F" })),
        h("button", { class: "btn", type: "button", onclick: () => app().exitPresentation() }, "Exit ", h("kbd", { text: "Esc" }))),
      h("div", { class: "slide", "aria-live": "polite" }, body),
      h("div", { class: "slide-foot" },
        iconBtn("left", "Previous slide", () => go(-1), { attrs: { disabled: i === 0 } }),
        h("span", { text: `${i + 1} / ${list.length}` }),
        iconBtn("right", "Next slide", () => go(1), { attrs: { disabled: i === list.length - 1 } })));
  }

  // Tabbed: one tab per section, plus a Data tab with every table used.
  function tabs(sheet, layout) {
    const s = app().state;
    const secs = sectionsOf();
    const tab = s.ui.tab === "data" || secs.some((x) => x.id === s.ui.tab) ? s.ui.tab : secs[0] ? secs[0].id : "data";
    const btn = (id, label) => h("button", { type: "button", role: "tab", "aria-selected": String(tab === id), onclick: () => app().setUI((u) => { u.tab = id; }) }, label);
    const used = [...DV.page.tablesUsed(secs)].map((id) => app().tableById(id)).filter(Boolean);
    const panel = tab === "data" ? h("div", { class: "cards" }, used.map((t) => DV.cards.tableCard(t, { noResize: true })))
      : D.section(secs.find((x) => x.id === tab), layout);
    return h("div", { class: "lay-tabs" }, top(sheet), filtersShown() ? D.filterBar(sheet) : null,
      h("div", { class: "tabbar", role: "tablist" }, secs.map((x) => btn(x.id, x.title)), btn("data", "Data")),
      h("div", { role: "tabpanel" }, panel), addSectionRow());
  }

  const visibleSections = () => sectionsOf();
  DV.views = { exec, boards, story, focus, present, tabs, bento, slides, visibleSections, pageTabs, compareCard, hasCompare };
})();
