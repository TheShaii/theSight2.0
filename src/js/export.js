/* Export the finished dashboard as one standalone, still-interactive .html file.
   The app is already a single self-contained file, so the export is that same document plus
   one JSON block holding the analyzed tables on the dashboard and the view. The raw workbook,
   and other sheets/cells are left out. No network, no server. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, modal, download, toast } = DV.dom;
  const EMBED_ID = "dv-embed";
  let pristine = null;

  // Captured before the app renders anything: the exact single-file document.
  if (globalThis.document) {
    document.addEventListener("DOMContentLoaded", () => {
      pristine = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    });
  }

  // Pure: what goes into the file. Only tables that are on the dashboard are kept.
  function serialize(state, opts = {}) {
    const used = DV.page.tablesUsed(DV.page.allSections(state.customizations));
    const sheets = state.sheets.map((sh) => {
      const tables = sh.tables.filter((t) => used.has(t.id)).map((t) => JSON.parse(JSON.stringify(t)));
      return {
        name: sh.name, title: sh.title, subtitle: sh.subtitle, notes: sh.notes, params: sh.params, mode: sh.mode,
        tables, reconcile: DV.reconcile.reconcileSheet(tables), warnings: [], lowConfidence: [], grid: null,
      };
    }).filter((sh) => sh.tables.length);
    return {
      app: "thesight-embed", version: 1, exportedAt: new Date().toISOString(),
      title: opts.title || null, fileName: state.fileName,
      // Exported files are previews: the viewer can filter, nothing else.
      viewer: { previewOnly: true, allowEdit: false, allowDesign: false, allowOpen: false },
      sheets,
      view: {
        customizations: { ...state.customizations, title: opts.title || state.customizations.title, assets: pickAssets(state.customizations) },
        filters: state.filters, pageFilters: state.pageFilters || {}, layoutId: state.layoutId === "present" ? (state.ui.prevLayout || "executive") : state.layoutId,
        variantId: state.variantId, paletteId: state.paletteId, density: state.density, corners: state.corners,
      },
    };
  }

  // Only images actually used on the dashboard travel in the file.
  function pickAssets(cz) {
    const used = DV.media ? DV.media.referenced(cz) : new Set();
    return Object.fromEntries(Object.entries(cz.assets || {}).filter(([id]) => used.has(id)));
  }

  // "<" is escaped so no cell text can close the <script> block early.
  const embedJSON = (payload) => JSON.stringify(payload).replace(/</g, "\\u003c").replace(new RegExp(String.fromCharCode(0x2028), "g"), "\\u2028").replace(new RegExp(String.fromCharCode(0x2029), "g"), "\\u2029");

  function buildHTML(base, payload) {
    const html = base.replace(new RegExp(`<script id="${EMBED_ID}"[^>]*>[\\s\\S]*?<\\/script>\\s*`), "");
    const tag = `<script id="${EMBED_ID}" type="application/json">${embedJSON(payload)}</script>\n`;
    return html.replace('<div id="app"></div>', () => '<div id="app"></div>\n' + tag);
  }

  function readEmbed() {
    const el = globalThis.document && document.getElementById(EMBED_ID);
    if (!el) return null;
    try {
      const p = JSON.parse(el.textContent);
      return p && p.app === "thesight-embed" ? p : null;
    } catch (e) { return null; }
  }

  function openDialog() {
    const s = DV.app.state;
    if (!pristine) return toast("Export isn't available in this copy of the app.");
    const board = DV.page.allItems(DV.page.allSections(s.customizations));
    if (!board.length) return toast("Add some charts first.");
    const defTitle = s.customizations.title || DV.utils.titleCase((s.sheets[s.activeSheet] || {}).title || "Dashboard");
    const title = h("input", { class: "input", type: "text", value: defTitle, style: { width: "100%" } });
    const tables = new Set(board.map((b) => b.tableId)).size;
    const go = () => {
      const payload = serialize(s, { title: title.value.trim() || defTitle });
      const html = buildHTML(pristine, payload);
      const name = (title.value.trim() || defTitle).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "dashboard";
      download(name + ".html", html, "text/html;charset=utf-8");
      m.close();
      toast(`Exported ${name}.html (${(html.length / 1024 / 1024).toFixed(1)} MB). It opens offline and stays interactive.`);
    };
    const m = modal("Export dashboard as .html", h("div", { style: { display: "grid", gap: "12px", maxWidth: "620px" } },
      h("p", { class: "muted", text: "Creates one .html preview that opens in any browser, offline. It shows only the dashboard: no top bar, logo, sidebar or filter bar. Viewers filter with the filter cards you added and by clicking charts; they can't edit, change the design or download data." }),
      h("label", { class: "menu-field" }, "Dashboard title", title),
      h("div", { class: "banner-warn", role: "note" }, icon("lock"),
        `This file contains the data shown in the dashboard (${tables} table${tables === 1 ? "" : "s"}, ${board.length} items). Anyone you send it to can see it. Other sheets and cells of the workbook are not included.`),
      h("div", { class: "filter-row" }, h("span", { class: "spacer", style: { flex: "1" } }),
        h("button", { class: "btn", type: "button", onclick: () => m.close() }, "Cancel"),
        h("button", { class: "btn primary", type: "button", onclick: go }, icon("download"), "Export .html"))));
  }

  DV.exporter = { serialize, buildHTML, readEmbed, openDialog, embedJSON, getPristine: () => pristine };
})();
