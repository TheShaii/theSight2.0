/* Business icon library (24×24 stroke paths, static constants, offline) + icon picker.
   Icons attach to KPI tiles, charts, filters and sections via customizations. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";

  const LIB = {
    money: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v.01M18 14v.01",
    wallet: "M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14h.01",
    bank: "M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18",
    coins: "M8 10c3 0 6-1 6-3s-3-3-6-3-6 1-6 3 3 3 6 3zM2 7v4c0 2 3 3 6 3s6-1 6-3M14 12c3 0 8 0 8 3s-3 3-6 3-6-1-6-3M10 15v3c0 2 3 3 6 3s6-1 6-3v-3",
    "credit-card": "M3 6h18v12H3zM3 10h18M7 15h3",
    percent: "M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    "trend-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
    "trend-down": "M3 7l6 6 4-4 8 8M15 17h6v-6",
    pie: "M12 3v9h9a9 9 0 1 1-9-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
    gauge: "M12 14l4-4M3.5 16a9 9 0 1 1 17 0M12 14h.01",
    target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
    users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    building: "M4 21V5l8-3v19M12 21h8V9l-8-3M8 7v.01M8 11v.01M8 15v.01M16 12v.01M16 16v.01",
    home: "M3 11l9-8 9 8M5 9v12h14V9M10 21v-6h4v6",
    factory: "M2 21V10l6 4V10l6 4V6l8 4v11zM6 17h2M12 17h2M18 17h2",
    cart: "M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M18 20h.01",
    truck: "M2 6h12v10H2zM14 10h4l3 3v3h-7M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    box: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    calendar: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z",
    check: "M5 12l5 5 9-10",
    alert: "M12 4l9 16H3zM12 10v4M12 17h.01",
    flag: "M5 21V4M5 4h12l-2 4 2 4H5",
    globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
    pin: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    briefcase: "M3 8h18v12H3zM8 8V5h8v3M3 13h18",
    tools: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
    bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
    leaf: "M5 19c0-9 6-14 15-14 0 9-5 15-14 15M5 19c3-4 6-6 10-8",
    doc: "M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6",
    handshake: "M3 12l4-4 4 2 3-2 3 1 4 3M7 12l4 4 2-1 2 2 2-1 3-3M11 10l3 3",
    rocket: "M5 15c-1 2-1 4-1 5 1 0 3 0 5-1M9 15l-3-3c2-6 7-9 14-9 0 7-3 12-9 14zM15 9h.01",
    heart: "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z",
  };
  const NAMES = Object.keys(LIB);

  function node(name, cls) {
    const d = LIB[name];
    if (!d) return null;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.appendChild(p);
    return svg;
  }
  const badge = (name) => (LIB[name] ? DV.dom.h("span", { class: "ico-badge" }, node(name)) : null);

  // A sensible default from a measure/section name; the user can change or remove it.
  const RULES = [
    [/budget|plan|forecast|target/i, "wallet"], [/eac|cost|spend|spent|amount|price|revenue|sales|profit|cogs|\bpr\b|\bpo\b|ses/i, "money"],
    [/vendor|supplier|carrier|shipping|delivery/i, "truck"], [/unit|plant|site|facility/i, "factory"], [/property|rental|home|house/i, "home"],
    [/customer|user|staff|employee|people|headcount/i, "users"], [/order|cart|quantity|qty/i, "cart"], [/rate|%|percent|share|margin/i, "percent"],
    [/time|days|hours|duration/i, "clock"], [/date|month|year|period/i, "calendar"], [/risk|compliance|security/i, "shield"],
    [/account|bank|loan|deposit/i, "bank"], [/variance|vs|delta|gap|over|under/i, "trend-up"], [/count|number|total/i, "chart"],
  ];
  function auto(text) {
    for (const [re, name] of RULES) if (re.test(text || "")) return name;
    return "chart";
  }

  // Grid picker popover. onPick(name | null).
  function picker(anchor, current, onPick) {
    const { h, popover, closePopover } = DV.dom;
    let q = "";
    const grid = h("div", { class: "ico-grid" });
    const fill = () => {
      DV.dom.clear(grid);
      for (const n of NAMES.filter((x) => !q || x.includes(q))) {
        grid.appendChild(h("button", { type: "button", class: "ico-pick", title: n, "aria-label": n, "aria-pressed": String(current === n),
          onclick: () => { closePopover(); onPick(n); } }, node(n)));
      }
    };
    fill();
    popover(anchor, [
      h("h4", { text: "Choose an icon" }),
      h("input", { class: "input", type: "search", placeholder: "Search icons…", style: { width: "100%" }, oninput: (e) => { q = e.target.value.toLowerCase().trim(); fill(); } }),
      grid,
      h("button", { class: "menu-item", type: "button", onclick: () => { closePopover(); onPick(null); } }, "No icon"),
    ], { label: "Icon picker", force: true });
  }

  DV.icons = { LIB, NAMES, node, badge, auto, picker };
})();
