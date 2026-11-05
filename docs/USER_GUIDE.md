# TheSight2.0 user guide

## 1. Open it
Double-click **TheSight2.0.html**. It runs in your browser with no internet needed, and nothing is uploaded anywhere.
Drop an Excel file onto the page (or click to choose one).

## 2. Pick your charts
TheSight reads every sheet and shows **Pick your charts**: live previews for each table it found.
- The tabs at the top filter by kind: **Bars, KPI, Filters, Composition, Other, Tables**.
- ★ **Recommended** charts are already ticked. Click a card to tick or untick it.
- At the bottom, **Add to** chooses the section the charts go into.
- Click **Build dashboard**.

You can come back at any time with **Add charts** (or press `G`).

## 3. Shape your dashboard
- **Pages:** the tabs above the dashboard. **+ Add page** creates one. Double-click a tab (or use Edit mode) to rename it. In Edit mode, the ⋯ menu next to the active tab can duplicate, move or delete the page. `Ctrl+PgUp / PgDn` switches pages. Any page can use any table from any sheet.
- **Sections:** **Add section** at the bottom creates one. Each section has **Add charts, Add KPI, Add filter, Add image** buttons. A section can mix tables.
- **Resize:** drag the small corner handle at the bottom right of any card.
- **Edit mode** (`E`, or the **Edit** button):
  - drag cards to reorder them;
  - rename titles by clicking them;
  - **Move to…** another section;
  - **Icon**, **Duplicate**, **Hide**, **Remove**;
  - section **Background** photo; **Add logo** next to the title.
- **Chart menu** (⋯ on a chart): change the chart type, measure, sort, Top N, labels, color, title and caption.
- **Undo / redo:** `Ctrl+Z` / `Ctrl+Y`.

## 4. Filter and explore
- **Click** a bar or row to highlight that item everywhere. **Shift-click** adds it to the filter, and **double-click** shows only it.
- **Filter cards** you add (from **Add filter**):
  - a filter pane, dropdowns and buttons;
  - range and date-range filters;
  - value sliders;
  - **button bars**: you define each button (show a column, pick a member, Top N, over/under budget, clear).
- The **Filters** sidebar has search, sort, over/under budget, the measures shown, and the active filters with **Clear all**.
- **A filter covers the whole page:** filtering "Scope" in one section filters every section on that page that has Scope. Charts from tables without that field show *Not filtered by Scope*. Each page remembers its own filters.
- Totals are never recalculated. Readouts say what share of the **Grand Total** is showing.

## 5. Look and layout
- **Design** (`T`): pick a style, plus Colorblind-safe colors, density, corners and a background photo.
- **Layout** (`L`): Executive, Bento Grid, Table Boards, Story, Focus, Presentation (arrow keys; `Esc` to exit), Tabbed.

## 6. Check what was detected
**Review** (`R`) shows your sheet with each table outlined. You can:
- rename a table, hide it, or say it's not a table;
- change the header or total row;
- split or merge tables, or change a column's role;
- drag across cells to mark a table that was missed.

## 7. Share and save
- **Export:** a single `.html` file with only the dashboard (no buttons, logo bar or sidebar).
  - Viewers can filter but not edit.
  - It contains only the tables on your dashboard.
  - Add a filter card first if viewers should filter.
- **More** menu:
  - **Download all tables (.xlsx)**;
  - **Save view / Load view** (re-apply your layout to next month's file);
  - **Print / save as PDF**.
- Each data table has **CSV**, and each chart has **PNG**.

## Keyboard
`G` add charts · `T` design · `L` layout · `F` filters · `R` review · `E` edit · `Ctrl+Z / Ctrl+Y` undo/redo · `Esc` close
