/* "Pick your charts": every chart that fits each table, as live previews with checkboxes.
   Ticking only edits a draft (state.ui.galleryDraft); "Build dashboard" turns it into the board.
   Previews mount lazily so dozens of them stay smooth. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, iconBtn } = DV.dom;
  const R = DV.recommender;
  const app = () => DV.app;
  let observer = null;

  const draft = () => new Set(app().state.ui.galleryDraft || []);
  function setDraft(set) { app().state.ui.galleryDraft = [...set]; }

  function render(sheet) {
    const s = app().state, ui = s.ui;
    const sel = draft();
    const tables = s.sheets.flatMap((sh) => sh.tables).filter((t) => !t.hidden);
    const multi = s.sheets.length > 1;
    const shownTables = ui.galleryTable ? tables.filter((t) => t.id === ui.galleryTable) : tables;
    const page = DV.page.list(s.customizations);
    const target = ui.galleryTarget || "auto";
    const targetSel = h("select", { class: "input", "aria-label": "Add to section", onchange: (e) => app().setGalleryTarget(e.target.value) },
      !page.length ? h("option", { value: "auto", selected: target === "auto" }, "One section per table (recommended)") : null,
      page.map((x) => h("option", { value: x.id, selected: target === x.id }, "Section: " + x.title)),
      h("option", { value: "new", selected: target === "new" }, "+ New section"));
    const q = (ui.gallerySearch || "").trim().toLowerCase();
    const fam = ui.galleryFamily || "all";
    const count = h("strong", { class: "g-count", text: String(sel.size) });

    const famSeg = h("div", { class: "seg", role: "group", "aria-label": "Chart family" },
      [["all", "All"], ...R.FAMILIES].map(([id, name]) => h("button", { type: "button", "aria-pressed": String(fam === id),
        onclick: () => app().setUI((u) => { u.galleryFamily = id; }) }, name)));
    const tableSel = h("select", { class: "input", "aria-label": "Table", onchange: (e) => app().setUI((u) => { u.galleryTable = e.target.value || null; }) },
      h("option", { value: "" }, `All tables (${tables.length})`),
      tables.map((t) => h("option", { value: t.id, selected: ui.galleryTable === t.id }, (multi ? t.sheet + " › " : "") + t.title)));
    const search = h("input", { type: "search", class: "input", placeholder: "Search charts…", value: ui.gallerySearch, "data-fk": "gsearch", "aria-label": "Search charts",
      oninput: debounce((e) => app().setUI((u) => { u.gallerySearch = e.target.value; }), 200) });

    let lastSheet = null;
    const sections = shownTables.map((t) => {
      const sheetHead = multi && t.sheet !== lastSheet ? h("h2", { class: "g-sheet", text: "Sheet: " + t.sheet }) : null;
      const items = R.catalog(t).filter((it) => (fam === "all" || it.family === fam) && (!q || (it.title + " " + it.typeName).toLowerCase().includes(q)));
      if (!items.length) return null;
      const ids = items.map((i) => i.id);
      const allOn = ids.every((id) => sel.has(id));
      lastSheet = t.sheet;
      return [sheetHead, h("section", { class: "g-section", "aria-label": t.title },
        h("div", { class: "g-section-head" },
          h("div", null, h("h2", { text: t.title }), h("p", { class: "muted small", text: `${R.insight(t)} · ${t.range}` })),
          h("button", { class: "btn ghost", type: "button", onclick: () => {
            const d = draft();
            ids.forEach((id) => (allOn ? d.delete(id) : d.add(id)));
            setDraft(d); app().render();
          } }, allOn ? "Untick all" : "Tick all")),
        h("div", { class: "g-grid" }, items.map((it) => card(t, it, sel.has(it.id), count))))];
    });
    // Across sheets: the comparison card (only when sheets repeat a report).
    if (multi && DV.views.hasCompare() && (fam === "all" || fam === "other") && !ui.galleryTable) {
      const it = { id: "compare-sheets", catalogId: "compare-sheets", type: "compare", family: "other", dom: true, title: "Compare sheets", typeName: "Comparison table" };
      sections.push([h("h2", { class: "g-sheet", text: "Across sheets" }), h("section", { class: "g-section" }, h("div", { class: "g-grid" }, card(null, it, sel.has(it.id), count)))]);
    }

    return h("main", { class: "gallery fade-in", id: "main" },
      h("header", { class: "g-head" },
        h("div", null,
          h("h1", { text: "Pick your charts" }),
          h("p", { class: "subtitle" }, `We found ${tables.length} table${tables.length === 1 ? "" : "s"} in `, h("strong", { text: s.fileName || "this file" }),
            ". Tick the charts you want. Charts from any table can go into any section; choose the section at the bottom. Add more any time with ", h("kbd", { text: "G" }), ".")),
        s.workbook ? h("button", { class: "chip clickable", type: "button", onclick: () => DV.review.open() }, icon("review"), `Detected ${tables.length} tables · Review`) : null),
      h("div", { class: "g-toolbar" }, famSeg, tableSel, h("label", { class: "field" }, icon("search"), search)),
      sections.some(Boolean) ? sections : h("div", { class: "empty-note", text: "No charts match. Try another family or clear the search." }),
      h("footer", { class: "g-footer", role: "region", "aria-label": "Selection" },
        h("span", null, count, " selected"),
        h("label", { class: "g-target" }, "Add to", targetSel),
        target === "auto" ? h("button", { class: "btn", type: "button", onclick: () => { setDraft(new Set(tables.flatMap((t) => R.recommend(t)).map((x) => x.id))); app().render(); } }, icon("check"), "Recommended only") : null,
        h("button", { class: "btn ghost", type: "button", onclick: () => { setDraft(new Set()); app().render(); } }, "Clear"),
        h("span", { class: "spacer" }),
        ui.galleryReturn ? h("button", { class: "btn", type: "button", onclick: () => app().closeGallery() }, "Cancel") : null,
        h("button", { class: "btn primary big", type: "button", onclick: () => app().buildFromGallery() }, ui.galleryReturn ? "Update dashboard" : "Build dashboard", icon("right"))));
  }

  function card(t, it, on, countEl) {
    const prev = h("div", { class: "g-prev", "data-gid": it.id });
    const box = h("input", { type: "checkbox", checked: on, "aria-label": `Add "${it.title}"`, tabindex: -1 });
    const el = h("article", { class: "g-card" + (on ? " on" : ""), role: "checkbox", "aria-checked": String(on), tabindex: 0, "data-family": it.family },
      h("div", { class: "g-card-head" },
        box,
        h("div", { class: "g-titles" }, h("strong", { text: it.title }), h("span", { class: "g-type", text: it.typeName })),
        it.recommended ? h("span", { class: "g-badge", title: "Recommended for this table" }, "★ Recommended") : null,
        it.dom ? null : iconBtn("expand", "Preview large", (e) => { e.stopPropagation(); DV.cards.fullscreen(t, it); })),
      prev);
    const toggle = () => {
      const d = draft();
      const now = !d.has(it.id);
      if (now) d.add(it.id); else d.delete(it.id);
      setDraft(d);
      // Update in place: re-rendering would remount every preview.
      el.classList.toggle("on", now);
      el.setAttribute("aria-checked", String(now));
      box.checked = now;
      countEl.textContent = String(d.size);
    };
    el.addEventListener("click", (e) => { if (!e.target.closest("button")) toggle(); });
    el.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(); } });
    el.__preview = () => {
      if (it.type === "compare") prev.appendChild(DV.views.compareCard(it, { preview: true }));
      else if (it.type === "table") prev.appendChild(miniTable(t));
      else if (it.dom) prev.appendChild(DV.cards.itemCard(t, it, { preview: true }));
      else { prev.appendChild(h("div", { class: "chart g-chart" })); DV.cards.mountChart(prev.firstChild, t, it, { preview: true }); }
    };
    return el;
  }

  function miniTable(t) {
    const cols = t.columns.slice(0, 4);
    return h("table", { class: "data g-mini" },
      h("thead", null, h("tr", null, cols.map((c) => h("th", { text: c.label })))),
      h("tbody", null, t.rows.slice(0, 5).map((r) => h("tr", null, cols.map((c) => h("td", { text: c.role === "measure" ? DV.utils.formatCompact(r.values[c.key]) : r.labels[c.key] || "" }))))));
  }

  // Mount previews as they scroll into view.
  function mount(root) {
    if (observer) observer.disconnect();
    const cards = [...root.querySelectorAll(".g-card")];
    const go = (el) => { if (el.__preview) { const f = el.__preview; el.__preview = null; f(); } };
    if (typeof IntersectionObserver === "undefined") { cards.forEach(go); return; }
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { go(e.target); observer.unobserve(e.target); }
    }, { rootMargin: "300px 0px" });
    cards.forEach((c) => observer.observe(c));
  }

  function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

  DV.gallery = { render, mount };
})();
