/* "Detected structure" review screen: the sheet grid with each detected table outlined,
   plus one-click fixes. Fixes are stored as overrides and re-run detection; the grid is never edited. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, modal, clear } = DV.dom;
  const U = DV.utils, G = DV.grid;
  const MAX_R = 400, MAX_C = 52;
  let current = null; // { m, sel }
  const app = () => DV.app;

  function open() {
    if (current || !app().state.workbook) return; // exported viewer files have no raw grid
    const body = h("div");
    const st = app().state;
    const sheetSel = st.sheets.length > 1 ? h("select", { class: "input", "aria-label": "Sheet to review", onchange: (e) => { st.activeSheet = +e.target.value; refresh(); } },
      st.sheets.map((sh, i) => h("option", { value: i, selected: i === st.activeSheet }, "Sheet: " + sh.name))) : null;
    const m = modal("Detected structure", body, { wide: true, onClose: () => { current = null; app().render(); },
      actions: [sheetSel, h("button", { class: "btn", type: "button", onclick: () => edit((ov) => { for (const k of Object.keys(ov)) delete ov[k]; }) }, icon("reset"), "Reset all fixes")] });
    current = { m, sel: null };
    refresh();
  }
  const close = () => current && current.m.close();

  function sheetOv(st) {
    const name = st.sheets[st.activeSheet].name;
    st.overrides[name] = st.overrides[name] || {};
    const ov = st.overrides[name];
    ov.blocks = ov.blocks || {};
    return ov;
  }
  // Every fix goes through history and re-runs detection for this sheet.
  const edit = (fn) => app().commit((st) => fn(sheetOv(st)), { reanalyze: true });
  const editBlock = (id, fn) => edit((ov) => { ov.blocks[id] = ov.blocks[id] || {}; fn(ov.blocks[id]); if (!Object.keys(ov.blocks[id]).length) delete ov.blocks[id]; });

  function refresh() {
    if (!current) return;
    const s = app().state, sheet = s.sheets[s.activeSheet];
    const body = current.m.body;
    const keepScroll = body.querySelector(".review-grid-wrap");
    const scroll = keepScroll ? [keepScroll.scrollLeft, keepScroll.scrollTop] : [0, 0];
    clear(body);
    const colorOf = (i) => `var(--series-${(i % 8) + 1})`;
    const tables = sheet.tables;
    const roles = new Map(); // "r,c" -> class
    tables.forEach((t) => {
      const cols = t.columns.map((c) => c.c);
      for (const hr of t.meta.headerRows) for (const c of cols) roles.set(`${hr - 1},${c}`, "t-header");
      for (const tr of t.meta.totalRows) for (const c of cols) roles.set(`${tr.row - 1},${c}`, "t-total");
    });
    for (const tc of sheet.titleCells || []) roles.set(`${tc.r},${tc.c}`, "t-title");

    const g = sheet.grid, rows = Math.min(g.rows, MAX_R), cols = Math.min(g.cols, MAX_C);
    const sel = current.sel;
    const inSel = (r, c) => sel && r >= sel.r0 && r <= sel.r1 && c >= sel.c0 && c <= sel.c1;
    let dragFrom = null;
    const table = h("table", { class: "sheet", "aria-label": `Sheet ${sheet.name}` },
      h("thead", null, h("tr", null, h("th", { class: "rowh" }), Array.from({ length: cols }, (_, c) => h("th", { text: U.colName(c) })))),
      h("tbody", null, Array.from({ length: rows }, (_, r) => h("tr", null,
        h("th", { class: "rowh", text: String(r + 1) }),
        Array.from({ length: cols }, (_, c) => {
          const cell = G.cellAt(g, r, c);
          const text = cell && cell.kind !== "merged" ? (cell.kind === "num" ? U.formatNumber(cell.num, cell.z).text : cell.text) : "";
          const td = h("td", { class: [cell && cell.kind === "num" ? "num" : "", roles.get(`${r},${c}`) || "", inSel(r, c) ? "sel" : ""].join(" ").trim() || null, text, title: text || null, "data-r": r, "data-c": c });
          if (cell && cell.merge) td.colSpan = Math.min(cell.merge.c1, cols - 1) - c + 1;
          return cell && cell.kind === "merged" && cell.mergedInto.r0 === r ? null : td;
        })))));
    table.addEventListener("mousedown", (e) => { const td = e.target.closest("td"); if (!td) return; dragFrom = [+td.dataset.r, +td.dataset.c]; setSel(dragFrom, dragFrom, table); e.preventDefault(); });
    table.addEventListener("mouseover", (e) => { const td = e.target.closest("td"); if (dragFrom && td) setSel(dragFrom, [+td.dataset.r, +td.dataset.c], table); });
    window.addEventListener("mouseup", function up() { if (dragFrom) { dragFrom = null; refreshSide(); } window.removeEventListener("mouseup", up); });

    const layer = h("div", { "aria-hidden": "true" });
    const wrap = h("div", { class: "review-grid-wrap" }, table, layer);
    const side = h("div", { class: "review-side" });
    body.appendChild(h("p", { class: "muted small" }, "Each detected table is outlined in its own color. Bold rows are headers, shaded rows are totals (never charted). Drag across cells to select a range that was missed, then use the panel on the right."));
    body.appendChild(h("div", { class: "review" }, wrap, side));
    wrap.scrollLeft = scroll[0]; wrap.scrollTop = scroll[1];

    requestAnimationFrame(() => {
      const td = (r, c) => table.querySelector(`td[data-r="${r}"][data-c="${c}"]`) || table.querySelector(`td[data-r="${r}"]`);
      const box = (r0, c0, r1, c1) => {
        const a = td(r0, c0), b = td(Math.min(r1, rows - 1), Math.min(c1, cols - 1));
        if (!a || !b) return null;
        return { left: table.offsetLeft + a.offsetLeft, top: table.offsetTop + a.offsetTop, width: b.offsetLeft + b.offsetWidth - a.offsetLeft, height: b.offsetTop + b.offsetHeight - a.offsetTop };
      };
      tables.forEach((t, i) => {
        const bb = t.meta.bbox, p = box(bb.r0, bb.c0, bb.r1, bb.c1);
        if (!p) return;
        layer.appendChild(h("div", { class: "rv-outline", vars: { "--c": colorOf(i) }, style: { left: p.left + "px", top: p.top + "px", width: p.width + "px", height: p.height + "px" } },
          h("span", { text: `${i + 1}. ${t.title} · ${t.range}` })));
      });
      for (const pr of sheet.params) {
        const p = box(pr.r, pr.c, pr.r, pr.c);
        if (p) layer.appendChild(h("div", { class: "rv-tag", style: { left: p.left + "px", top: p.top - 12 + "px" }, text: "parameter" }));
      }
      for (const tc of sheet.titleCells || []) {
        const p = box(tc.r, tc.c, tc.r, tc.c);
        if (p) layer.appendChild(h("div", { class: "rv-tag", style: { left: p.left + p.width - 60 + "px", top: p.top + "px" }, text: "sheet title" }));
      }
    });

    function refreshSide() {
      clear(side);
      if (current.sel) side.appendChild(selectionCard(sheet, current.sel));
      tables.forEach((t, i) => side.appendChild(tableCard(sheet, t, i, colorOf(i))));
      for (const sk of sheet.skipped.filter((x) => x.reason === "notTable"))
        side.appendChild(h("div", { class: "rv-card", vars: { "--c": "var(--muted)" } }, h("h3", { text: `Not a table: ${sk.id}` }),
          h("button", { class: "btn", type: "button", onclick: () => editBlock(sk.id, (b) => { delete b.notTable; }) }, "Restore as table")));
      if (sheet.params.length || sheet.title) side.appendChild(h("div", { class: "rv-card", vars: { "--c": "var(--muted)" } },
        h("h3", { text: "Context (not charted)" }),
        h("div", { class: "small", text: `Title: ${sheet.title}` }),
        sheet.subtitle ? h("div", { class: "small muted", text: `Subtitle: ${sheet.subtitle}` }) : null,
        sheet.params.map((p) => h("div", { class: "small", text: `Parameter: ${p.label} = ${p.display}` }))));
    }
    current.refreshSide = refreshSide;
    refreshSide();
  }

  function setSel(a, b, table) {
    current.sel = { r0: Math.min(a[0], b[0]), c0: Math.min(a[1], b[1]), r1: Math.max(a[0], b[0]), c1: Math.max(a[1], b[1]) };
    for (const td of table.querySelectorAll("td.sel")) td.classList.remove("sel");
    for (const td of table.querySelectorAll("td[data-r]")) {
      const r = +td.dataset.r, c = +td.dataset.c;
      if (r >= current.sel.r0 && r <= current.sel.r1 && c >= current.sel.c0 && c <= current.sel.c1) td.classList.add("sel");
    }
  }

  function selectionCard(sheet, sel) {
    const range = U.rangeStr(sel.r0, sel.c0, sel.r1, sel.c1);
    return h("div", { class: "rv-card", vars: { "--c": "var(--accent)" } },
      h("h3", { text: `Selected ${range}` }),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", onclick: () => { current.sel = null; edit((ov) => { ov.added = (ov.added || []).concat({ r0: sel.r0, c0: sel.c0, r1: sel.r1, c1: sel.c1 }); }); } }, icon("plus"), "This is a table"),
        h("button", { class: "btn", type: "button", onclick: () => { current.sel = null; refresh(); } }, "Clear selection")));
  }

  function tableCard(sheet, t, i, color) {
    const bid = t.blockId;
    const bb = t.meta.bbox;
    const rowsOpts = [];
    for (let r = bb.r0; r <= bb.r1; r++) rowsOpts.push(r);
    const colOpts = [];
    for (let c = bb.c0 + 1; c <= bb.c1; c++) colOpts.push(c);
    const sel = (label, value, options, onchange) => h("label", { class: "row" }, label, h("select", { onchange: (e) => onchange(e.target.value) },
      options.map(([v, l]) => h("option", { value: v, selected: String(v) === String(value) }, l))));
    const others = sheet.tables.filter((x) => x !== t);
    const variance = t.columns.filter((c) => c.derived && c.derived.op === "diff");
    return h("div", { class: "rv-card", vars: { "--c": color } },
      h("h3", { text: `${i + 1}. ${t.range}` }),
      h("label", { class: "row" }, "Title", h("input", { class: "input", type: "text", value: t.title, style: { flex: "1" }, onchange: (e) => editBlock(bid, (b) => { const v = e.target.value.trim(); if (v && v !== t.autoTitle) b.title = v; else delete b.title; }) })),
      h("div", { class: "row small muted", text: `Confidence ${(t.meta.confidence * 100).toFixed(0)}% · ${t.rows.length} rows · ${t.meta.hasGrandTotal ? "Grand Total row " + t.totals.grandRow : "no total row"}` }),
      t.meta.issues.map((x) => h("div", { class: "row small", style: { color: "var(--warn-text)" } }, icon("warn"), x)),
      sel("Header row", t.meta.headerRows[0] ? t.meta.headerRows[0] - 1 : "", rowsOpts.map((r) => [r, `Row ${r + 1}`]), (v) => editBlock(bid, (b) => { b.headerRow = +v; })),
      sel("Total row", t.meta.totalRows.length ? t.meta.totalRows[t.meta.totalRows.length - 1].row - 1 : "none", [["none", "None"], ...rowsOpts.map((r) => [r, `Row ${r + 1}`])],
        (v) => editBlock(bid, (b) => { b.totalRows = v === "none" ? [] : [+v]; })),
      h("details", null, h("summary", { class: "small", text: "Columns" }),
        h("div", { class: "rv-cols" }, t.allColumns.map((c) => h("label", null, h("span", { text: `${U.colName(c.c)} · ${c.label}` }),
          h("select", { onchange: (e) => editBlock(bid, (b) => { b.columnRoles = { ...(b.columnRoles || {}), [c.c]: e.target.value }; }) },
            [["dimension", "Label (dimension)"], ["measure", "Number (measure)"], ["attribute", "Text (not charted)"], ["ignore", "Ignore"]]
              .map(([v, l]) => h("option", { value: v, selected: c.role === v }, l))))))),
      variance.map((c) => h("label", { class: "row small" }, h("input", { type: "checkbox", checked: !c.derived.positiveIsGood, onchange: () => editBlock(bid, (b) => { b.signFlip = { ...(b.signFlip || {}) }; if (b.signFlip[c.key]) delete b.signFlip[c.key]; else b.signFlip[c.key] = true; }) }),
        `"${c.label}": positive is bad (${c.derived.positiveLabel.toLowerCase()})`)),
      h("div", { class: "row" },
        sel("Split before", "", [["", "row…"], ...rowsOpts.slice(1).map((r) => [r, `Row ${r + 1}`])], (v) => v && edit((ov) => { ov.splits = (ov.splits || []).concat({ blockId: bid, row: +v }); })),
        sel("or col", "", [["", "col…"], ...colOpts.map((c) => [c, U.colName(c)])], (v) => v && edit((ov) => { ov.splits = (ov.splits || []).concat({ blockId: bid, col: +v }); }))),
      others.length ? sel("Merge with", "", [["", "table…"], ...others.map((o) => [o.blockId, `${o.title} (${o.range})`])], (v) => v && edit((ov) => { ov.merges = (ov.merges || []).concat([[bid, v]]); })) : null,
      h("div", { class: "row" },
        h("label", { class: "row" }, h("input", { type: "checkbox", checked: t.hidden, onchange: () => editBlock(bid, (b) => { if (b.hidden) delete b.hidden; else b.hidden = true; }) }), "Hide on dashboard"),
        h("button", { class: "btn", type: "button", onclick: () => editBlock(bid, (b) => { b.notTable = true; }) }, "Not a table"),
        h("button", { class: "btn ghost", type: "button", onclick: () => edit((ov) => { delete ov.blocks[bid]; }) }, icon("reset"), "Reset")));
  }

  DV.review = { open, close, refresh, isOpen: () => !!current };
})();
