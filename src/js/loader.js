/* Upload, drag-drop, and friendly errors. Nothing leaves the machine. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, clear } = DV.dom;
  const ACCEPT = ".xlsx,.xlsm,.xls,.xlsb,.csv,.ods";

  function friendlyError(err) {
    const m = String((err && err.message) || err);
    if (/password|encrypt/i.test(m)) return "This workbook is password-protected. Remove the password in Excel (File › Info › Protect Workbook), save, and upload again.";
    if (/zip|corrupt|unsupported|invalid|end of data|signature|bad|cfb/i.test(m)) return "This file couldn't be read. It may be damaged, or it isn't a spreadsheet. Try opening it in Excel and saving it as .xlsx.";
    return "Something went wrong reading this file: " + m;
  }

  function landing(root, error) {
    clear(root);
    const input = h("input", { type: "file", accept: ACCEPT, class: "sr-only", id: "file-input", onchange: (e) => e.target.files[0] && readFile(e.target.files[0]) });
    const zone = h("div", { class: "dropzone", role: "button", tabindex: 0, "aria-label": "Choose an Excel file, or drop one here",
      onclick: () => input.click(), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } } },
      icon("upload"), h("strong", { text: "Drop an Excel file to begin" }), h("span", { class: "muted", text: "or click to choose · .xlsx, .xls, .xlsm, .csv, .ods" }));
    root.appendChild(h("main", { class: "landing fade-in" },
      h("img", { class: "landing-logo", src: globalThis.DV_LOGO || "", alt: "TheSight2.0 logo" }),
      h("h1", null, "TheSight", h("span", { class: "ver", text: "2.0" })),
      h("p", { class: "tagline", text: "Excel → interactive dashboard, in seconds." }),
      h("p", { text: "Upload a workbook with summary or pivot-style tables. TheSight finds the tables, totals and titles, suggests charts, and you pick the ones you want." }),
      zone, input,
      h("div", { class: "actions", style: { marginTop: "16px" } },
        h("span", { class: "privacy" }, icon("lock"), "Your data stays on your computer. Nothing is uploaded.")),
      error ? h("div", { class: "error-box", role: "alert" }, icon("warn"), " ", error) : null));
    zone.focus();
  }

  function busy(root, text) {
    clear(root);
    root.appendChild(h("main", { class: "landing", "aria-busy": "true" }, h("div", { class: "spinner", style: { margin: "0 auto 12px" } }), h("p", { text })));
  }

  function readFile(file) {
    const root = document.getElementById("app");
    if (file.size > 60 * 1024 * 1024) return landing(root, "This file is larger than 60 MB. Try saving only the sheets you need into a new workbook.");
    busy(root, `Reading ${file.name}…`);
    const fr = new FileReader();
    fr.onerror = () => landing(root, "The file couldn't be opened by the browser.");
    fr.onload = () => load(new Uint8Array(fr.result), file.name);
    fr.readAsArrayBuffer(file);
  }

  const WORKER_MIN = 5 * 1024 * 1024;

  // SheetJS source, taken from this very file's inlined vendor script.
  function xlsxSource() {
    for (const sc of document.scripts) {
      const txt = sc.textContent || "";
      const a = txt.indexOf("/* vendor/xlsx.full.min.js */"), b = txt.indexOf("/* vendor/echarts.min.js */");
      if (a >= 0 && b - a > 200000) return txt.slice(a, b); // the real library, not code mentioning it
    }
    return null;
  }
  // Parse off the main thread; resolves null when workers aren't available (we then parse inline).
  function parseInWorker(bytes) {
    return new Promise((resolve) => {
      let url = null;
      try {
        const src = xlsxSource();
        if (!src || typeof Worker === "undefined") return resolve(null);
        const code = src + ";\nonmessage = function (e) { try { postMessage({ wb: XLSX.read(e.data, { type: 'array', cellDates: true, cellNF: true, cellStyles: true }) }); } catch (err) { postMessage({ error: String(err && err.message || err) }); } };";
        url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
        const w = new Worker(url);
        w.onmessage = (e) => { w.terminate(); URL.revokeObjectURL(url); resolve(e.data); };
        w.onerror = () => { w.terminate(); URL.revokeObjectURL(url); resolve(null); };
        w.postMessage(bytes);
      } catch (e) { if (url) URL.revokeObjectURL(url); resolve(null); }
    });
  }

  function load(bytes, name) {
    const root = document.getElementById("app");
    busy(root, bytes.length >= WORKER_MIN ? `Reading a large file (${(bytes.length / 1048576).toFixed(1)} MB)…` : "Detecting tables…");
    // Let the spinner paint before parsing.
    setTimeout(async () => {
      let wb, sheets;
      try {
        if (!bytes.length) throw new Error("empty");
        const viaWorker = bytes.length >= (DV.loader.workerMin || WORKER_MIN) ? await parseInWorker(bytes) : null;
        if (viaWorker && viaWorker.error) throw new Error(viaWorker.error);
        wb = viaWorker && viaWorker.wb ? viaWorker.wb : DV.grid.readWorkbook(bytes);
        sheets = DV.analyze.analyzeWorkbook(wb);
      } catch (e) {
        return landing(root, e.message === "empty" ? "This file is empty." : friendlyError(e));
      }
      if (!sheets.length || !sheets.some((s) => s.tables.length)) {
        return landing(root, "No tables were found in this file. A table needs a header row and at least one row of numbers below it.");
      }
      DV.app.start(wb, sheets, name);
    }, 30);
  }

  // Dropping a file anywhere replaces the current workbook.
  function enableGlobalDrop() {
    let depth = 0;
    const zone = () => document.querySelector(".dropzone");
    window.addEventListener("dragenter", (e) => { if (hasFiles(e)) { depth++; const z = zone(); if (z) z.classList.add("drag"); e.preventDefault(); } });
    window.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); const z = zone(); if (z && !depth) z.classList.remove("drag"); });
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0;
      const f = e.dataTransfer.files[0];
      if (f) readFile(f);
    });
  }
  const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");

  DV.loader = { landing, readFile, load, enableGlobalDrop, ACCEPT, parseInWorker, workerMin: 5 * 1024 * 1024 };
})();
