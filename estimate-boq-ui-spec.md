# Estimate/BOQ Module — UI Design Contract
### Extends the existing `/farmpro` Vue 3 SPA (managefarmspro)

Companion to `estimate-boq-module-plan.md` (architecture/data model — approved). This document specs the screens, grounded directly in the SPA's existing design tokens, components, and interaction patterns — not a fresh visual language. Every reuse/extension/new-component call below is based on reading the actual current source (`style.css`, `AppSidebar.vue`, `AppIcon.vue`, `TabNav.vue`, `LineItemsTable.vue`, `FilterCombobox.vue`, `RecordPicker.vue`, `ConfirmDialog.vue`, `StatusBadge.vue`, `WorkEntryView.vue`, `WorkDetailView.vue`, `GenerateInvoiceView.vue`, `router/index.js`), not assumed.

No GSD project scaffold exists for this app, so this was written directly rather than through `/gsd:ui-phase`'s researcher/checker pipeline (by explicit choice, to move faster) — the "Design Review" section at the end self-checks the same dimensions that pipeline would have gated on.

---

## 1. Navigation

New sidebar entry in `AppSidebar.vue`'s `nav` array, between Works and Generate Invoice — matches the real workflow order (quote → execution → billing):

```js
{ to: "/estimates", label: "Estimates", icon: "layers" }
```

`layers` is unused elsewhere in the nav (dashboard/users/plot/work/invoice/file are all taken) and reads reasonably as "a stack of costed items." No sidebar visual changes beyond the one new entry — existing active-state/hover treatment applies unchanged.

New routes in `router/index.js`, following the exact existing pattern (flat routes, `meta.title` drives the topbar title):

```js
{ path: "/estimates", name: "estimates", component: EstimateListView, meta: { title: "Estimates" } },
{ path: "/estimates/new", name: "estimate-new", component: EstimateEditorView, meta: { title: "New Estimate" } },
{ path: "/estimates/:id", name: "estimate-detail", component: EstimateEditorView, meta: { title: "Estimate" } },
{ path: "/category-templates", name: "category-templates", component: CategoryTemplateListView, meta: { title: "Category Templates" } },
{ path: "/category-templates/:id", name: "category-template-detail", component: CategoryTemplateEditorView, meta: { title: "Category Template" } },
```

Category Templates is master data staff edit rarely — not in the primary sidebar nav. Reached from a small "Manage Category Templates" link inside the Estimate Editor's category picker area (where it's actually needed), consistent with how this app keeps rarely-used management screens out of primary nav.

---

## 2. StatusBadge extension

`StatusBadge.vue`'s `styleMap` needs four Estimate states added — reusing existing semantic colors, no new tokens:

```js
Draft: "bg-info-soft text-info",           // already exists (shared with Work's Draft)
Sent: "bg-warning-soft text-warning",      // new — awaiting client response, pending
Approved: "bg-positive-soft text-positive",// new — reuses the "accepted/good" color already used for Active/Paid/Submitted
"Converted to Project": "bg-primary-soft text-primary", // new — distinct "final, locked" treatment
```

`Draft` collides harmlessly with Work's existing Draft entry (same color is correct — same meaning). No other doctype's status vocabulary needs to change.

---

## 3. Screens

### 3.1 Estimate List (`EstimateListView.vue`)

Directly mirrors `InvoiceHistoryView.vue`'s established shape: sticky header (title + "New Estimate" primary button), Search + Status filter row, table below.

- Header: "Estimates" / "Quote and cost one-off landscaping and plantation projects." + primary button → `/estimates/new` (same treatment as "Generate Invoice" button on Invoice History).
- Filters: Search (client name / estimate ID), Status (`FilterCombobox`, options = the 4 statuses). No Category filter in v1 — Works page's filter-cleanup lesson (fewer, well-used filters beat a filter row that outgrows its own screen) applies here too; add one later only if actually requested.
- Table columns: Estimate ID, Client (customer name, or `client_name` if no Customer linked yet), Category, Area, Status (`StatusBadge`), Grand Total (`formatCurrency`), Created. Row click → `/estimates/:id`.
- Empty state: "No estimates yet. Create one to quote a landscaping or plantation project." — matches the existing empty-state tone (e.g. Works page's "No works logged for this plot yet.").
- Sticky header on scroll, same pattern as Invoice History (`sticky top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-6 pb-4 bg-background border-b border-border`).

### 3.2 Estimate Editor (`EstimateEditorView.vue`) — create and edit, same component

The centerpiece. Structure follows `WorkEntryView.vue`/`WorkDetailView.vue`'s established shape almost exactly: a `lg:grid-cols-3` layout, `lg:col-span-2` main column of stacked cards, sticky summary sidebar in the third column.

**Header** (mirrors `WorkDetailView`'s draft/submitted action-button pattern):
- Back button, title (client name once set, else "New Estimate"), `StatusBadge`.
- **Superseded — lifecycle model revised, see `estimate-boq-module-plan.md` Section 2 ("Lifecycle model, revised") for the full reasoning.** The 4-value Draft/Sent/Approved/Converted-to-Project status field is replaced by native `docstatus`/submit/amend; "Approved" and "Converted to Project" are computed display labels, not stored statuses, and "Sent" is dropped as a tracked value (it's an action — download/share the PDF — not a state). Status-appropriate action buttons, top-right, now map to:
  - **Before Create** (local, unsaved — no backend record yet): Save/Cancel act on local state only; a `Create` action does the first real insert (`docstatus 0`).
  - **Draft** (`docstatus 0`): `Save Changes` (secondary/outline, dirty-gated) + `Submit` (primary, opens `ConfirmDialog`, **labeled "Approve"** in the UI).
  - **"Approved"** (`docstatus 1`, no linked Farm Project): line items read-only (Frappe's standard submit-lock, not a custom guard) + `Convert to Project` (primary, opens `ConfirmDialog`) + `Amend` (secondary — Frappe's native amend: cancel + reinsert with `amended_from` set, **labeled "Revise"** in the UI, **only offered here and at "Converted to Project"**, not at Draft — see below).
  - **"Converted to Project"** (`docstatus 1`, a Farm Project's `estimate` field points at this record): fully read-only + a banner linking to the created Farm Project/Plot/Customer. **`Amend`/"Revise" must be blocked here** — a real edge case found by tracing Frappe's own link-protection code: `Farm Project` isn't submittable, so nothing in the framework stops cancelling an Estimate a Farm Project already references; this has to be enforced in application code instead. Matches this doc's original intent ("cannot be undone") — just re-grounded in the new model instead of a status check.
- **Placement, reconciled**: "Revise"/Amend was originally speced for Approved and Converted-to-Project only, not Draft — confirmed still correct under the new model too (Draft already has direct-edit via Save Changes; amending only makes sense once a doc is locked by submission).

**Card A — Estimate Details**: client fields (a toggle between free-text `client_name`/`location` and an existing-Customer `RecordPicker`, exactly the manual-link-not-auto-match approach already agreed), `plot` (`RecordPicker`, optional, same "existing land?" affordance), category (`RecordPicker` over Project Category templates), area inputs (value + unit `FilterCombobox`, or length×width — computed `area_sqft` shown read-only beside it), duration. "Apply Template" button appears once a category is picked.

**Card group B — Line Items, grouped by section**: sections are free text (per the plan's data-model fix, not a fixed Select), each rendered as its own collapsible card — same collapsible-header pattern as `WorkEntryView`'s Labor/Equipment/Material sections (icon + label + item count + subtotal + chevron), but the section list itself is dynamic instead of three fixed keys. Each section card:
- Header: editable section name, subtotal, a `discount_percent` field (section-level only, per the approved simplification), item count.
- Rows: item/description, `line_type` shown as a small tag (reusing the same small-badge visual treatment `LineItemsTable`/line-item tags already use elsewhere), quantity, uom, `rate` and `internal_rate` shown side by side (the editor is an internal-only screen, so both are always visible here — no toggle needed; only the generated client-facing documents in 3.4 hide `internal_rate`), amount, an override indicator (small dot/label when `is_override` is set), remove button.
- Add-row: same `RecordPicker` + qty/rate + Add-button pattern already built for Work Entry's line items, reusing the `useLineItemSections` composable extended for free-text section keys instead of the fixed labor/equipment/material keys, plus the new `internal_rate` field and section-level discount.
- `+ Add Section` at the bottom of the group, for sections not covered by the applied template.

**Card C — Cost Components**: `Project Cost Component` rows (seeded with Supervision + Consultation, more addable) — each row: name (small starter list pre-filled, freely editable/addable, matching the extensibility principle), Fixed/Percent toggle, value, computed amount (base = Cost Subtotal, already known at this point in the form). Same add/remove-row treatment as the line-item sections, just a shorter row shape.

**Card D — Profit & Tax**: Profit (Fixed/Percent toggle + value), Tax % (number input, default 18, editable).

**Sticky sidebar (Card E, `lg:sticky lg:top-24`, same as Work Entry's Budget Context card)** — the running total breakdown, styled exactly like Work Entry's `bg-primary text-primary-foreground` totals card:
```
Cost Subtotal
+ Supervision, Consultation, ...
Subtotal Before Profit
+ Profit
Subtotal Before Tax
+ Tax
Grand Total
```
Each line updates live as the form changes, same reactive-computed pattern already used for Work Entry's budget projection.

### 3.3 Category Template screens

**List** (`CategoryTemplateListView.vue`): simple table of the 14 categories — name, item count, activity count, last modified. No filters needed at this scale. Row click → detail.

**Editor** (`CategoryTemplateEditorView.vue`): header fields (name, description, default spacing/pit-size, default cost-component defaults), then two collapsible sections using the exact same add/remove-row pattern as the Estimate Editor's line items: "Standard Items" (item picker, `consumption_basis` Select, `consumption_rate` number, `is_manual` checkbox for placeholder lines like Design & Layout) and "Standard Activities" (activity picker, output override). Same visual weight as any other desk-style settings form in this app — no special treatment needed, this is low-frequency staff data entry.

### 3.4 Output documents (from an Approved or Converted estimate)

A "Documents" section on the Estimate Editor (visible once Approved) with three cards — Client BOQ, Client Quotation, Internal Costing Sheet — each with `Preview` and `Download PDF`, plus `Export Excel` on the BOQ and Costing Sheet. Directly reuses `GenerateInvoiceView.vue`'s existing preview-modal pattern (header/line-table/totals, Close + Download PDF), the one part of this whole module with a proven, working precedent already in this codebase — no new modal pattern needed.

---

## 4. Components — reuse map

| Component | Treatment |
|---|---|
| `RecordPicker` | Reused as-is — item/activity/customer/plot/category pickers throughout |
| `FilterCombobox` | Reused as-is — list-page filters, unit selects |
| `ConfirmDialog` | Reused as-is — every status transition (Send/Approve/Convert/New Revision) |
| `StatusBadge` | Extended (4 new style-map entries, Section 2) |
| `LineItemsTable` | Reused for any pure read-only display (e.g. Converted-to-Project's frozen view) |
| `TabNav` | Not used on the Estimate Editor itself (single scrolling page, like Work Entry) — available if the Documents area ends up needing its own tabs later |
| `useLineItemSections` composable | Extended, not duplicated — add free-text section keys (replacing the fixed labor/equipment/material keys), an `internal_rate` field per line, and section-level `discount_percent`. Estimate Editor, Category Template Editor, and (unchanged) Work Entry all share it |
| New: `CostComponentRow` pattern | Small addition alongside the composable — Fixed/Percent + value + computed-amount row, for the Cost Components card. Same visual language as existing rows, not a new design language |

No new visual primitives, no new colors, no new typography — every screen above is built from cards/tables/badges/pickers/dialogs that already exist in this app.

---

## 5. Copy

- Approve confirm: *"Approve this estimate? If this is a new client, a Customer and Plot record will be created automatically. If you've already linked an existing Customer or Plot, those will be used instead."*
- Convert confirm: *"Convert to a Project? This links the approved Customer and Plot, and locks this estimate from further edits. Use New Revision if you need to change anything after this."*
- Amend/"Revise": **superseded copy** — under the revised lifecycle model this is a real cancel-then-reinsert (the original *is* cancelled, not merely superseded-but-preserved), so a confirm dialog is actually warranted here now, unlike the earlier no-confirm assumption. The new record is genuinely a new docname (`EST-2026-00001-1`, Frappe's own amend-naming, confirmed live on this site). Recommended copy: confirm dialog *"Revise this estimate? This cancels EST-2026-00001 and creates EST-2026-00001-1 to continue editing. The original stays visible via its revision history."*; the amended record's banner reads *"Amended from {original estimate ID}"*, linking to it via `amended_from`.
- Empty section: *"No items in this section yet."*
- Error banners: same existing pattern app-wide — `e.messages?.[0] || e.message || "Failed to …"` in a `bg-negative-soft` block.

---

## 6. Responsive & accessibility

- Editor layout collapses `lg:grid-cols-3` → single column below `lg`, sidebar totals card drops its `lg:sticky` and simply renders at the bottom of the content flow on mobile — identical to how Work Entry already behaves, no new responsive logic needed.
- Section cards' add-row grids follow the same `grid-cols-12` → stacked-on-mobile breakpoints already established in Work Entry.
- Icon-only buttons keep `aria-label` (remove-row, clear-filter — matches existing pattern).
- Disabled action buttons always show *why* inline (e.g. Convert disabled with a reason), never just silently hidden — matches the existing Cancel Work pattern on Work Detail.
- Status is never color-only — `StatusBadge` already pairs a dot + color + text label everywhere.

---

## 7. Design decisions — APPROVED

1. **Sent-stage editability**: confirmed still-editable — editing at Sent is a revision, not a lock. `Save Draft` stays available at Sent. **Note under the revised lifecycle model**: "Sent" is no longer a tracked status at all — this decision's spirit carries forward as "Draft stays directly editable via Save Changes" (Sent was always just Draft with a PDF having been downloaded, never a separate lock state, which is exactly what motivated dropping it as a tracked value).
2. **Nested sections**: confirmed out of scope for v1 — flat, distinctly-named sections only ("Plants — Landscape Portion" as its own section, not a sub-group).
3. **Re-apply Template behavior**: confirmed additive-only — adds missing template rows (matched by `source_item`), never touches rows already marked `is_override`.
4. **Cost Component naming**: confirmed free-form — starter list (Supervision, Consultation) plus user-added named components, no fixed/constrained list.

---

## Design Review (self-check against the 6 dimensions a UI-SPEC pass normally gates on)

- **Layout**: every screen maps to an existing grid/card shape already proven in this app (Work Entry, Work Detail, Invoice History, Generate Invoice) — no novel layout invented.
- **Copywriting**: Section 5, written in the app's existing voice (plain, direct, states what happens — matches the Cancel Work / budget-exceeded confirm copy already shipped).
- **States & interactions**: all 4 statuses have explicit action sets and explicit disabled-state reasoning (Section 3.2, Section 6) — no undefined states.
- **Responsiveness**: Section 6, inherits Work Entry's already-working mobile behavior rather than reinventing it.
- **Accessibility**: Section 6 — aria-labels, non-color-only status, visible disabled-reasons.
- **Consistency with the design system**: Section 4's reuse map — zero new tokens, zero new component patterns beyond one small `CostComponentRow` addition justified by a genuinely new data shape (Fixed/Percent named charges) that doesn't exist elsewhere in the app yet.
