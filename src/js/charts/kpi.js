/* KPI family (ECharts parts): progress ring, gauge, single-total bullet. Big-number and
   variance tiles are DOM cards (cards.kpiCard). All values come from Grand Total rows. */
var DV = globalThis.DV || (globalThis.DV = {});
(function () {
  "use strict";
  const U = DV.utils, B = DV.charts.BUILDERS;
  const { label, full, base, alpha, esc } = { ...DV.charts.h, esc: DV.charts.esc };

  const grandOf = (t, k) => (t.totals.grand ? t.totals.grand[k] : null);

  // Progress ring: actual as a share of plan. >100% wraps visually but the label stays honest.
  B.ring = function (t, spec, ctx) {
    const th = ctx.theme;
    const a = grandOf(t, spec.actual), p = grandOf(t, spec.plan);
    const pct = p ? a / p * 100 : 0;
    const over = pct > 100;
    const o = base(th);
    o.series = [{
      type: "gauge", startAngle: 90, endAngle: -270, min: 0, max: Math.max(100, Math.ceil(pct / 10) * 10), radius: "88%",
      pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
      axisLine: { lineStyle: { width: 16, color: [[1, th.neutral]] } },
      progress: { show: true, width: 16, roundCap: th.style.radius > 0, itemStyle: { color: over ? th.over : th.under, shadowBlur: th.style.glow, shadowColor: alpha(over ? th.over : th.under, 0.5) } },
      title: { offsetCenter: [0, "28%"], color: th.muted, fontSize: 12 },
      detail: { offsetCenter: [0, "-6%"], valueAnimation: !th.reducedMotion, color: th.text, fontSize: 26, fontWeight: 700, fontFamily: th.fontNum, formatter: (v) => v.toFixed(1) + "%" },
      data: [{ value: +pct.toFixed(1), name: `${label(t, spec.actual)} of ${label(t, spec.plan)}` }],
    }];
    o.tooltip.formatter = () => `${esc(label(t, spec.actual))}: <b>${esc(full(t, spec.actual, a))}</b><br>${esc(label(t, spec.plan))}: ${esc(full(t, spec.plan, p))}`;
    return o;
  };

  // Gauge: needle at actual; the band turns from "under" to "over" color at the plan value.
  B.gauge = function (t, spec, ctx) {
    const th = ctx.theme;
    const a = grandOf(t, spec.actual), p = grandOf(t, spec.plan);
    const max = Math.max(a, p) * 1.2 || 1;
    const o = base(th);
    o.series = [{
      type: "gauge", min: 0, max, radius: "92%", center: ["50%", "62%"], startAngle: 200, endAngle: -20, splitNumber: 4,
      axisLine: { lineStyle: { width: 14, color: [[p / max, th.under], [1, th.over]] } },
      pointer: { width: 5, itemStyle: { color: th.text } }, anchor: { show: true, size: 12, itemStyle: { color: th.text } },
      axisTick: { show: false }, splitLine: { length: 10, lineStyle: { color: th.surface, width: 2 } },
      axisLabel: { color: th.muted, distance: 18, formatter: (v) => U.formatCompact(v), fontSize: 10 },
      title: { offsetCenter: [0, "38%"], color: th.muted, fontSize: 12 },
      detail: { offsetCenter: [0, "64%"], color: th.text, fontSize: 20, fontWeight: 700, fontFamily: th.fontNum, formatter: (v) => U.formatCompact(v) },
      data: [{ value: a, name: `${label(t, spec.actual)} (plan ${U.formatCompact(p)})` }],
    }];
    o.tooltip.formatter = () => `${esc(label(t, spec.actual))}: <b>${esc(full(t, spec.actual, a))}</b><br>${esc(label(t, spec.plan))}: ${esc(full(t, spec.plan, p))}`;
    return o;
  };

  // One horizontal bar for the actual total with a plan marker.
  B.bulletTotal = function (t, spec, ctx) {
    const th = ctx.theme;
    const a = grandOf(t, spec.actual), p = grandOf(t, spec.plan);
    const o = base(th);
    o.grid = { left: 8, right: 60, top: 30, bottom: 20, containLabel: true };
    o.xAxis = { type: "value", splitLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.muted, formatter: (v) => U.formatCompact(v) }, max: Math.max(a, p) * 1.1 };
    o.yAxis = { type: "category", data: [label(t, spec.actual)], axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: th.text2 } };
    o.series = [
      { type: "bar", data: [a], barWidth: 28, itemStyle: DV.charts.h.mark(th, a > p ? th.over : th.under, "h"),
        label: { show: true, position: "right", color: th.text, fontFamily: th.fontNum, formatter: () => U.formatCompact(a) } },
      { type: "scatter", data: [[p, 0]], symbol: "rect", symbolSize: [4, 40], itemStyle: { color: th.text }, z: 5,
        label: { show: true, position: "top", color: th.muted, formatter: () => `${label(t, spec.plan)} ${U.formatCompact(p)}` } },
    ];
    o.tooltip.formatter = () => `${esc(label(t, spec.actual))}: <b>${esc(full(t, spec.actual, a))}</b><br>${esc(label(t, spec.plan))}: ${esc(full(t, spec.plan, p))}<br>${a > p ? "Over" : "Under"} by ${esc(full(t, spec.actual, Math.abs(a - p)))}`;
    return o;
  };
})();
