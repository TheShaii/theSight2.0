/* Photos: image cards, dashboard/section backgrounds and a header logo.
   Every upload is re-encoded through a canvas (max 1600 px). That keeps exports small and
   turns SVGs into plain pixels, so no script inside an uploaded file can ever run. Images are
   stored as data URIs in customizations.assets and travel inside exported files. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const { h, icon, toast } = DV.dom;
  const MAX_SIDE = 1600, MAX_BYTES = 1.5 * 1024 * 1024;
  const app = () => DV.app;

  function pickFile() {
    return new Promise((resolve) => {
      const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml,image/gif", class: "sr-only" });
      input.addEventListener("change", () => { const f = input.files[0]; input.remove(); resolve(f || null); });
      document.body.appendChild(input);
      input.click();
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file couldn't be read as an image.")); };
      img.src = url;
    });
  }

  // Re-encode: transparent sources (png/svg/webp/gif) keep alpha, photos become JPEG.
  async function encode(file, maxSide = MAX_SIDE) {
    const img = await loadImage(file);
    const alpha = /png|svg|webp|gif/.test(file.type);
    let side = maxSide, uri = "";
    for (let i = 0; i < 4; i++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth || side, img.naturalHeight || side));
      const w = Math.max(1, Math.round((img.naturalWidth || side) * scale)), ht = Math.max(1, Math.round((img.naturalHeight || side) * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = ht;
      c.getContext("2d").drawImage(img, 0, 0, w, ht);
      uri = alpha ? c.toDataURL("image/webp", 0.88) : c.toDataURL("image/jpeg", 0.85);
      if (alpha && !uri.startsWith("data:image/webp")) uri = c.toDataURL("image/png");
      if (uri.length * 0.75 <= MAX_BYTES) return uri;
      side = Math.round(side * 0.7);
    }
    return uri;
  }

  // Pick → encode → store; resolves to the new asset id (or null if cancelled/failed).
  async function upload(maxSide) {
    const f = await pickFile();
    if (!f) return null;
    if (f.size > 25 * 1024 * 1024) { toast("That image is larger than 25 MB. Please pick a smaller one."); return null; }
    try {
      const uri = await encode(f, maxSide);
      const id = DV.page.newId("img");
      app().state.customizations.assets = { ...(app().state.customizations.assets || {}), [id]: uri };
      toast(`Image added (${Math.round(uri.length * 0.75 / 1024)} KB).`);
      return id;
    } catch (e) { toast(e.message); return null; }
  }

  const uriOf = (id) => ((app().state.customizations.assets || {})[id]) || null;
  // Data URIs come from our own canvas (base64 only), so they are safe inside url("…").
  const cssUrl = (id) => { const u = uriOf(id); return u && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? `url("${u}")` : null; };

  // Background layer for the dashboard or a section: photo + dim (0–0.85) + optional blur.
  function applyBackground(el, bg) {
    const url = bg && cssUrl(bg.asset);
    if (!url) return;
    el.classList.add("has-photo");
    el.style.setProperty("--photo", url);
    el.style.setProperty("--photo-dim", String(bg.dim == null ? 0.55 : bg.dim));
    el.style.setProperty("--photo-blur", (bg.blur || 0) + "px");
  }

  function imageCard(spec, opts = {}) {
    const s = app().state;
    const c = s.customizations.charts[spec.id] || {};
    const uri = uriOf(spec.asset);
    const fit = c.fit || spec.fit || "cover";
    const card = h("article", { class: "card image-card fade-in", "data-chart": opts.preview ? null : spec.id, tabindex: s.editMode ? 0 : null },
      c.title ? h("div", { class: "card-head" }, h("h3", { text: c.title })) : null,
      uri ? h("img", { src: uri, alt: c.caption || c.title || "Dashboard image", style: { objectFit: fit } }) : h("div", { class: "empty-note", text: "Image missing" }),
      c.caption ? h("div", { class: "image-caption", text: c.caption }) : null,
      s.editMode && !opts.preview ? h("div", { class: "edit-bar" },
        h("button", { class: "btn", type: "button", onclick: async () => { const id = await upload(); if (id) app().commit((st) => { const at = DV.page.find(DV.page.list(st.customizations), spec.id); if (at) at.item.asset = id; }); } }, icon("upload"), "Replace"),
        h("div", { class: "seg", role: "group", "aria-label": "Fit" }, [["cover", "Fill"], ["contain", "Fit"]].map(([v, l]) =>
          h("button", { type: "button", "aria-pressed": String(fit === v), onclick: () => app().commit((st) => { st.customizations.charts[spec.id] = { ...(st.customizations.charts[spec.id] || {}), fit: v }; }) }, l))),
        h("input", { class: "input", type: "text", placeholder: "Caption", value: c.caption || "", onchange: (e) => app().commit((st) => { st.customizations.charts[spec.id] = { ...(st.customizations.charts[spec.id] || {}), caption: e.target.value || undefined }; }) }),
        h("button", { class: "btn", type: "button", onclick: () => app().removeItem(null, spec.id) }, icon("close"), "Remove")) : null);
    return DV.cards.sized(card, spec, { ...opts, fixedH: null }, null);
  }

  // Controls for a background (used in the Design picker and section edit tools).
  function backgroundControls(current, onChange) {
    const dim = current && current.dim != null ? current.dim : 0.55;
    return h("div", { class: "filter-row" },
      h("button", { class: "btn", type: "button", onclick: async () => { const id = await upload(); if (id) onChange({ asset: id, dim, blur: current ? current.blur || 0 : 0 }); } }, icon("upload"), current ? "Change photo" : "Upload photo"),
      current ? h("label", { class: "field" }, "Dim", h("input", { type: "range", min: 0, max: 0.85, step: 0.05, value: dim, "aria-label": "Dim the photo", onchange: (e) => onChange({ ...current, dim: +e.target.value }) })) : null,
      current ? h("label", { class: "field" }, "Blur", h("input", { type: "range", min: 0, max: 12, step: 1, value: current.blur || 0, "aria-label": "Blur the photo", onchange: (e) => onChange({ ...current, blur: +e.target.value }) })) : null,
      current ? h("button", { class: "btn ghost", type: "button", onclick: () => onChange(null) }, icon("close"), "Remove") : null);
  }

  // Asset ids referenced anywhere (used to drop unused images from exports).
  function referenced(cz) {
    const ids = new Set();
    if (cz.background && cz.background.asset) ids.add(cz.background.asset);
    if (cz.logo) ids.add(cz.logo);
    for (const sec of DV.page.allSections(cz)) {
      if (sec.bg && sec.bg.asset) ids.add(sec.bg.asset);
      for (const it of sec.items) if (it.asset) ids.add(it.asset);
    }
    return ids;
  }

  DV.media = { upload, encode, uriOf, applyBackground, imageCard, backgroundControls, referenced };
})();
