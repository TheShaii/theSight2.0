/* Layout registry. Declarative: name, thumbnail and filter placement.
   dashboard.js owns one renderer per `kind`; adding a layout = adding an entry here
   (plus a renderer if the arrangement is genuinely new). */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";

  // Thumbnails are static SVG markup (constants, not user data).
  const r = (x, y, w, h, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="currentColor" opacity="${o}"/>`;
  const svg = (body) => `<svg viewBox="0 0 120 64" aria-hidden="true">${body}</svg>`;

  const LAYOUTS = [
    {
      id: "executive", name: "Executive Overview", kind: "exec", filters: "sidebar",
      description: "KPIs on top, tables in a 2-column grid, filters on the left.",
      thumb: svg(r(2, 2, 26, 60, .25) + r(32, 2, 86, 10, .5) + r(32, 16, 41, 22, .35) + r(77, 16, 41, 22, .35) + r(32, 42, 41, 20, .35) + r(77, 42, 41, 20, .35)),
    },
    {
      id: "bento", name: "Bento Grid", kind: "bento", filters: "top",
      description: "Tiles of different sizes: a hero chart per table, KPI tiles, wide tables.",
      thumb: svg(r(2, 2, 56, 38, .45) + r(62, 2, 26, 17, .3) + r(92, 2, 26, 17, .3) + r(62, 23, 56, 17, .35) + r(2, 44, 26, 18, .3) + r(32, 44, 86, 18, .35)),
    },
    {
      id: "boards", name: "Table Boards", kind: "boards", filters: "top",
      description: "One board per table, placed like the original sheet.",
      thumb: svg(r(2, 2, 116, 8, .4) + r(2, 14, 56, 26, .35) + r(62, 14, 56, 20, .35) + r(2, 44, 56, 18, .35) + r(62, 38, 56, 24, .35)),
    },
    {
      id: "story", name: "Story / Scroll", kind: "story", filters: "top",
      description: "A single readable column with large charts and captions.",
      thumb: svg(r(30, 2, 60, 6, .5) + r(30, 11, 60, 16, .35) + r(30, 30, 60, 3, .25) + r(30, 36, 60, 16, .35) + r(30, 55, 60, 3, .25)),
    },
    {
      id: "focus", name: "Focus", kind: "focus", filters: "drawer",
      description: "One hero chart with a rail of every other chart.",
      thumb: svg(r(2, 2, 84, 60, .4) + r(90, 2, 28, 12, .3) + r(90, 18, 28, 12, .3) + r(90, 34, 28, 12, .3) + r(90, 50, 28, 12, .3)),
    },
    {
      id: "present", name: "Presentation", kind: "present", filters: "drawer",
      description: "Full-screen slides. ←/→ to move, F for filters, Esc to exit.",
      thumb: svg(r(2, 2, 116, 52, .4) + r(50, 57, 4, 4, .6) + r(58, 57, 4, 4, .3) + r(66, 57, 4, 4, .3)),
    },
    {
      id: "tabbed", name: "Tabbed", kind: "tabs", filters: "top",
      description: "An Overview tab, one tab per table, and a Data tab.",
      thumb: svg(r(2, 2, 20, 7, .6) + r(25, 2, 20, 7, .3) + r(48, 2, 20, 7, .3) + r(2, 13, 116, 49, .3)),
    },
  ];

  const get = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

  // Parse a static thumbnail string into an SVG node (DOMParser, no innerHTML on live DOM).
  function thumbNode(layout) {
    const doc = new DOMParser().parseFromString(layout.thumb.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '), "image/svg+xml");
    return document.importNode(doc.documentElement, true);
  }

  DV.layouts = { LAYOUTS, get, thumbNode };
})();
