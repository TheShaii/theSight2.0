/* Chart cards, the per-chart ⋯ customization menu, data-table cards, chart lifecycle. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, iconBtn, popover, closePopover, modal, download, toast } = DV.dom;
  const U = DV.utils, R = DV.recommender;
  const app = () => DV.app;

  // ---- Chart lifecycle (all instances are disposed on every render) ----
  let live = [];
  function disposeAll() {
    for (const c of live) { try { c.ro && c.ro.disconnect(); c.inst.dispose(); } catch (e) { /* already gone */ } }
    live = [];
  }
  function mountChart(el, table, spec, opts = {}) {
    const s = app().state;
    const theme = DV.designs.read(s);
    const custom = { ...(s.customizations.charts[spec.id] || {}) };
    if (custom.color != null) custom.color = theme.series[custom.color];
    const view = DV.filters.view(table, s.filters, { measure: spec.measure || spec.actual, sort: custom.sort });
    const option = DV.charts.buildOption(table, spec, { theme, view, highlight: s.selection.highlight, custom, sortMode: custom.sort || s.filters.sort });
    if (opts.thumb) { option.tooltip = { show: false }; option.legend = undefined; delete option.toolbox; delete option.brush; delete option.dataZoom; option.animation = false;
      // Thumbnails show shape only: no axis text or value labels to collide at small sizes.
      for (const ax of [].concat(option.xAxis || [], option.yAxis || [])) { ax.axisLabel = { show: false }; ax.name = ""; }
      for (const se of option.series || []) { se.label = { show: false }; se.endLabel = { show: false }; if (se.markLine) se.markLine.label = { show: false }; }
      option.grid = [].concat(option.grid || {}).map((g) => ({ ...g, left: 4, right: 4, top: g.top === "68%" ? "70%" : 4, bottom: 4 }));
      delete option.visualMap; }
    if (opts.preview) { option.animation = false; delete option.toolbox; delete option.brush; delete option.dataZoom; }
    const inst = echarts.init(el, null, { renderer: "canvas" });
    inst.setOption(option, true);
    if (!opts.thumb && !opts.preview) wireEvents(inst, table);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => inst.resize()) : null;
    if (ro) ro.observe(el);
    live.push({ inst, ro, id: spec.id });
    return inst;
  }

  // The value of the table's first field for a chart label ("East › Hardware" → "East").
  function fieldValue(table, label) {
    const row = table.rows.find((r) => r.label === label);
    return row ? DV.filters.dimValue(table, row) : label;
  }

  function wireEvents(inst, table) {
    const name = (p) => p && p.name && !/^Other \(\d+\)$/.test(p.name) ? p.name : null;
    let clickTimer = null;
    inst.on("click", (p) => {
      const label = name(p);
      if (!label) return;
      const ev = p.event && p.event.event;
      if (ev && ev.shiftKey) {
        app().commit((s) => { s.filters = DV.filters.toggleMember(s.filters, DV.filters.dimKey(table), fieldValue(table, label), DV.filters.memberOrder(table)); });
        return;
      }
      // Delay single click so a double-click can isolate without flicker.
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => app().highlight(label), 220);
    });
    inst.on("dblclick", (p) => {
      const label = name(p);
      if (!label) return;
      clearTimeout(clickTimer);
      app().commit((s) => { s.filters = DV.filters.setMembers(s.filters, DV.filters.dimKey(table), [fieldValue(table, label)]); s.selection.highlight = null; });
      toast(`Showing only "${label}". Shift-click members to add more.`);
    });
    inst.on("brushselected", (e) => {
      const batch = e.batch && e.batch[0];
      if (!batch || !batch.areas || !batch.areas.length) return;
      const names = new Set();
      const opt = inst.getOption();
      batch.selected.forEach((sel) => {
        const series = opt.series[sel.seriesIndex];
        (sel.dataIndex || []).forEach((i) => { const d = series.data[i]; if (d && d.name && !/^Other/.test(d.name)) names.add(d.name); });
      });
      clearTimeout(inst.__brushT);
      inst.__brushT = setTimeout(() => {
        if (!names.size) return;
        app().commit((s) => { s.filters = DV.filters.setMembers(s.filters, DV.filters.dimKey(table), [...new Set([...names].map((n) => fieldValue(table, n)))]); });
        toast(`Filtered to ${names.size} brushed member(s).`);
      }, 400);
    });
  }

  function chartPNG(table, spec) {
    const found = live.find((c) => c.id === spec.id);
    if (!found) return;
    const url = found.inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: DV.designs.read(app().state).surface });
    download(fileSafe(spec.title || "chart") + ".png", url);
  }
  const fileSafe = (s) => String(s).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "chart";

  function fullscreen(table, spec) {
    const holder = h("div", { class: "chart" });
    const m = modal(spec.title, holder, { wide: true, onClose: () => { inst && inst.dispose(); } });
    let inst = null;
    requestAnimationFrame(() => { inst = mountChart(holder, table, spec); });
    return m;
  }

  // ---- Chart card ----
  function chartCard(table, spec, opts = {}) {
    const s = app().state;
    const c = s.customizations.charts[spec.id] || {};
    const title = c.title || spec.title;
    const holder = h("div", { class: "chart", role: "img", "aria-label": `${title}. Data is listed in the ${table.title} table.` });
    const menuBtn = iconBtn("more", "Chart options", (e) => chartMenu(e.currentTarget, table, spec), { attrs: { "data-pop": "chart:" + spec.id, "aria-haspopup": "dialog" } });
    const card = h("article", { class: "card fade-in" + (opts.thumb ? " thumb" : ""), "data-chart": spec.id, "data-table": table.id, tabindex: s.editMode ? 0 : null, "aria-current": opts.current ? "true" : null, onclick: opts.onclick },
      h("div", { class: "card-head" },
        s.editMode && !opts.thumb ? h("span", { class: "muted", title: "Drag to reorder (or Alt+↑/↓)" }, icon("grip")) : null,
        h("h3", null, c.icon ? DV.icons.node(c.icon, "ico-inline") : null, title, c.caption || opts.caption ? h("span", { class: "caption", text: c.caption || opts.caption }) : null),
        opts.thumb ? null : h("div", { class: "card-tools" },
          iconBtn("expand", "Full screen", () => fullscreen(table, { ...spec, title })),
          app().canEdit() ? iconBtn("download", "Download PNG", () => chartPNG(table, { ...spec, title })) : null,
          app().canEdit() ? menuBtn : null)),
      holder,
      opts.thumb ? null : editBar(table, spec));
    card.__mount = () => mountChart(holder, table, spec, { thumb: opts.thumb });
    return opts.thumb ? card : sized(card, spec, opts, holder);
  }

  // ---- Free sizing: any width on the 12-column grid, any height, set by dragging ----
  const KPI = new Set(["stat", "varianceTile"]);
  function defaultSize(spec, opts) {
    if (opts.fixedW) return { w: opts.fixedW, h: opts.fixedH || null };
    if (spec.type === "table") return { w: 12, h: null };
    if (KPI.has(spec.type)) return { w: 3, h: null };
    if (R.FAMILY_OF[spec.type] === "filters") return { w: spec.type === "filterPane" ? 4 : 3, h: null };
    if (opts.layout && opts.layout.kind === "story") return { w: 12, h: 420 };
    if (opts.layout && opts.layout.kind === "bento" && opts.index === 0) return { w: 8, h: 480 };
    return { w: 6, h: null };
  }
  const LEGACY_W = { third: 4, half: 6, full: 12, hero: 8 };
  function sized(card, spec, opts, chartEl) {
    if (opts.preview) return card;
    const c = app().state.customizations.charts[spec.id] || {};
    const d = defaultSize(spec, opts);
    const w = opts.fixedW || c.w || LEGACY_W[c.width] || d.w;
    const ht = opts.fixedH || c.h || d.h;
    card.style.gridColumn = "span " + Math.max(1, Math.min(12, w));
    card.dataset.w = w;
    if (ht) { if (chartEl) chartEl.style.height = ht + "px"; else card.style.minHeight = ht + "px"; }
    if (!opts.noResize && app().canEdit()) card.appendChild(resizeHandle(card, spec, chartEl));
    return card;
  }

  // Drag the corner: width snaps to the 12-column grid, height is free.
  function resizeHandle(card, spec, chartEl) {
    const el = h("span", { class: "rs-handle no-print", title: "Drag to resize", "aria-hidden": "true" });
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const grid = card.parentElement;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
      const colW = (grid.clientWidth - gap * 11) / 12;
      const left = card.getBoundingClientRect().left;
      const top = (chartEl || card).getBoundingClientRect().top;
      let w = +card.dataset.w || 6, ht = null;
      card.classList.add("resizing");
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        w = Math.max(1, Math.min(12, Math.round((ev.clientX - left + gap) / (colW + gap))));
        ht = Math.max(chartEl ? 140 : 90, Math.round(ev.clientY - top));
        card.style.gridColumn = "span " + w;
        if (chartEl) chartEl.style.height = ht + "px"; else card.style.minHeight = ht + "px";
        el.dataset.size = w + "/12 · " + ht + "px";
      };
      const up = () => {
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up);
        card.classList.remove("resizing");
        if (ht == null) return;
        app().commit((st) => { const cur = { ...(st.customizations.charts[spec.id] || {}) }; delete cur.width; st.customizations.charts[spec.id] = { ...cur, w, h: ht }; });
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    });
    return el;
  }

  function editBar(table, spec) {
    const s = app().state;
    const set = (patch) => app().commit((st) => { st.customizations.charts[spec.id] = { ...(st.customizations.charts[spec.id] || {}), ...patch }; });
    const page = DV.page.list(s.customizations);
    const here = DV.page.find(page, spec.id);
    const c = s.customizations.charts[spec.id] || {};
    return h("div", { class: "edit-bar" },
      page.length > 1 ? h("select", { class: "input", "aria-label": "Move to section", onchange: (e) => e.target.value && app().moveItem(spec.id, e.target.value) },
        h("option", { value: "" }, "Move to…"), page.filter((x) => !here || x.id !== here.section.id).map((x) => h("option", { value: x.id }, x.title))) : null,
      h("button", { class: "btn", type: "button", onclick: (e) => DV.icons.picker(e.currentTarget, c.icon, (n) => set({ icon: n || (KPI.has(spec.type) ? "none" : undefined) })) }, icon("star"), "Icon"),
      h("button", { class: "btn", type: "button", onclick: () => app().duplicateChart(table, spec) }, icon("copy"), "Duplicate"),
      h("button", { class: "btn", type: "button", onclick: () => set({ hidden: true }) }, icon("eyeOff"), "Hide"),
      h("button", { class: "btn", type: "button", onclick: () => app().removeItem(table, spec.id) }, icon("close"), "Remove"),
      c.w || c.h || c.width ? h("button", { class: "btn ghost", type: "button", onclick: () => app().commit((st) => { const x = st.customizations.charts[spec.id]; delete x.w; delete x.h; delete x.width; }) }, icon("reset"), "Reset size") : null);
  }

  // ---- Big-number / variance tiles (Grand Total values only) ----
  function kpiCard(table, spec, opts = {}) {
    const s = app().state;
    const c = s.customizations.charts[spec.id] || {};
    const g = table.totals.grand || {};
    const col = table.columns.find((x) => x.key === spec.measure);
    let value, sub, cls = "";
    if (spec.type === "varianceTile") {
      const d = col.derived;
      const v = g[spec.measure], plan = g[d.b];
      const over = (/^over/i.test(d.positiveLabel) ? v > 0 : v < 0);
      value = U.formatSigned(v);
      sub = `${plan ? Math.abs(v / plan * 100).toFixed(1) + "% " : ""}${over ? "over" : "under"} ${R.colLabel(table, d.b).toLowerCase()}`;
      cls = over ? " delta-bad" : " delta-good";
    } else {
      value = U.formatCompact(g[spec.measure], { percent: col.measureType === "percent" });
      sub = `${U.formatNumber(g[spec.measure], col.numberFormat).text} · ${table.totals.grandLabel || "Grand Total"}`;
    }
    const title = c.title || spec.title;
    const card = h("article", { class: "card stat-card fade-in", "data-chart": opts.preview ? null : spec.id, "data-table": table.id, tabindex: s.editMode ? 0 : null },
      opts.preview ? null : h("div", { class: "card-head" },
        s.editMode ? h("span", { class: "muted" }, icon("grip")) : null,
        h("h3", null, title, c.caption ? h("span", { class: "caption", text: c.caption }) : null),
        opts.preview || !app().canEdit() ? null : h("div", { class: "card-tools" }, iconBtn("more", "Options", (e) => chartMenu(e.currentTarget, table, spec), { attrs: { "data-pop": "chart:" + spec.id } }))),
      c.icon === "none" ? null : DV.icons.badge(c.icon || DV.icons.auto(spec.measure)),
      h("div", { class: "stat-value" + cls, text: value }),
      h("div", { class: "stat-sub", text: sub }),
      h("div", { class: "stat-src", text: table.title }),
      opts.preview ? null : editBar(table, spec));
    return sized(card, spec, opts);
  }

  // One entry point for every board item.
  function itemCard(table, spec, opts = {}) {
    if (spec.type === "image") return DV.media.imageCard(spec, opts);
    if (spec.type === "compare") return DV.views.compareCard(spec, opts);
    if (R.FAMILY_OF[spec.type] === "filters") return DV.filterCards.card(table, spec, opts);
    if (spec.type === "table") return tableCard(table, { ...opts, spec });
    if (spec.type === "stat" || spec.type === "varianceTile") return kpiCard(table, spec, opts);
    return chartCard(table, spec, opts);
  }

  // ---- ⋯ menu ----
  function chartMenu(anchor, table, spec) {
    const s = app().state;
    const c = s.customizations.charts[spec.id] || {};
    const fits = R.fits(table);
    const commit = (patch, keepOpen = true) => {
      app().commit((st) => {
        const cur = { ...(st.customizations.charts[spec.id] || {}), ...patch };
        for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === "") delete cur[k];
        st.customizations.charts[spec.id] = cur;
      });
      if (keepOpen) app().reopen("chart:" + spec.id);
    };
    const field = (label, control) => h("label", { class: "menu-field" }, label, control);
    const select = (value, options, onchange) => h("select", { onchange: (e) => onchange(e.target.value) },
      options.map(([v, l]) => h("option", { value: v, selected: String(v) === String(value) }, l)));
    const measures = table.columns.filter((x) => x.role === "measure");
    const usesMeasure = ["rank", "donut", "treemap", "pareto", "variance", "funnel", "polar"].includes(spec.type);
    const measureOpts = spec.type === "variance" ? measures.filter((m) => m.derived && m.derived.op === "diff") : R.baseMeasures(table);

    const content = [
      h("h4", { text: "Customize chart" }),
      field("Chart type", select(spec.variant ? spec.type + ":" + spec.variant : spec.type, Object.keys(fits).map((k) => [k, R.TYPE_NAMES[k] || k]), (v) => commit({ type: v, measure: undefined, measures: undefined }))),
      usesMeasure && measureOpts.length > 1 ? field("Measure", select(spec.measure, measureOpts.map((m) => [m.key, m.label]), (v) => commit({ measure: v }))) : null,
      spec.type === "grouped" || spec.type === "radar" ? h("div", { class: "menu-field" }, "Measures",
        ...R.baseMeasures(table).map((m) => h("label", { class: "check" },
          h("input", { type: "checkbox", checked: spec.measures.includes(m.key), onchange: (e) => {
            const cur = new Set(spec.measures);
            if (e.target.checked) cur.add(m.key); else cur.delete(m.key);
            if (cur.size) commit({ measures: R.baseMeasures(table).map((x) => x.key).filter((k) => cur.has(k)) });
          } }), m.label))) : null,
      field("Sort", select(c.sort || "", [["", "Dashboard default"], ["value", "By value"], ["label", "By label"], ["original", "Excel order"]], (v) => commit({ sort: v || undefined }))),
      ["rank", "donut", "treemap"].includes(spec.type) ? field("Show top", select(c.topN || "", [["", "Auto"], [3, "Top 3 + Other"], [5, "Top 5 + Other"], [8, "Top 8 + Other"], [10, "Top 10 + Other"], [20, "Top 20 + Other"]], (v) => commit({ topN: v ? +v : undefined }))) : null,
      ["rank", "grouped", "stacked", "stacked100", "bullet", "variance"].includes(spec.type) ? field("Orientation", select(c.horizontal == null ? "" : c.horizontal ? "h" : "v", [["", "Auto"], ["h", "Horizontal"], ["v", "Vertical"]], (v) => commit({ horizontal: v === "" ? undefined : v === "h" }))) : null,
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!c.labels, onchange: (e) => commit({ labels: e.target.checked || undefined }) }), "Show value labels"),
      spec.type === "rank" ? field("Bar color", select(c.color == null ? "" : c.color, [["", "Theme default"], ...[1, 2, 3, 4, 5, 6, 7].map((i) => [i, `Series color ${i + 1}`])], (v) => commit({ color: v === "" ? undefined : +v }))) : null,
      field("Title", h("input", { type: "text", value: c.title || spec.title, onchange: (e) => commit({ title: e.target.value === spec.autoTitle ? undefined : e.target.value }) })),
      field("Caption", h("input", { type: "text", value: c.caption || "", placeholder: "Add a note under the title", onchange: (e) => commit({ caption: e.target.value }) })),
      h("div", { class: "menu-sep" }),
      menuItem("copy", "Duplicate", () => { closePopover(); app().duplicateChart(table, spec); }),
      menuItem("expand", "Full screen", () => { closePopover(); fullscreen(table, spec); }),
      menuItem("download", "Download PNG", () => { closePopover(); chartPNG(table, spec); }),
      menuItem("eyeOff", "Hide chart", () => { closePopover(); commit({ hidden: true }, false); }),
      menuItem("close", "Remove from dashboard", () => { closePopover(); app().removeItem(table, spec.id); }),
      menuItem("reset", "Reset to auto", () => { closePopover(); app().commit((st) => { delete st.customizations.charts[spec.id]; }); }),
    ];
    popover(anchor, content, { label: "Chart options", alignRight: true });
  }
  const menuItem = (ic, label, onclick) => h("button", { class: "menu-item", type: "button", onclick }, icon(ic), label);

  // ---- Data table card (faithful to the source: formats, pinned Grand Total) ----
  function tableCard(table, opts = {}) {
    const s = app().state;
    const view = DV.filters.view(table, s.filters);
    const visible = new Set(view.rows.map((r) => r.index));
    const sort = s.ui.tableSort[table.id] || null;
    const bars = !!s.ui.dataBars[table.id];
    const cols = table.columns.filter((c) => c.role !== "ignore");
    let rows = table.rows.slice();
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const c = cols.find((x) => x.key === sort.key);
      rows.sort((a, b) => c && c.role === "measure" ? dir * ((a.values[c.key] ?? -Infinity) - (b.values[c.key] ?? -Infinity)) : dir * String(a.labels[sort.key] || a.label).localeCompare(String(b.labels[sort.key] || b.label), undefined, { numeric: true }));
    }
    const maxAbs = {};
    for (const c of cols) if (c.role === "measure" || c.role === "total") maxAbs[c.key] = Math.max(1e-9, ...table.rows.map((r) => Math.abs(r.values[c.key] || 0)));
    const cell = (row, c, isTotal) => {
      if (c.role !== "measure" && c.role !== "total") return h("td", { text: isTotal ? (c === cols[0] ? table.totals.grandLabel || "Grand Total" : "") : row.labels[c.key] || "" });
      const v = isTotal ? row[c.key] : row.values[c.key];
      const f = U.formatNumber(v, c.numberFormat);
      const td = h("td", { class: "num" + (f.red ? " neg-red" : "") + (bars && !isTotal && v != null ? " bar" : ""), text: v == null ? (isTotal ? "" : row.display[c.key] || "") : f.text });
      if (bars && !isTotal && v != null) td.style.setProperty("--pct", (Math.abs(v) / maxAbs[c.key] * 100).toFixed(1) + "%");
      return td;
    };
    const th = (c) => h("th", { scope: "col", tabindex: 0, "aria-sort": sort && sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : null,
      onclick: () => app().setUI((u) => { const cur = u.tableSort[table.id]; u.tableSort[table.id] = cur && cur.key === c.key ? (cur.dir === "desc" ? { key: c.key, dir: "asc" } : null) : { key: c.key, dir: c.role === "measure" ? "desc" : "asc" }; }),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } } }, c.label);
    const hl = s.selection.highlight;
    const limit = ((s.ui.tableLimit || {})[table.id]) || 100;
    const tbl = h("table", { class: "data" },
      h("caption", { class: "sr-only", text: `${table.title} (${table.range})` }),
      h("thead", null, h("tr", null, cols.map(th))),
      h("tbody", null, rows.slice(0, limit).map((r) => h("tr", { class: (visible.has(r.index) ? "" : "dim") + (hl && DV.filters.memberKey(r.label) === hl ? " hl" : ""), onclick: () => app().highlight(r.label) },
        cols.map((c) => cell(r, c, false))))),
      table.totals.grand ? h("tfoot", null, h("tr", null, cols.map((c) => cell(table.totals.grand, c, true)))) : null);
    const title = opts.title || `${table.title}: data`;
    const tcard = h("article", { class: "card table-card fade-in", "data-table": table.id, "data-chart": opts.spec && !opts.preview ? opts.spec.id : null, tabindex: opts.spec && s.editMode ? 0 : null },
      h("div", { class: "card-head" },
        h("h3", null, title, h("span", { class: "caption", text: `${table.sheet} · ${table.range} · ${table.rows.length} rows${table.totals.grand ? " + " + (table.totals.grandLabel || "Grand Total") : ""}` })),
        h("div", { class: "card-tools" },
          opts.spec && s.editMode ? h("button", { class: "btn ghost", type: "button", onclick: () => app().removeItem(table, opts.spec.id) }, icon("close"), "Remove") : null,
          h("button", { class: "btn ghost", type: "button", "aria-pressed": String(bars), onclick: () => app().setUI((u) => { u.dataBars[table.id] = !bars; }) }, "Data bars"),
          app().canEdit() ? iconBtn("download", "Download CSV", () => DV.app.exportCSV(table)) : null)),
      h("div", { class: "table-wrap" }, tbl),
      rows.length > limit ? h("div", { class: "more-row no-print" },
        h("span", { class: "muted small", text: `Showing ${limit.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows` }),
        h("button", { class: "btn", type: "button", onclick: () => app().setUI((u) => { u.tableLimit = { ...(u.tableLimit || {}), [table.id]: limit + 100 }; }) }, "Show 100 more"),
        rows.length <= 5000 ? h("button", { class: "btn ghost", type: "button", onclick: () => app().setUI((u) => { u.tableLimit = { ...(u.tableLimit || {}), [table.id]: rows.length }; }) }, "Show all") : null) : null,
      opts.spec && !opts.preview && s.editMode ? editBar(table, opts.spec) : null);
    return opts.spec ? sized(tcard, opts.spec, opts) : tcard;
  }

  DV.cards = { sized, editBar, chartCard, tableCard, kpiCard, itemCard, chartMenu, mountChart, disposeAll, fullscreen, chartPNG };
})();
