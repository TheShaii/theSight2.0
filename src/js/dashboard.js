/* Dashboard building blocks: resolved chart lists, KPIs, header, filter bar, sections. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, iconBtn, popover } = DV.dom;
  const U = DV.utils, R = DV.recommender, F = DV.filters;
  const app = () => DV.app;

  // Applies user customizations and the global measure picker over a board item.
  function resolveSpec(t, item, custom, view, secId) {
    let spec = { ...item };
    if (R.FAMILY_OF[item.type] === "filters") return { ...spec, autoTitle: R.titleFor(t, spec), title: custom.title || R.titleFor(t, spec) };
    if (custom.type && custom.type !== (item.variant ? item.type + ":" + item.variant : item.type)) {
      const swapped = R.specFor(t, custom.type, item);
      if (swapped) spec = { ...swapped, id: item.id };
    }
    if (custom.measure && t.columns.some((c) => c.key === custom.measure)) spec.measure = custom.measure;
    if (custom.measures) spec.measures = custom.measures.filter((k) => t.columns.some((c) => c.key === k));
    const sel = view.measures;
    if (spec.type !== "table" && spec.measure && !sel.includes(spec.measure)) {
      // Follow the measure picker when the table has a fitting selected measure.
      const alt = ["variance", "waterfall", "varianceTile", "stat"].includes(spec.type) ? null : R.baseMeasures(t).find((c) => sel.includes(c.key));
      if (!alt) return null;
      spec.measure = alt.key;
    }
    if (spec.measures && ["grouped", "stacked", "stacked100", "radar"].includes(spec.type) && !spec.measures.some((k) => sel.includes(k))) return null;
    if (spec.plan && !(sel.includes(spec.plan) && sel.includes(spec.actual))) return null;
    // A button bar's "show column" switch (this section, or "*" for the whole dashboard).
    const sm = (app().state.filters.sectionMeasure || {});
    const pick = (secId && sm[secId]) || sm["*"];
    if (pick && spec.measure && ["rank", "donut", "treemap", "pareto", "funnel", "polar", "stat", "valueRange"].includes(spec.type)) {
      const col = R.baseMeasures(t).find((c) => U.normKey(c.label) === pick.key);
      if (col && col.key !== spec.measure) { spec.measure = col.key; spec.switched = true; }
    }
    if (spec.type === "heatmap" && sel.length < 2) return null;
    spec.autoTitle = R.titleFor(t, spec);
    spec.title = (!spec.switched && custom.title) || spec.autoTitle;
    return spec;
  }

  // A section's items resolved against their own tables (sections may mix tables).
  function itemsOf(sec) {
    const s = app().state, cz = s.customizations;
    const out = [];
    for (const item of sec.items) {
      if (item.type === "image" || item.type === "compare") {
        const c = cz.charts[item.id] || {};
        out.push({ t: null, spec: { ...item, title: c.title || (item.type === "compare" ? "Compare sheets" : "Image"), dom: true, family: item.type === "compare" ? "other" : "media" }, hidden: !!c.hidden });
        continue;
      }
      const t = app().tableById(item.tableId);
      if (!t) continue;
      const spec = resolveSpec(t, item, cz.charts[item.id] || {}, F.view(t, s.filters), sec.id);
      if (!spec) continue;
      out.push({ t, spec, hidden: !!(cz.charts[item.id] || {}).hidden });
    }
    return { visible: out.filter((x) => !x.hidden), hidden: out.filter((x) => x.hidden) };
  }
  const idx = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? 1e6 : i; };

  // ---- KPIs from (deduplicated) Grand Totals ----
  function kpisFor(sheet) {
    const rc = sheet.reconcile;
    const cl = rc.clusters.slice().sort((a, b) =>
      b.tables.length - a.tables.length || DV.profiler.PLAN.test(b.label) - DV.profiler.PLAN.test(a.label) || b.value - a.value);
    const kpis = cl.map((c) => ({
      id: `kpi:${c.normKey}:${Math.round(c.value)}`, label: c.label, value: c.value, normKey: c.normKey, col: c.items[0].col,
      sub: c.tables.every((i) => sheet.tables[i].meta.virtual) ? `Sum of ${sheet.tables[c.tables[0]].meta.rowsSummed.toLocaleString("en-US")} rows` : c.tables.length > 1 ? `Same in ${c.tables.length} tables ✓` : `From ${sheet.tables[c.tables[0]].title}`,
      single: c.tables.length < 2,
      dupOfShared: c.tables.length < 2 && cl.some((o) => o !== c && o.normKey === c.normKey && o.tables.length >= 2),
    }));
    // Derived headline only when plan and actual totals come from a common table.
    const plan = cl.find((c) => DV.profiler.PLAN.test(c.label));
    const actual = cl.find((c) => c !== plan && /\beac\b|actual|spent|spend/i.test(c.label) && plan && c.tables.some((t) => plan.tables.includes(t)));
    let headline = null;
    if (plan && actual && plan.value) {
      const diff = actual.value - plan.value, pct = diff / plan.value * 100;
      headline = { actual: actual.label, plan: plan.label, diff, pct, over: diff > 0 };
      kpis.splice(Math.min(2, kpis.length), 0, {
        id: "kpi:variance", label: `${actual.label} vs ${plan.label}`, value: diff, signed: true, normKey: null,
        sub: `${diff > 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% ${diff > 0 ? "over" : "under"} ${plan.label.toLowerCase()}`, bad: diff > 0,
      });
    }
    return { kpis, headline };
  }

  function kpiRow(sheet) {
    const s = app().state, cz = s.customizations.kpis;
    if (cz.stripHidden) return s.editMode ? [h("button", { class: "btn", type: "button", onclick: () => app().commit((st) => { st.customizations.kpis.stripHidden = false; }) }, icon("plus"), "Show KPI strip")] : [];
    const { kpis, headline } = kpisFor(sheet);
    let list = kpis.filter((k) => !cz.hidden.includes(k.id));
    if (cz.order.length) list.sort((a, b) => idx(cz.order, a.id) - idx(cz.order, b.id));
    // Default: totals shared across tables (+ the variance headline); single-table totals
    // only when there are few shared ones. Everything else is available via "Add KPI".
    const shared = list.filter((k) => !k.single);
    const shown = cz.order.length ? list.filter((k) => cz.order.includes(k.id))
      : (shared.length >= 3 ? shared : shared.concat(list.filter((k) => k.single && !k.dupOfShared))).slice(0, 5);
    const focused = s.filters.measures && s.filters.measures.length === 1 ? s.filters.measures[0] : null;
    const cards = shown.map((k) => h("button", {
      class: "kpi fade-in", type: "button", "data-kpi": k.id, "aria-pressed": String(!!k.normKey && focused === k.normKey),
      title: k.normKey ? `${U.formatNumber(k.value, k.col.numberFormat).text}. Click to focus the dashboard on ${k.label}.` : "",
      onclick: () => { if (s.editMode || !k.normKey) return; app().commit((st) => { st.filters.measures = focused === k.normKey ? null : [k.normKey]; }); },
    },
    kpiIcon(k, s),
    h("span", { class: "label", text: k.label }),
    h("span", { class: "value" + (k.signed ? (k.bad ? " delta-bad" : " delta-good") : ""), text: k.signed ? U.formatSigned(k.value) : U.formatCompact(k.value) }),
    h("span", { class: "sub", text: k.sub }),
    s.editMode ? h("span", { class: "kpi-x", role: "button", tabindex: 0, "aria-label": "Hide KPI", title: "Hide KPI",
      onclick: (e) => { e.stopPropagation(); app().commit((st) => { st.customizations.kpis.hidden.push(k.id); }); } }, icon("close")) : null));
    const hiddenK = kpis.filter((k) => cz.hidden.includes(k.id) || !shown.includes(k));
    const add = s.editMode && hiddenK.length ? h("button", { class: "btn", type: "button", "data-pop": "addkpi", onclick: (e) => popover(e.currentTarget, [
      h("h4", { text: "Add KPI" }),
      ...hiddenK.map((k) => h("button", { class: "menu-item", type: "button", onclick: () => { DV.dom.closePopover(); app().commit((st) => {
        const z = st.customizations.kpis; z.hidden = z.hidden.filter((x) => x !== k.id);
        if (!z.order.length) z.order = shown.map((x) => x.id);
        if (!z.order.includes(k.id)) z.order.push(k.id); z.touched = true;
      }); } }, `${k.label} · ${U.formatCompact(k.value)}`))]) }, icon("plus"), "Add KPI") : null;
    const hideStrip = s.editMode ? h("button", { class: "btn ghost", type: "button", onclick: () => app().commit((st) => { st.customizations.kpis.stripHidden = true; }) }, icon("eyeOff"), "Hide KPI strip") : null;
    const line = headline ? h("p", { class: "headline" },
      h("strong", { text: headline.actual }), ` is `, h("strong", { class: headline.over ? "neg-red" : "", text: `${Math.abs(headline.pct).toFixed(1)}% ${headline.over ? "over" : "under"}` }),
      ` ${headline.plan} (${U.formatSigned(headline.diff)}).`) : null;
    return [h("div", { class: "kpis", "data-dnd": "kpis" }, cards, add, hideStrip), line];
  }

  // KPI strip icon: auto from the label unless the user picked one (or "none").
  function kpiIcon(k, s) {
    const chosen = ((s.customizations.kpis.icons || {})[k.id]);
    const name = chosen === "none" ? null : chosen || DV.icons.auto(k.label);
    const b = name ? DV.icons.badge(name) : s.editMode ? h("span", { class: "ico-badge", text: "+" }) : null;
    if (b && s.editMode) {
      b.setAttribute("role", "button"); b.setAttribute("tabindex", "0"); b.setAttribute("title", "Change icon");
      b.addEventListener("click", (e) => { e.stopPropagation(); DV.icons.picker(b, name, (n) => app().commit((st) => { st.customizations.kpis.icons = { ...(st.customizations.kpis.icons || {}), [k.id]: n || "none" }; })); });
    }
    return b;
  }

  // ---- Header: title, chips, reconcile badge, review pill ----
  function header(sheet) {
    const s = app().state, cz = s.customizations;
    const editable = (key, text, tag, cls) => h(tag, {
      class: cls, contenteditable: s.editMode ? "true" : null, spellcheck: "false", text,
      onblur: s.editMode ? (e) => { const v = e.target.textContent.trim(); app().commit((st) => { st.customizations[key] = v && v !== (key === "title" ? U.titleCase(sheet.title) : sheet.subtitle) ? v : null; }); } : null,
      onkeydown: (e) => { if (e.key === "Enter" && tag === "h1") { e.preventDefault(); e.target.blur(); } },
    });
    const rc = sheet.reconcile;
    const badge = rc.mismatches.length
      ? h("button", { class: "chip warn", type: "button", "data-pop": "recon", onclick: (e) => reconPopover(e.currentTarget, sheet) }, icon("warn"), `${rc.mismatches.length} total(s) don't add up`)
      : rc.shared.length ? h("button", { class: "chip ok clickable", type: "button", "data-pop": "recon", onclick: (e) => reconPopover(e.currentTarget, sheet) }, icon("check"), `Totals reconcile across ${rc.reconciledTables} tables`) : null;
    const low = sheet.lowConfidence.length;
    const pill = !app().state.workbook ? null : h("button", { class: "chip clickable" + (low ? " warn" : ""), type: "button", onclick: () => DV.review.open() },
      icon(low ? "warn" : "review"), `Detected ${sheet.detectedCount ?? sheet.tables.length} table${(sheet.detectedCount ?? sheet.tables.length) === 1 ? "" : "s"} · Review`);
    const logo = cz.logo ? DV.media.uriOf(cz.logo) : null;
    const logoTools = s.editMode ? h("span", { class: "logo-tools no-print" },
      h("button", { class: "btn ghost", type: "button", onclick: () => app().setLogo() }, icon("upload"), logo ? "Change logo" : "Add logo"),
      logo ? h("button", { class: "btn ghost", type: "button", onclick: () => app().commit((st) => { st.customizations.logo = null; }) }, icon("close"), "Remove logo") : null) : null;
    return h("header", { class: "dash-head" },
      h("div", { class: "title-row" }, logo ? h("img", { class: "dash-logo", src: logo, alt: "Logo" }) : null, editable("title", cz.title || U.titleCase(sheet.title), "h1"), logoTools),
      sheet.subtitle || s.editMode ? editable("subtitle", cz.subtitle || sheet.subtitle, "p", "subtitle") : null,
      h("div", { class: "chips" },
        sheet.params.map((p) => h("span", { class: "chip", tabindex: 0, title: "From the file as uploaded. This value isn't live: change it in Excel and upload again." }, `${p.label}: `, h("strong", { text: p.display }))),
        badge, pill,
        app().previewOnly() ? null : h("span", { class: "chip", title: "Summary mode: tables are already aggregated, so filters show/hide members and never recompute totals." }, sheet.mode === "flat" ? "Flat table" : "Summary mode"),
        sheet.warnings.map((w) => h("span", { class: "chip warn", text: w }))),
      low ? h("div", { class: "banner-warn", role: "status" }, icon("warn"),
        `Please check the detected structure: ${low} table${low > 1 ? "s were" : " was"} detected with low confidence.`,
        h("button", { class: "btn", type: "button", onclick: () => DV.review.open() }, "Review structure")) : null);
  }

  function reconPopover(anchor, sheet) {
    const rc = sheet.reconcile, f = (v) => U.formatNumber(v, "#,##0.00").text;
    popover(anchor, [
      h("h4", { text: "Totals check" }),
      ...rc.internal.map((x) => h("div", { class: "menu-field" }, h("strong", { text: x.title }),
        x.checks.length ? `${x.checks.filter((c) => c.ok).length} of ${x.checks.length} columns: rows add up to the Grand Total` : "No Grand Total row")),
      ...rc.mismatches.map((m) => h("div", { class: "menu-field neg-red", text: `${m.title}: ${m.measure} rows sum to ${f(m.bodySum)}, but the Grand Total says ${f(m.grand)}` })),
      rc.shared.length ? h("div", { class: "menu-sep" }) : null,
      ...rc.shared.map((c) => h("div", { class: "menu-field", text: `${c.label} = ${f(c.value)} in ${c.tables.map((i) => sheet.tables[i].title).join(", ")}` })),
      ...rc.differs.map((d) => h("div", { class: "menu-field muted", text: `Note: ${d.label} in ${sheet.tables[d.table].title} is ${f(d.value)}, a different total (likely a different scope or period).` })),
    ], { label: "Totals check" });
  }

  // ---- Filter bar ----
  function filterBar(sheet) {
    const s = app().state, f = s.filters;
    const tables = sheet.tables.filter((t) => !t.hidden);
    const allMeasures = [...new Map(tables.flatMap((t) => t.columns.filter((c) => c.role === "measure").map((c) => [U.normKey(c.label), c.label]))).entries()];
    const anyVariance = tables.some((t) => t.profile.variance.length);
    const seg = (label, value, opts, set) => h("div", { class: "field" }, label,
      h("div", { class: "seg", role: "group", "aria-label": label }, opts.map(([v, l]) => h("button", { type: "button", "aria-pressed": String(value === v), onclick: () => set(v) }, l))));
    const search = h("input", { type: "search", placeholder: "Search labels…", value: f.search, "data-fk": "search", "aria-label": "Search all tables' labels",
      oninput: debounce((e) => app().commit((st) => { st.filters.search = e.target.value; }, { history: false }), 180) });
    const measureBtn = h("button", { class: "btn", type: "button", "data-pop": "measures", onclick: (e) => popover(e.currentTarget, [
      h("h4", { text: "Measures shown" }),
      ...allMeasures.map(([k, label]) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: !f.measures || f.measures.includes(k),
        onchange: () => { app().commit((st) => { st.filters = F.toggleMeasure(st.filters, k, allMeasures.map((m) => m[0])); }); app().reopen("measures"); } }), label)),
    ], { label: "Measures" }) }, icon("filter"), `Measures (${f.measures ? f.measures.length : allMeasures.length}/${allMeasures.length})`);
    const dims = F.sharedDimensions(tables).map((d) => membersButton(`${d.label} (all tables)`, d.key, [...d.members.values()]));
    const chips = F.describe(f, tables);
    const shown = tables.reduce((a, t) => a + F.view(t, f).rows.length, 0), total = tables.reduce((a, t) => a + t.rows.length, 0);
    return h("section", { class: "filterbar no-print", "aria-label": "Filters" },
      h("div", { class: "filter-row" },
        h("label", { class: "field" }, icon("search"), search),
        seg("Sort", f.sort, [["value", "Value"], ["label", "Label"], ...(anyVariance ? [["variance", "Variance"]] : []), ["original", "Excel order"]], (v) => app().commit((st) => { st.filters.sort = v; })),
        anyVariance ? seg("Show", f.variance, [["all", "All"], ["over", "Over budget"], ["under", "Under budget"]], (v) => app().commit((st) => { st.filters.variance = v; })) : null,
        measureBtn, dims),
      h("div", { class: "filter-row" },
        h("span", { class: "readout", role: "status", text: `Showing ${shown} of ${total} members` }),
        chips.map((c) => h("span", { class: "chip" }, c.label, h("button", { type: "button", "aria-label": `Remove filter ${c.label}`, onclick: () => app().commit((st) => { st.filters = c.remove(st.filters); }) }, icon("close")))),
        chips.length ? h("button", { class: "btn ghost", type: "button", onclick: () => app().commit((st) => { st.filters = F.empty(); st.selection.highlight = null; }) }, "Clear all") : null,
        s.selection.highlight ? h("span", { class: "chip" }, `Highlight: ${s.selection.highlightLabel || s.selection.highlight}`, h("button", { type: "button", "aria-label": "Clear highlight", onclick: () => app().highlight(null) }, icon("close"))) : null));
  }

  function membersButton(label, scope, labels, table) {
    const s = app().state;
    const sel = s.filters.members[scope];
    const text = sel ? `${label}: ${sel.length}/${labels.length}` : label;
    return h("button", { class: "btn" + (sel ? " active" : ""), type: "button", "data-pop": "members:" + scope, onclick: (e) => {
      const st = app().state;
      const cur = st.filters.members[scope];
      const q = st.ui.memberSearch[scope] || "";
      const list = labels.filter((l) => l.toLowerCase().includes(q.toLowerCase()));
      popover(e.currentTarget, [
        h("h4", { text: label }),
        h("input", { class: "input", type: "search", placeholder: "Find…", value: q, "aria-label": "Find members", style: { width: "100%" },
          oninput: debounce((ev) => { st.ui.memberSearch[scope] = ev.target.value; app().render(); app().reopen("members:" + scope); }, 200) }),
        h("div", { class: "member-list" }, list.map((l) => h("label", { class: "check" },
          h("input", { type: "checkbox", checked: !cur || cur.some((x) => F.memberKey(x) === F.memberKey(l)), onchange: () => { app().commit((x) => { x.filters = F.toggleMember(x.filters, scope, l, labels); }); app().reopen("members:" + scope); } }), l))),
        h("div", { class: "filter-row" },
          h("button", { class: "btn", type: "button", onclick: () => { app().commit((x) => { x.filters = F.setMembers(x.filters, scope, null); }); app().reopen("members:" + scope); } }, "All"),
          h("button", { class: "btn", type: "button", onclick: () => { app().commit((x) => { x.filters = F.setMembers(x.filters, scope, []); }); app().reopen("members:" + scope); } }, "None")),
        table ? h("label", { class: "menu-field" }, `Minimum ${R.colLabel(table, table.profile.primary)}`,
          h("input", { type: "number", value: st.filters.minValue[table.id] ?? "", onchange: (ev) => app().commit((x) => { x.filters = F.setMin(x.filters, table.id, ev.target.value === "" ? null : +ev.target.value); }) })) : null,
      ], { label });
    } }, icon("filter"), text);
  }

  // ---- Section per table ----
  function section(sec, layout, opts = {}) {
    const s = app().state;
    const { visible, hidden } = itemsOf(sec);
    const canEdit = app().canEdit();
    const page = DV.page.list(s.customizations);
    const pos = page.findIndex((x) => x.id === sec.id);
    const tablesHere = [...new Set(visible.map((x) => x.t).filter(Boolean))];
    // A one-table section gets that table's auto insight unless the user wrote a note.
    const note = sec.note || (tablesHere.length === 1 ? R.insight(tablesHere[0], F.view(tablesHere[0], s.filters)) : "");
    const setSec = (fn) => app().commit((st) => { const x = DV.page.list(st.customizations).find((y) => y.id === sec.id); if (x) fn(x, st); });
    const pageTables = s.sheets.flatMap((sh) => sh.tables);
    const multiSheet = s.sheets.length > 1;
    const cards = visible.map(({ t, spec }, i) => {
      const card = DV.cards.itemCard(t, spec, { section: sec, index: i, layout, caption: t && (tablesHere.length > 1 || multiSheet) ? (multiSheet ? t.sheet + " › " : "") + t.title : null });
      const un = t ? F.view(t, s.filters).unaffected : [];
      if (un.length && card.querySelector) {
        const head = card.querySelector(".card-head");
        const names = un.map((x) => F.scopeLabel(x, pageTables)).join(", ");
        if (head) head.appendChild(h("span", { class: "nf-chip", title: `This table has no ${names} field, so that filter doesn't apply here.` }, `Not filtered by ${names}`));
      }
      return card;
    });
    const tools = canEdit ? [
      h("button", { class: "btn", type: "button", onclick: () => app().openGallery(sec.id) }, icon("plus"), "Add charts"),
      h("button", { class: "btn", type: "button", onclick: () => app().openGallery(sec.id, "kpi") }, icon("plus"), "Add KPI"),
      h("button", { class: "btn", type: "button", onclick: () => app().openGallery(sec.id, "filters") }, icon("filter"), "Add filter"),
      h("button", { class: "btn", type: "button", onclick: () => app().addImage(sec.id) }, icon("upload"), "Add image"),
    ] : [];
    const editTools = s.editMode ? [
      iconBtn("left", "Move section up", () => app().moveSection(sec.id, -1), { attrs: { disabled: pos <= 0, style: "transform:rotate(90deg)" } }),
      iconBtn("right", "Move section down", () => app().moveSection(sec.id, 1), { attrs: { disabled: pos >= page.length - 1, style: "transform:rotate(90deg)" } }),
      h("button", { class: "btn", type: "button", onclick: (e) => DV.icons.picker(e.currentTarget, sec.icon, (n) => setSec((x) => { x.icon = n || undefined; })) }, icon("star"), "Icon"),
      h("button", { class: "btn", type: "button", "data-pop": "secbg:" + sec.id, onclick: (e) => popover(e.currentTarget, [h("h4", { text: "Section background" }),
        DV.media.backgroundControls(sec.bg, (bg) => { DV.dom.closePopover(); setSec((x) => { x.bg = bg || undefined; }); })], { label: "Section background" }) }, icon("open"), "Background"),
      h("button", { class: "btn", type: "button", onclick: () => app().deleteSection(sec.id) }, icon("close"), "Delete section"),
    ] : [];
    const secEl = h("section", { class: "section fade-in", "data-section": sec.id, style: opts.style || null, "aria-label": sec.title },
      h("div", { class: "section-head" },
        h("div", null,
          h("h2", null, sec.icon ? DV.icons.node(sec.icon, "ico-inline") : null, h("span", { contenteditable: s.editMode ? "true" : null, text: sec.title,
            onblur: s.editMode ? (e) => { const v = e.target.textContent.trim(); if (v && v !== sec.title) setSec((x) => { x.title = v; }); } : null,
            onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } } })),
          note || s.editMode ? h("p", { class: "insight", contenteditable: s.editMode ? "true" : null, text: note || "Add a note…",
            onblur: s.editMode ? (e) => { const v = e.target.textContent.trim(); setSec((x) => { x.note = v === "Add a note…" ? "" : v; }); } : null }) : null),
        tools.length || editTools.length ? h("div", { class: "tools no-print" }, tools, editTools) : null),
      h("div", { class: "cards", "data-dnd": sec.id }, cards.length ? cards
        : h("div", { class: "empty-note" }, "This section is empty. ", canEdit ? h("button", { class: "btn primary", type: "button", onclick: () => app().openGallery(sec.id) }, icon("plus"), "Add charts") : null)),
      s.editMode && hidden.length ? h("div", { class: "more-row no-print" },
        hidden.map(({ spec }) => h("button", { class: "btn ghost", type: "button", onclick: () => app().commit((st) => { delete st.customizations.charts[spec.id].hidden; }) }, icon("eyeOff"), `Restore "${spec.title}"`))) : null);
    DV.media.applyBackground(secEl, sec.bg);
    return secEl;
  }

  function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }

  DV.dashboard = { itemsOf, kpisFor, kpiRow, header, filterBar, section, membersButton, resolveSpec };
})();
