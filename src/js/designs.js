/* Design registry. A design is a full visual system (CSS in styles/designs/*.css) plus a
   chartStyle the chart builders read. Variants are its light/dark (or mood) versions.
   Switching designs never re-parses data. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";

  const DESIGNS = [
    { id: "thesight", name: "TheSight", blurb: "Clean white and navy with yellow highlights.",
      chart: { bar: "solid", radius: 4, glow: 0, outline: false, smooth: false, area: false },
      variants: [{ id: "thesight-light", name: "Light", mode: "light" }, { id: "thesight-dark", name: "Navy", mode: "dark" }] },
    { id: "exec", name: "Executive", blurb: "Navy header band, white cards, KPI tiles with colored top edges.",
      chart: { bar: "solid", radius: 4, glow: 0, outline: false, smooth: false, area: false },
      variants: [{ id: "exec-light", name: "Light", mode: "light" }, { id: "exec-dark", name: "Navy", mode: "dark" }] },
    { id: "bank", name: "Banking Gold", blurb: "Navy and gold, left-edge KPI cards with icon badges.",
      chart: { bar: "solid", radius: 4, glow: 0, outline: false, smooth: true, area: true },
      variants: [{ id: "bank-light", name: "Light", mode: "light" }, { id: "bank-dark", name: "Night", mode: "dark" }] },
    { id: "estate", name: "Terracotta Estate", blurb: "Cream frame, terracotta accents, serif title, soft tiles.",
      chart: { bar: "solid", radius: 3, glow: 0, outline: false, smooth: true, area: false },
      variants: [{ id: "estate-light", name: "Cream", mode: "light" }] },
    { id: "plum", name: "Plum Retail", blurb: "Plum header band, round icon badges, plum pills.",
      chart: { bar: "solid", radius: 2, glow: 0, outline: false, smooth: false, area: false },
      variants: [{ id: "plum-light", name: "Light", mode: "light" }] },
    { id: "neon", name: "Neon", blurb: "Dark grid, glowing outlines and neon marks.",
      chart: { bar: "gradient", radius: 2, glow: 18, outline: false, smooth: false, area: true, mono: true },
      variants: [{ id: "neon-cyber", name: "Cyber", mode: "dark" }, { id: "neon-synth", name: "Synthwave", mode: "dark" }] },
    { id: "bento", name: "Bento Soft", blurb: "Soft neumorphic tiles in a bento grid.", layout: "bento",
      chart: { bar: "solid", radius: 10, glow: 0, outline: false, smooth: true, area: false },
      variants: [{ id: "bento-light", name: "Soft Light", mode: "light" }, { id: "bento-dark", name: "Soft Dark", mode: "dark" }] },
    { id: "brutal", name: "Neubrutalism", blurb: "Bold ink borders, hard shadows, flat color.",
      chart: { bar: "solid", radius: 0, glow: 0, outline: true, smooth: false, area: false },
      variants: [{ id: "brutal-light", name: "Bold", mode: "light" }, { id: "brutal-dark", name: "Bold Night", mode: "dark" }] },
    { id: "classic", name: "Classic", blurb: "The plain themes, plus print and high-contrast.",
      chart: { bar: "solid", radius: 4, glow: 0, outline: false, smooth: false, area: false },
      variants: [
        { id: "classic-midnight", name: "Midnight", mode: "dark" }, { id: "classic-sunset", name: "Sunset", mode: "light" },
        { id: "classic-forest", name: "Forest", mode: "light" }, { id: "classic-ocean", name: "Ocean", mode: "dark" },
        { id: "classic-mono", name: "Monochrome (print)", mode: "light", texture: true }, { id: "classic-hc", name: "High Contrast", mode: "dark" },
      ] },
  ];
  const VARIANTS = DESIGNS.flatMap((d) => d.variants.map((v) => ({ ...v, design: d.id })));
  const PALETTES = [{ id: "default", name: "Design colors" }, { id: "cb", name: "Colorblind-safe", texture: true }];

  const design = (id) => DESIGNS.find((d) => d.id === id) || DESIGNS[0];
  // Retired variants (e.g. the removed Glass design) resolve through migrate().
  function variant(id) { return VARIANTS.find((v) => v.id === id) || VARIANTS.find((v) => v.id === migrate(id)) || VARIANTS[0]; }
  // A variant id from older saved views/prefs ("light", "dark", "midnight"…) maps onto the new set.
  function migrate(oldThemeId) {
    const map = { light: "thesight-light", dark: "thesight-dark", auto: "thesight-light", pastel: "bento-light", "glass-dark": "exec-dark", "glass-light": "exec-light" };
    return map[oldThemeId] || (VARIANTS.some((v) => v.id === "classic-" + oldThemeId) ? "classic-" + oldThemeId : VARIANTS.some((v) => v.id === oldThemeId) ? oldThemeId : "thesight-light");
  }

  function apply(state) {
    const v = variant(state.variantId);
    const root = document.documentElement;
    root.setAttribute("data-design", v.design);
    root.setAttribute("data-variant", v.id);
    root.setAttribute("data-mode", v.mode);
    root.setAttribute("data-palette", state.paletteId === "cb" ? "cb" : "default");
    root.setAttribute("data-density", state.density);
    root.setAttribute("data-corners", state.corners);
    root.style.colorScheme = v.mode;
  }

  // Snapshot of the CSS variables + chart style that ECharts needs.
  function read(state) {
    const css = (n) => DV.dom.cssVar(n);
    const v = variant(state.variantId), d = design(v.design);
    return {
      id: v.id, design: d.id, mode: v.mode, style: d.chart,
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css("--series-" + i)),
      surface: css("--surface-solid") || css("--surface"), text: css("--text"), text2: css("--text-2"), muted: css("--muted"),
      grid: css("--grid"), axis: css("--axis"), border: css("--border-strong"), markBorder: css("--mark-border"),
      accent: css("--accent"), highlight: css("--highlight"), over: css("--over"), under: css("--under"), neutral: css("--neutral"), other: css("--other"),
      tooltipBg: css("--tooltip-bg"), tooltipText: css("--tooltip-text"),
      font: css("--font") || "system-ui, sans-serif", fontNum: css("--font-num") || css("--font"),
      texture: !!(v.texture || state.paletteId === "cb"),
      reducedMotion: !!(globalThis.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches),
    };
  }

  DV.designs = { DESIGNS, VARIANTS, PALETTES, design, variant, migrate, apply, read };
})();
