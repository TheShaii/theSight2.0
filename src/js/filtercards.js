/* Filter "charts": controls you can place on the dashboard like any chart (filter pane,
   dropdown, buttons, range, date range, value range). They write state.filters, so every
   chart and table for that table updates; like all summary-mode filters they only show or
   hide members and never recompute totals. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, iconBtn } = DV.dom;
  const U = DV.utils, F = DV.filters, R = DV.recommender;
  const app = () => DV.app;
  // Field scopes: a filter on "Scope" filters every table on the page that has a Scope column.
  const scope = (t) => F.dimKey(t);
  const vscope = (t, key) => F.measureKeyOf((t.columns.find((c) => c.key === key) || { label: key }).label);
  const setF = (fn) => app().commit((st) => { st.filters = fn(st.filters); });
  const plural = (t) => U.pluralize(t.dimensionLabels[0] || "member", 2).toLowerCase();

  // Two overlapping range inputs; commits on release so dragging stays smooth.
  function dualRange({ min, max, step, lo, hi, fmt, onCommit, label }) {
    const pct = (v) => (max > min ? ((v - min) / (max - min)) * 100 : 0);
    const out = h("div", { class: "dual-vals" }, h("span", { text: fmt(lo) }), h("span", { text: fmt(hi) }));
    const a = h("input", { type: "range", min, max, step, value: lo, "aria-label": `${label}: minimum` });
    const b = h("input", { type: "range", min, max, step, value: hi, "aria-label": `${label}: maximum` });
    const wrap = h("div", { class: "dual" }, a, b);
    const paint = () => {
      let x = +a.value, y = +b.value;
      if (x > y) { if (document.activeElement === a) a.value = x = y; else b.value = y = x; }
      wrap.style.setProperty("--a", pct(x) + "%");
      wrap.style.setProperty("--b", pct(y) + "%");
      out.firstChild.textContent = fmt(x);
      out.lastChild.textContent = fmt(y);
    };
    a.addEventListener("input", paint); b.addEventListener("input", paint);
    const commit = () => onCommit(+a.value, +b.value);
    a.addEventListener("change", commit); b.addEventListener("change", commit);
    paint();
    return h("div", { class: "dual-wrap" }, wrap, out);
  }

  function valueRangeControl(t, key, filters) {
    const vals = t.rows.map((r) => r.values[key]).filter((v) => v != null);
    if (!vals.length) return h("div", { class: "muted small", text: "No values." });
    const min = Math.floor(Math.min(...vals)), max = Math.ceil(Math.max(...vals));
    const cur = (filters.valueRange || {})[vscope(t, key)];
    const on = !!cur;
    const step = Math.max((max - min) / 200, 0.01);
    return dualRange({
      min, max, step, lo: on && cur.min != null ? cur.min : min, hi: on && cur.max != null ? cur.max : max, label: R.colLabel(t, key),
      fmt: (v) => U.formatCompact(v),
      // Reaching both ends again means "no filter".
      onCommit: (x, y) => setF((f) => F.setValueRange(f, vscope(t, key), x <= min && y >= max ? null : { key, min: x <= min ? null : x, max: y >= max ? null : y })),
    });
  }

  function memberSelect(t, filters) {
    const sel = filters.members[scope(t)];
    const labels = F.memberOrder(t);
    const value = sel && sel.length === 1 ? sel[0] : sel ? "__many" : "";
    return h("select", { class: "input", "aria-label": `Choose ${t.dimensionLabels[0] || "member"}`,
      onchange: (e) => setF((f) => F.setMembers(f, scope(t), e.target.value ? [e.target.value] : null)) },
      h("option", { value: "", selected: value === "" }, `All ${plural(t)} (${labels.length})`),
      sel && sel.length > 1 ? h("option", { value: "__many", selected: true, disabled: true }, `${sel.length} selected`) : null,
      labels.map((l) => h("option", { value: l, selected: value === l }, l)));
  }

  // Slicer-style buttons: the first click focuses one member, later clicks add/remove.
  function buttonsControl(t, filters) {
    const sel = filters.members[scope(t)];
    const set = new Set((sel || []).map(F.memberKey));
    const labels = F.memberOrder(t);
    return h("div", { class: "fbtns", role: "group", "aria-label": t.dimensionLabels[0] || "Members" },
      h("button", { type: "button", class: "fbtn", "aria-pressed": String(!sel), onclick: () => setF((f) => F.setMembers(f, scope(t), null)) }, "All"),
      labels.map((l) => h("button", { type: "button", class: "fbtn", "aria-pressed": String(!!sel && set.has(F.memberKey(l))),
        onclick: () => setF((f) => {
          const cur = f.members[scope(t)];
          if (!cur) return F.setMembers(f, scope(t), [l]);
          const next = F.toggleMember(f, scope(t), l, labels);
          return next.members[scope(t)] && !next.members[scope(t)].length ? F.setMembers(next, scope(t), null) : next;
        }) }, l)));
  }

  function rangeControl(t, filters) {
    const labels = F.memberOrder(t);
    const cur = (filters.range || {})[scope(t)];
    const lo = cur && cur.from != null ? labels.indexOf(cur.from) : 0;
    const hi = cur && cur.to != null ? labels.indexOf(cur.to) : labels.length - 1;
    const commit = (x, y) => setF((f) => F.setRange(f, scope(t), x <= 0 && y >= labels.length - 1 ? null : { from: labels[x], to: labels[y] }));
    const sel = (which, idx) => h("select", { class: "input", "aria-label": which, onchange: (e) => (which === "From" ? commit(+e.target.value, hi) : commit(lo, +e.target.value)) },
      labels.map((l, i) => h("option", { value: i, selected: i === idx }, l)));
    return h("div", { class: "frange" },
      h("div", { class: "filter-row" }, h("label", { class: "field" }, "From", sel("From", lo)), h("label", { class: "field" }, "To", sel("To", hi))),
      dualRange({ min: 0, max: labels.length - 1, step: 1, lo, hi, label: t.dimensionLabels[0] || "Range", fmt: (i) => labels[Math.round(i)], onCommit: commit }));
  }

  function dateRangeControl(t, filters) {
    const ds = t.rows.map((r) => F.dateOf(r.label)).filter((d) => d != null);
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
    const min = Math.min(...ds), max = Math.max(...ds);
    const cur = (filters.range || {})[scope(t)];
    const from = cur && cur.dates && cur.from != null ? cur.from : min, to = cur && cur.dates && cur.to != null ? cur.to : max;
    const commit = (a, b) => setF((f) => F.setRange(f, scope(t), a <= min && b >= max ? null : { dates: true, from: a <= min ? null : a, to: b >= max ? null : b }));
    const parse = (v) => (v ? Date.parse(v + "T00:00:00Z") : null);
    return h("div", { class: "filter-row" },
      h("label", { class: "field" }, "From", h("input", { type: "date", class: "input", value: iso(from), min: iso(min), max: iso(max), onchange: (e) => commit(parse(e.target.value) ?? min, to) })),
      h("label", { class: "field" }, "To", h("input", { type: "date", class: "input", value: iso(to), min: iso(min), max: iso(max), onchange: (e) => commit(from, parse(e.target.value) ?? max) })));
  }

  function paneControl(t, spec, filters, s) {
    const q = (s.ui.memberSearch["pane:" + t.id] || "").toLowerCase();
    const labels = F.memberOrder(t);
    const sel = filters.members[scope(t)];
    const selSet = new Set((sel || []).map(F.memberKey));
    const vi = F.varianceInfo(t);
    const tn = filters.topN[scope(t)];
    return h("div", { class: "fpane" },
      h("input", { class: "input", type: "search", placeholder: `Find ${plural(t)}…`, value: q, "data-fk": "pane:" + t.id, "aria-label": `Find ${plural(t)}`,
        oninput: (e) => { s.ui.memberSearch["pane:" + t.id] = e.target.value; app().render(); } }),
      h("div", { class: "member-list" }, labels.filter((l) => !q || l.toLowerCase().includes(q)).map((l) => h("label", { class: "check" },
        h("input", { type: "checkbox", checked: !sel || selSet.has(F.memberKey(l)), onchange: () => setF((f) => F.toggleMember(f, scope(t), l, labels)) }), l))),
      spec.measure ? h("div", { class: "menu-field" }, R.colLabel(t, spec.measure), valueRangeControl(t, spec.measure, filters)) : null,
      h("div", { class: "filter-row" },
        h("select", { class: "input", "aria-label": "Top or bottom", onchange: (e) => { const [dir, n] = e.target.value.split(":"); setF((f) => F.setTopN(f, scope(t), n ? { dir, n: +n } : null)); } },
          [["", "All members"], ["top:3", "Top 3"], ["top:5", "Top 5"], ["top:10", "Top 10"], ["bottom:3", "Bottom 3"], ["bottom:5", "Bottom 5"]]
            .map(([v, l]) => h("option", { value: v, selected: tn ? v === `${tn.dir}:${tn.n}` : v === "" }, l))),
        vi ? h("div", { class: "seg", role: "group", "aria-label": "Budget status" }, [["all", "All"], ["over", "Over"], ["under", "Under"]].map(([v, l]) =>
          h("button", { type: "button", "aria-pressed": String(filters.variance === v), onclick: () => app().commit((st) => { st.filters.variance = v; }) }, l))) : null));
  }

  // ---- Button bar: buttons the user defines (label, icon, action) ----
  const ACTIONS = [["measure", "Show column"], ["members", "Filter to member"], ["topn", "Top N"], ["variance", "Over / under budget"], ["clear", "Clear filters"]];

  function defaultButtons(t, spec) {
    if (spec.variant !== "measures") return [];
    return R.baseMeasures(t).slice(0, 6).map((c) => ({ label: c.label, icon: DV.icons.auto(c.label), action: "measure", value: U.normKey(c.label), table: t.id }));
  }
  const allTables = () => DV.app.state.sheets.flatMap((sh) => sh.tables);
  function measureChoices() {
    const m = new Map();
    for (const t of allTables()) for (const c of R.baseMeasures(t)) if (!m.has(U.normKey(c.label))) m.set(U.normKey(c.label), c.label);
    return [...m.entries()];
  }

  const bscope = (b) => { const tt = allTables().find((x) => x.id === b.table); return tt ? F.dimKey(tt) : b.table; };
  function isActive(b, scope, filters) {
    const tab = (id) => allTables().find((x) => x.id === id);
    switch (b.action) {
      case "measure": { const cur = (filters.sectionMeasure || {})[scope]; return !!cur && cur.key === b.value; }
      case "members": { const cur = filters.members[bscope(b)]; return !!cur && cur.length === 1 && F.memberKey(cur[0]) === F.memberKey(b.value || ""); }
      case "topn": { const cur = filters.topN[bscope(b)]; return !!cur && cur.n === +b.value && cur.dir === "top"; }
      case "variance": return filters.variance === b.value;
      default: return false && tab;
    }
  }
  // Clicking an active button switches it off again.
  function press(b, scope, active) {
    setF((f) => {
      switch (b.action) {
        case "measure": return F.setSectionMeasure(f, scope, active ? null : { key: b.value, label: b.label });
        case "members": return F.setMembers(f, bscope(b), active || !b.value ? null : [b.value]);
        case "topn": return F.setTopN(f, bscope(b), active ? null : { dir: "top", n: +b.value || 5 });
        case "variance": return { ...f, variance: active ? "all" : b.value };
        default: return F.empty();
      }
    });
  }

  function buttonBarControl(t, spec, opts, s) {
    const c = s.customizations.charts[spec.id] || {};
    const buttons = c.buttons || defaultButtons(t, spec);
    const scope = c.scope === "section" && opts.section ? opts.section.id : "*";
    if (!buttons.length) return h("div", { class: "muted small" }, "No buttons yet. ", app().canEdit() && !opts.preview ? h("button", { class: "btn", type: "button", onclick: () => setupButtons(t, spec) }, icon("edit"), "Set up buttons") : null);
    return h("div", { class: "fbtns bbar", role: "group", "aria-label": c.title || spec.title },
      buttons.map((b) => {
        const on = isActive(b, scope, s.filters);
        return h("button", { type: "button", class: "fbtn", "aria-pressed": String(on), onclick: () => press(b, scope, on) },
          b.icon ? DV.icons.node(b.icon) : null, b.label || "Button");
      }));
  }

  function setupButtons(t, spec) {
    const st = app().state;
    const c = st.customizations.charts[spec.id] || {};
    let rows = (c.buttons || defaultButtons(t, spec)).map((b) => ({ ...b }));
    let scope = c.scope || "all";
    const tables = allTables();
    const body = h("div", { class: "bb-setup" });
    const valueField = (b) => {
      if (b.action === "measure") return h("select", { class: "input", "aria-label": "Column", onchange: (e) => { b.value = e.target.value; if (!b.label || b.auto) { b.label = e.target.selectedOptions[0].textContent; b.auto = true; } draw(); } },
        h("option", { value: "" }, "Choose column…"), measureChoices().map(([k, l]) => h("option", { value: k, selected: b.value === k }, l)));
      if (b.action === "members") {
        const tt = tables.find((x) => x.id === b.table) || tables[0];
        return h("select", { class: "input", "aria-label": "Member", onchange: (e) => { b.value = e.target.value; if (!b.label || b.auto) { b.label = e.target.value; b.auto = true; } draw(); } },
          h("option", { value: "" }, "Choose member…"), F.memberOrder(tt).map((m) => h("option", { value: m, selected: b.value === m }, m)));
      }
      if (b.action === "topn") return h("select", { class: "input", "aria-label": "N", onchange: (e) => { b.value = e.target.value; draw(); } }, [3, 5, 10].map((n) => h("option", { value: n, selected: +b.value === n }, "Top " + n)));
      if (b.action === "variance") return h("select", { class: "input", "aria-label": "Which", onchange: (e) => { b.value = e.target.value; draw(); } }, [["over", "Over budget"], ["under", "Under budget"]].map(([v, l]) => h("option", { value: v, selected: b.value === v }, l)));
      return h("span", { class: "muted small", text: "Resets every filter" });
    };
    const draw = () => {
      DV.dom.clear(body);
      body.appendChild(h("label", { class: "field" }, '"Show column" applies to', h("select", { class: "input", onchange: (e) => { scope = e.target.value; } },
        h("option", { value: "all", selected: scope !== "section" }, "Whole page"), h("option", { value: "section", selected: scope === "section" }, "This section only"))));
      rows.forEach((b, i) => {
        body.appendChild(h("div", { class: "bb-row" },
          h("span", { class: "muted small", text: `Button ${i + 1}` }),
          h("input", { class: "input", type: "text", value: b.label || "", placeholder: "Label", "aria-label": `Button ${i + 1} label`, oninput: (e) => { b.label = e.target.value; b.auto = false; } }),
          h("button", { class: "btn", type: "button", title: "Icon", onclick: (e) => DV.icons.picker(e.currentTarget, b.icon, (n) => { b.icon = n || undefined; draw(); }) }, b.icon ? DV.icons.node(b.icon) : icon("star"), "Icon"),
          h("select", { class: "input", "aria-label": "Action", onchange: (e) => { b.action = e.target.value; b.value = b.action === "topn" ? "5" : b.action === "variance" ? "over" : ""; draw(); } },
            ACTIONS.map(([v, l]) => h("option", { value: v, selected: b.action === v }, l))),
          ["members", "topn"].includes(b.action) ? h("select", { class: "input", "aria-label": "Table", onchange: (e) => { b.table = e.target.value; b.value = b.action === "topn" ? b.value : ""; draw(); } },
            tables.map((x) => h("option", { value: x.id, selected: (b.table || tables[0].id) === x.id }, x.title))) : null,
          valueField(b),
          iconBtn("close", `Remove button ${i + 1}`, () => { rows.splice(i, 1); draw(); })));
        if (!b.table) b.table = t.id;
      });
      body.appendChild(h("div", { class: "filter-row" },
        h("button", { class: "btn", type: "button", onclick: () => { rows.push({ label: "", action: "measure", value: "", table: t.id }); draw(); } }, icon("plus"), "Add button"),
        h("span", { style: { flex: "1" } }),
        h("button", { class: "btn", type: "button", onclick: () => m.close() }, "Cancel"),
        h("button", { class: "btn primary", type: "button", onclick: () => {
          const clean = rows.filter((b) => b.action === "clear" || b.value).map(({ auto, ...b }) => b);
          m.close();
          app().commit((x) => { x.customizations.charts[spec.id] = { ...(x.customizations.charts[spec.id] || {}), buttons: clean, scope }; });
        } }, icon("check"), "Save buttons")));
    };
    const m = DV.dom.modal("Set up buttons", body, { wide: true });
    draw();
  }

  function card(t, spec, opts = {}) {
    const s = app().state, filters = s.filters;
    const c = s.customizations.charts[spec.id] || {};
    const view = F.view(t, filters);
    let body;
    switch (spec.type) {
      case "dropdown": body = h("div", { class: "filter-row" }, memberSelect(t, filters), opts.preview ? null : DV.dashboard.membersButton("Pick several", scope(t), F.memberOrder(t), t)); break;
      case "buttons": body = buttonsControl(t, filters); break;
      case "range": body = rangeControl(t, filters); break;
      case "dateRange": body = dateRangeControl(t, filters); break;
      case "valueRange": body = valueRangeControl(t, spec.measure, filters); break;
      case "buttonBar": body = buttonBarControl(t, spec, opts, s); break;
      default: body = paneControl(t, spec, filters, s);
    }
    const editable = !opts.preview && s.editMode;
    const share = view.isFiltered && view.share != null ? ` · ${(view.share * 100).toFixed(1)}% of ${t.totals.grandLabel || "Grand Total"}` : "";
    const card = h("article", { class: "card filter-card fade-in", "data-chart": opts.preview ? null : spec.id, "data-table": t.id, tabindex: editable ? 0 : null },
      h("div", { class: "card-head" },
        editable ? h("span", { class: "muted" }, icon("grip")) : null,
        h("h3", null, c.icon ? DV.icons.node(c.icon, "ico-inline") : icon("filter"), " ", c.title || spec.title, h("span", { class: "caption", text: t.title })),
        spec.type === "buttonBar" && app().canEdit() && !opts.preview ? iconBtn("edit", "Set up buttons", () => setupButtons(t, spec)) : null,
        view.isFiltered && !opts.preview && spec.type !== "buttonBar" ? h("button", { class: "btn ghost", type: "button", onclick: () => setF((f) => F.clearTable(f, t)) }, "Clear") : null),
      body,
      spec.type === "buttonBar" ? null : h("div", { class: "readout", role: "status", text: `Showing ${view.rows.length} of ${t.rows.length} ${plural(t)}${share}` }),
      editable ? DV.cards.editBar(t, spec) : null);
    return DV.cards.sized(card, spec, opts);
  }

  DV.filterCards = { card, dualRange };
})();
