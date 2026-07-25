Problem: what someone is doing manually today
- Jon can't currently see how a batch of Jobs' total views break down by platform. The Jobs table has a formula field ("Total Views - FB IG YT LI") that blends Facebook + Instagram + YouTube + LinkedIn views into one number, but there's no way to see the relative split — e.g. "IG accounted for 61% of views this quarter" — without manually reading four separate lookup columns across many records and doing the math by hand. Airtable's native Chart element can't sum four different fields into one pie (it only aggregates one field grouped by category), so this needs a custom Interface extension.

Where it lives: base extension or interface element; which base, which page
- Interface element (custom Extension), placed on an Interface page in the KSU Marketing Projects base (appXWDg5duaDQfKP2).

Data in: which tables and fields it reads
- Base: appXWDg5duaDQfKP2 (fixed — single-base extension, not cross-base).
- Table and fields are NOT hardcoded. They're chosen through a Table Picker and a multi-select Field Picker in the extension's settings panel, stored via the Extension SDK's GlobalConfig so the configuration is shared and persists for everyone viewing the page.
  - Table picker: any table in the base.
  - Field picker: multi-select, filtered to number-producing field types (Number, Currency, Rollup, Formula, and Lookup where the underlying field is numeric — lookups may return arrays, so sum each field's array before adding it to that field's total). Minimum 2 fields; recommend capping around 8 for a readable pie, but don't hard-block above that.
- Defaults to pre-fill the pickers with on first setup (still solves today's problem, just editable from here on):
  - Table: Jobs (tbldpOEVX87oUkUIq)
  - Fields: Facebook Views (fldFOKFhUDISnnwhP), Instagram Views (fldTumIG2P6k9xAuT), YouTube Views (fldstdM7Oa8SCgmA7), LinkedIn Views (fldutpvlFqmkgnDXk) — Vimeo Views (fld6H8A1LfAFXGBD0) exists on the same table but isn't included by default, matching the existing "Total Views - FB IG YT LI" formula field's scope.
- Record source: the records visible in a specific saved view of whichever table is currently selected (view picker — see Interactions). Changing the table resets the view picker to that table's views.
- Aggregation: for each selected field, sum its value(s) across every record in the selected view, then chart each field's total as one pie slice.

Data out: what it writes back, if anything
- Nothing. Read-only — this extension does not create, update, or delete any records or fields.

Interactions: buttons, pickers, filters, selection behavior
- Settings panel (gear icon or similar, standard Extension SDK settings pattern): Table Picker, multi-select Field Picker (scoped to the chosen table's numeric-compatible fields), and View Picker. Changes save immediately via GlobalConfig, so the whole team sees the same chart config, not a per-viewer setting.
- View picker: dropdown to choose which view of the selected table supplies the record set (defaults to the view active when the extension loads, matching how the native Chart element works). This avoids hardcoding one view and lets Jon reuse it for different date ranges/teams later.
- Hover/tap on a slice: show the platform name, its raw view total, and its % of the combined total.
- Legend: platform name + color swatch, always visible (not just on hover).
- Live updates: use the Interface Extension SDK's live record-fetch hooks so totals recalculate automatically when underlying data changes — no manual refresh button needed for v1.

Who uses it: and what permission level they have
- Viewers: anyone with access to the Interface page (Read-only Interface collaborators, e.g. DPAE/UCM stakeholders) — they see the chart and legend, but the settings panel (table/field/view pickers) is hidden or disabled for them, per the Extension SDK's standard permission check.
- Editors/Creators (Jon and other base editors): can reposition/resize the element, and — new — open the settings panel to change which table, fields, and view feed the chart, same permission level Airtable already requires to edit an Interface.

Out of scope for v1: be explicit, this is what keeps the first build shippable
- No drill-down (clicking a slice to open the underlying filtered record list) — v2 candidate.
- Fields must come from a single table at a time — no combining fields from two different tables into one chart.
- No per-viewer configuration — table/fields/view are shared across everyone viewing the page (via GlobalConfig), not saved individually per person.
- No renaming or relabeling slices beyond the source field's own name.
- No date-range filtering built into the extension itself — relies entirely on whichever view is selected as the source.
- No historical trend/over-time charting — single point-in-time snapshot on load.
- No export (image/CSV download) of the chart.
- No write-back of computed totals to Airtable (e.g. no caching sums into a helper table).