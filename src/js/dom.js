/* DOM helpers. Spreadsheet text is only ever inserted via text nodes (never innerHTML). */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "vars") for (const [n, val] of Object.entries(v)) el.style.setProperty(n, val);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "value") el.value = v;
        else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden") el[k] = !!v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

  // Static icon paths (24×24, stroke). These are constants, never user data.
  const ICONS = {
    upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
    file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
    lock: "M6 11h12v9H6zM8 11V7a4 4 0 0 1 8 0v4",
    palette: "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-1.4-1.2-1.7-1.2-3 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
    layout: "M4 4h16v16H4zM4 10h16M10 10v10",
    filter: "M4 5h16l-6 8v5l-4 2v-7z",
    review: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM15 15l2 2 4-4",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    close: "M6 6l12 12M18 6L6 18",
    check: "M5 12l5 5 9-10",
    warn: "M12 4l9 16H3zM12 10v4M12 17h.01",
    edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
    redo: "M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
    save: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
    open: "M4 7h6l2 2h8v10H4z",
    reset: "M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5",
    plus: "M12 5v14M5 12h14",
    eyeOff: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-2.2 2.8M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6a8.6 8.6 0 0 0 4.4-1.2",
    download: "M12 4v12M7 11l5 5 5-5M4 20h16",
    grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
    left: "M15 6l-6 6 6 6",
    right: "M9 6l6 6-6 6",
    pin: "M12 17v5M8 3h8l-1 6 3 4H6l3-4z",
    copy: "M8 8h12v12H8zM4 16V4h12",
    info: "M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
    present: "M3 4h18v12H3zM8 20h8M12 16v4",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  };
  function icon(name, label) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "icon");
    if (label) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", label); }
    else svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICONS[name] || ICONS.info);
    svg.appendChild(p);
    return svg;
  }

  const iconBtn = (name, label, onclick, extra = {}) =>
    h("button", { class: "btn ghost icon-only " + (extra.class || ""), type: "button", "aria-label": label, title: label, onclick, ...extra.attrs }, icon(name));

  // ---- Popover (one at a time) ----
  let openPop = null;
  function closePopover() {
    if (!openPop) return;
    const { el, anchor, onClose } = openPop;
    openPop = null;
    el.remove();
    document.removeEventListener("mousedown", outside, true);
    if (onClose) onClose();
    if (anchor && document.contains(anchor)) anchor.focus();
  }
  function outside(e) { if (openPop && !openPop.el.contains(e.target) && !openPop.anchor.contains(e.target)) closePopover(); }
  function popover(anchor, content, opts = {}) {
    const wasSame = openPop && openPop.anchor === anchor;
    closePopover();
    if (wasSame && !opts.force) return null;
    const el = h("div", { class: "popover fade-in", role: "dialog", "aria-label": opts.label || "Options" }, content);
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, ht = el.offsetHeight;
    let left = opts.alignRight ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + ht > window.innerHeight - 8) top = Math.max(8, r.top - ht - 6);
    el.style.left = left + "px";
    el.style.top = top + "px";
    openPop = { el, anchor, onClose: opts.onClose };
    setTimeout(() => document.addEventListener("mousedown", outside, true), 0);
    const first = el.querySelector("button, input, select, [tabindex]");
    if (first && !opts.noFocus) first.focus();
    el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closePopover(); } });
    return el;
  }

  function modal(title, body, opts = {}) {
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === "Escape" && !openPop) { e.stopPropagation(); close(); } };
    const dlg = h("div", { class: "modal fade-in", role: "dialog", "aria-modal": "true", "aria-label": title, style: opts.wide ? { width: "min(1500px, 100%)" } : null },
      h("div", { class: "modal-head" }, h("h2", { text: title }), opts.actions || null, iconBtn("close", "Close", () => close())),
      h("div", { class: "modal-body" }, body));
    const back = h("div", { class: "modal-backdrop", onmousedown: (e) => { if (e.target === back) close(); } }, dlg);
    document.body.appendChild(back);
    document.addEventListener("keydown", onKey, true);
    const f = dlg.querySelector(".modal-body button, .modal-body input, .modal-body select") || dlg.querySelector("button");
    if (f) f.focus();
    return { close, el: dlg, body: dlg.querySelector(".modal-body") };
  }

  let toastTimer;
  function toast(msg) {
    const old = document.querySelector(".toast");
    if (old) old.remove();
    const t = h("div", { class: "toast", role: "status", text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }

  function download(filename, data, type) {
    const url = typeof data === "string" && data.startsWith("data:") ? data : URL.createObjectURL(new Blob([data], { type: type || "application/octet-stream" }));
    const a = h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (!url.startsWith("data:")) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const cssVar = (name, el) => getComputedStyle(el || document.documentElement).getPropertyValue(name).trim();

  DV.dom = { h, append, clear, icon, iconBtn, popover, closePopover, modal, toast, download, cssVar, isPopoverOpen: () => !!openPop };
})();
