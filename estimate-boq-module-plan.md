# Estimate/BOQ Module — Architecture & Planning Deliverable
### managefarmspro / Philosan Farm Management

## Context

managefarmspro currently runs Philosan's ongoing farm/plot MAINTENANCE workflow (Owner/Customer, Plot, Work, Collated Plot Invoice). Philosan separately does one-off PROJECT work (landscaping, plantation, irrigation installs) for clients, priced today by hand in spreadsheets — slow, error-prone, doesn't scale. The client wants this brought into managefarmspro as a first-class module and asked, explicitly, for **planning only**: no code, no doctypes, no UI, in this pass. This document is that planning deliverable — investigation findings, an architecture recommendation, a proposed data model, the calculation-engine design, all 12 open questions now resolved with the client directly, and a high-level phased roadmap. Design (separate tool) and implementation (later) both come after this is reviewed.

Note on process: requested via `/gsd-ultraplan-phase` (offload planning to a cloud session). That skill needs a GitHub repo — `apps/managefarmspro` has one (`Beveren-Software-Inc/managefarmspro`), so that's not blocking — but this ran under interactive Plan Mode, which doesn't permit launching remote/cloud sessions. The investigation + planning below was done locally instead (2 Explore agents + 1 Plan agent, all read-only, plus a live Q&A round with the client resolving every open question), producing the same deliverable ultraplan would have. True cloud ultraplan execution, if still wanted, is a separate follow-up outside Plan Mode.

Two real reference documents were read directly: a sample BOQ (multi-section, item-level, ₹267,680 grand total) and a sample client Estimate/Quotation (Philosan letterhead, category-level only, same ₹267,680 total) — confirming these are two views of one dataset, not independently maintained documents.

---

## Investigation Findings (confirmed against the actual codebase)

**Existing managefarmspro architecture:**
- Doctypes: Cluster, Owner (unused/empty — Customer-side already routes through real ERPNext Customer, 150 records), Plot, Plot Location, Plot Supervisor, Work, Work Item. Child tables: Equipment Child, Invoice List (dead/unused), Labor Child, Link Plot Cluster, Link Plot Owner, Material Child, Partner, Work Child.
- `Plot.supervision_charge` is percent-only, applied as `total_cost * supervision_charge / 100` — the precedent this module extends into a real Fixed/Percent toggle.
- `Work`'s labor/equipment/material child tables each reference a real `Item` (via `Item Group` = Labor/Equipment/Raw Material), priced from `Item Price` where `price_list = "Standard Selling"`. `Work.total_cost` is a sum of child `total_price` — no independent server recompute, an existing trust model.
- `Sales Invoice Item.custom_work_id` (Link to Work) is the one custom field tying invoicing to Work — Frappe's built-in `LinkExistsError` cancel-protection already uses it, no custom code needed.
- `hooks.py`: only `doc_events` on Work, one `doctype_js`, `website_route_rules` for the Vue SPA. No fixtures, no scheduler_events.

**PDF pipeline (`collated_plot_invoice.py` → `download_invoice_pdf`) — confirmed by reading the template directly:**
- Builds/inserts/submits a Sales Invoice, assembles a context dict, `frappe.render_template("managefarmspro/templates/collated_invoice.html", context)` → `frappe.utils.pdf.get_pdf(html)` → PDF written to `private/files/`, `File` doc created and linked.
- Company name/address/phone/email and logo (`<img src="/files/philosan-logo.png">`) are **100% hardcoded literal markup** in the template (verified reading lines 140-167) — not sourced from any Company/Letter Head record.
- `frappe.utils.money_in_words()` already used there (line 264) — directly reusable for the new Quotation's "Amount in Words."
- No signatory-block markup exists today.
- Frappe's built-in Print Format doctype exists in this app (one record) but is confirmed unused in any code path — the real, only production PDF mechanism is the custom Jinja + `get_pdf()` approach.
- DB confirmed: `tabCompany` has one row (`default_letter_head = NULL`), `tabLetter Head` has **zero rows** — nothing to reuse there.

**ERPNext/Frappe doctype reuse assessment:**
| Doctype | Verdict | Why |
|---|---|---|
| BOM | Forced fit — reject | Built around manufacturing an Item via Stock Ledger/Warehouse/routing/Work Order. Wrong lifecycle for "for X sqft use Y kg." |
| Quotation | Forced fit as a whole doctype | Drags in Sales Order/Opportunity/CRM assumptions. Its `Quotation Item` pattern and built-in `money_in_words`/Terms-and-Conditions link are worth taking as inspiration only. |
| Project / Task | No fit | Project's costing is assembled *from* linked Timesheets/Sales docs — wrong direction. Task is internal time-tracking, no BOQ slot. |
| Item / Item Group / Item Price | Genuine fit — reuse directly | Exactly the mechanism already powering Work's line items. New Item Groups (Plants, Manure & Inputs, Irrigation Materials, Structure Materials, etc.) slot straight in. |
| Any "Estimate"/"BOQ" doctype | Doesn't exist | Confirmed via grep — new doctype required. |

---

## 1. Architecture Decision — APPROVED

**Build inside managefarmspro as a new module, not a separate Frappe app.** managefarmspro is already Philosan-specific and single-tenant in spirit. A second app only pays off with independent versioning, multi-client reuse, or a different upgrade cadence — none apply here.

**Frontend: extend the existing Vue SPA, confirmed.** The Estimate/BOQ module's screens (Estimate list/detail, category template management, approval actions, BOQ/Quotation preview) belong in the same `/farmpro` SPA already serving Plot/Work/Customer/Invoice — not a separate Desk-only UI, and not a second frontend. This is a UI-scope decision, not a data-model one; the actual screen designs are still out of scope for this document (separate design-tool phase, per the original brief) — noting it here so the roadmap and the later design phase both start from the same assumption about where these screens live.

---

## 2. Data Model

Resolved during Q&A: this is **two doctypes, not one** — `Estimate` (the quote/costing stage, versioned) and `Farm Project` (a thin execution shell created only once an Estimate is formally converted). This follows directly from the client's own answers: Draft → Sent → Approved → Converted-to-Project are states on the *quote*, not the execution record; a revision is "a new dated Estimate record" (so Estimate must be the versioned entity); and Plot/Customer get created at Approval, before conversion even happens.

**Naming note, found at implementation time**: named `Farm Project`, not `Project` — ERPNext already ships its own `Project` doctype, and Frappe doctype names must be globally unique per site regardless of app/module. The plan's own investigation (Section: ERPNext doctype reuse assessment) correctly ruled ERPNext's Project out as a fit, but never flagged that the *name* itself would collide even for an unrelated, purpose-built doctype. Caught during migration, before it ever touched the database.

### Master Data

**Material Master → not a new doctype.** Extend `Item`/`Item Group`/`Item Price` with new Item Groups (Plants, Manure & Inputs, Irrigation Materials, Structure Materials, etc.), mirroring Work exactly.

**Activity Master (new: `Activity`)** — `activity_name`, `unit`, `labour_type` (**free text, not a fixed Select** — real Philosan estimates distinguish "Lady labour" from "Gents labour" at a 2x day-rate difference, not just Skilled/Unskilled; purely descriptive, nothing in the costing sequence branches on it, so a hardcoded 2-value enum would just misfit real practice the same way the original fixed `section` field did), `standard_output`, `labour_days_formula`, optional `machinery_requirement`, `standard_duration`, `category` (link).

**Machinery Master (new: `Machinery`)** — `machine_name`, `rate_type` (Per Hour/Per Day), `standard_rate`.

**Project Category Template (new: `Project Category`)** — one record per category (14 total). `category_name`, `description`, default spacing/pit-size, default `supervision_type` (Fixed/Percent) + value. Child tables: `Category Template Item` (item, consumption rate/basis, uom, `is_manual` flag) and `Category Template Activity` (activity, category-specific output override). **Confirmed editable by Philosan staff in the desk UI** — standard Frappe role-based permission (e.g. an "Estimator"/"Manager" role) is sufficient; no separate "propose a change" workflow needed. The `is_manual` flag on template rows lets standard no-formula lines (Design & Layout, the Labours block) get copied automatically into every new Estimate as manual placeholder lines needing a value each time — **confirmed this is a permanent, first-class concept**, not a temporary fallback for formulas that don't exist yet.

### Transactional Data

**Estimate (new doctype)** — the quote/costing record, and the thing all three output documents are generated from. **Revised model (superseding the earlier custom `status` field design below — see "Lifecycle model, revised" for the full reasoning):**
- `client_name`/`location` (free text — **confirmed a real Customer is not required to create an Estimate**, for prospects), `customer` (nullable Link, auto-populated at Approval — see workflow below), `plot` (nullable Link, auto-created at Approval), `category` (Link to Project Category), area fields (`area_value`+`area_unit` with conversion, or length×width), `computed_area_sqft`, `duration`.
- `is_submittable: 1`, standard `docstatus` (0 Draft / 1 Submitted / 2 Cancelled) — **no custom `status` field.** "Approved" and "Converted to Project" are computed UI display labels (see below), not stored values.
- `amended_from` (Link to Estimate, `no_copy`/`read_only`/`search_index` — mirrors `Work.json`'s existing field exactly) — **replaces `revision_number`/`supersedes`.** A revision is Frappe's native amend (cancel + reinsert with `amended_from` set), not a hand-rolled clone field pair.
- `Project Line Item` child table (unified table, not several parallel ones — see rationale below), each row: `section` (**free text, not a fixed Select** — a category template can pre-fill suggested sections, but nothing enforces a closed list; real historical BOQs nest sub-groups under Plants, put Transportation inside Plants instead of standalone, and vary section sets project to project — see validation note below), `line_type` (Material/Labour/Machinery/Manual/Overhead), `source_item` (nullable Link), `description`/`specification` (free text, for things like "3 in back, 2+1 in front"), `quantity`, `uom`, `rate`/`amount` (customer-facing, what the client is charged), `internal_rate`/`internal_amount` (**new** — the company's own anticipated/purchase cost for that line, internal-only, never shown on client-facing BOQ or Quotation — needed for the Internal Costing Sheet's profit-per-line analysis; see validation note), `is_override`, `is_manual` — no per-line discount field, see below.
- `Estimate Section Discount` (new light child table) — `section`, `discount_percent`, one row per section that needs one. **Confirmed: section-level discounts only** — the client simplified this from the original per-section-and-per-line proposal, since per-line discounting on top of section discounting was more control than actually needed. Applied against that section's subtotal directly, no line-level interaction to sequence.
- **`Project Cost Component` (new child table, revised design)** — `component_name` (Supervision, Consultation, and any future ones — Transportation, Mobilization, Insurance, Permits, Contingency, etc.), `charge_type` (Fixed/Percent), `value`, computed `amount`. Seeded with Supervision + Consultation rows per Estimate by default. **This replaces separate named fields** (an earlier draft of this plan had `supervision_type`/`consultation_charge_type` as fixed fields) — per the client's finalized costing design, every project cost component must be addable "without modifying the core calculation engine," which a fixed-field approach can't satisfy but a generic component table does: adding a new charge type later is a data row, not a schema change.
- `profit_margin_percent` or `profit_margin_amount` (Fixed/Percent — **confirmed whole-project, applied once, after all cost components**); `tax_percent` (**confirmed: single editable field, default 18**, not GST-slab logic); overhead breakdown (accommodation/food/site visit/misc, or folded into `Project Cost Component` rows too, per the same extensibility principle); computed totals at each stage (Cost Subtotal, Subtotal Before Profit, Subtotal Before Tax, Grand Total — see Section 3).

**Farm Project (new doctype) — kept deliberately thin.** Created only when an Estimate transitions Approved → Converted-to-Project (a distinct, later action from Approval itself — see workflow below): `estimate` (Link back — the source of truth for all costing/line-item detail), `customer`, `plot`, `category`, a simple execution status. **It does not duplicate the line-item table.** Reasoning: nothing in the original requirement asks for construction-phase execution tracking (progress %, actual-vs-estimated cost) — that's out of scope of what was asked for (Estimate/BOQ generation). Once a Farm Project's Plot exists, ongoing on-ground work naturally flows through the *existing* Work mechanism against that Plot, exactly like maintenance work does today — closing the loop with zero new execution-tracking machinery. Estimate remains the permanent, versioned record of what was quoted; Farm Project is just the registry entry connecting an accepted quote to the Plot where real work now gets logged. *(This is a deliberate refinement beyond a literal reading of "Converted-to-Project" — flagging it plainly since it's a design choice, not something explicitly asked for either way.)*

**Why one unified `Project Line Item` table, not several:** the real sample BOQ mixes formula-derived rows (plants, pits, manure) with pure manual lump-sum rows (Design & Layout, Labours, Irrigation materials, Transportation, Supervisor, Consultation) in the same sections. Splitting into separate Plant/Activity/Machinery/Manual tables multiplies output-generation code for no real benefit — one table with `line_type` is simpler to total, group, and override, and is what all three output documents read from.

### Lifecycle model, revised — native docstatus/amend instead of a custom status field

**Superseded.** The original design (a 4-value `status` Select: Draft/Sent/Approved/Converted-to-Project, plus hand-rolled `revision_number`/`supersedes` fields for versioning) is replaced by Frappe's own submittable-doctype mechanics — the exact pattern already live in this app for `Work` (confirmed by reading `work.json` directly: `is_submittable: 1`, an explicit `amended_from` field, no special permission overrides needed). Reasoning: the custom status field duplicated what `docstatus` already gives for free (submit, cancel, amend, permissions), "Approved" and "Converted to Project" were never really two different backend states — both are just "submitted," differing only in whether a Farm Project happens to be linked — and hand-rolled revisioning duplicated what `amended_from` + Frappe's native amend-naming already do.

**The model:**
1. **Before the record exists** — nothing persisted. The category-template pick, client info, area/duration, and the generated line items/costing all live in local UI state only (the standard "unsaved new document" pattern, not something this app had already built elsewhere — checked, and it hadn't). Save/Cancel at this stage act purely on local state, no backend calls.
2. **Create** — the first real backend write: `frappe.client.insert`, landing at `docstatus = 0` (Draft).
3. **Draft (docstatus 0)** — fully editable. BOQ/Quotation/Costing Sheet preview and download available here. "Send to client" is just an action (download/share the PDF) — not a tracked status, and not a state transition.
4. **Submit** (`frappe.client.submit`, `docstatus 0 → 1`) — **displayed to the user as "Approved."** Auto-create is a **fallback only, never a default path**: if the estimator already linked an existing `customer`/`plot` (the right move for an existing maintenance client), Submit leaves those alone; auto-creation only fires for whichever of `customer`/`plot` is *still* unlinked, for genuinely new prospects. **No automatic fuzzy-matching against existing Customers** — confirmed with the client: manual linking is preferred, specifically to avoid mis-attaching a new project's costs to the wrong existing customer's billing history. Once submitted, line items lock (Frappe's standard submit-lock, not a custom guard).
5. **Amend** (client-side: cancel the submitted doc, then insert a new one with `amended_from` set to the cancelled doc's name) — how a client-requested change after Approval gets handled. The amended record is a **new docname** (Frappe's own naming convention, confirmed by reading `naming.py`: `-1`, `-2`, ... appended to the original — this site's `Document Naming Settings.default_amend_naming` is `"Amend Counter"`, confirmed live, so this suffix behavior is actually active, not just a theoretical default), still displayed as **"Approved"** once it's submitted again. History stays visible via `amended_from`.
6. **Converted to Project** — a **display-only** label, computed as `docstatus === 1 AND a Farm Project exists with estimate == this Estimate` (live reverse lookup on `Farm Project`, not a cached field — consistent with "don't duplicate data" elsewhere in this plan). Creating the Farm Project is the only real action here; nothing on the Estimate record itself needs to change.

**Real edge case, found by tracing Frappe's own link-protection code, not anticipated when this model was proposed:** `Farm Project` is not a submittable doctype, so its `docstatus` is always `0`. Frappe's `check_if_doc_is_linked` (in `delete_doc.py`) only blocks cancelling a document if the thing linking to it is itself *submitted* — so nothing in the framework stops amending (cancelling) an Estimate that already has a Farm Project pointing at it. Left unhandled, "Converted to Project" would be silently amendable, leaving a live Farm Project referencing a cancelled source Estimate. **Required guard: block Amend once a linked Farm Project exists** — enforced in application code (both the JS data layer and the UI), not by the framework. This preserves the original plan's own language that Converted-to-Project "cannot be undone," just re-grounded in the new model instead of a status-field check.

**Data migration note:** the already-built Estimate doctype currently has a real `status` field with real data in it (seeded + live-tested records). Moving to `docstatus` needs a one-time mapping when this change is actually implemented: `Draft`/`Sent` → docstatus 0, `Approved`/`Converted-to-Project` → docstatus 1 (with the Converted-to-Project ones already correctly having a Farm Project linked, so the computed label still resolves correctly post-migration). Simple, but a real step, not automatic.

**Open, not yet decided:** whether a standalone "Cancel Estimate" (abandon, no replacement — `docstatus 0/1 → 2` with no follow-up amend) should be exposed as its own UI action distinct from Amend. Both use the same primitive; Desk itself exposes them as two separate buttons because they represent different intents.

**Architectural implication for the already-built Setup/Builder split:** Setup's final step currently *inserts* a real Draft record and hands its id to Builder via the URL — that's precisely the step 1→2 handoff this revised model removes (nothing should be persisted until an explicit Create). There's no id to route to before that point. The clean fix is for `/estimates/new` to render the Builder view itself, in a "local preview" mode with no backend-loaded doc — the 3-step wizard becomes Builder's own pre-Create phase (or a tightly-coupled first screen feeding a shared in-memory store) rather than a separately-routed screen connected only by a saved record. This is a real merge of two already-built screens, not a small edit to either one.

**Overrides — no separate doctype.** `Category Template Item`/`Category Template Activity` rows are copied into a new Estimate's `Project Line Item` table at template-apply time (snapshot, not live reference). Edits flip `is_override`. Master records are never touched by Estimate-level edits — true by construction.

### Forward-compatibility check — future Project budget tracking (verified now, not built now)

Checked whether today's thin Farm Project design blocks a later phase where Works logged against a Farm Project's Plot get tracked against that Farm Project's approved budget (Estimated Cost vs. Actual vs. Remaining, the same shape as Plot's `monthly_maintenance_budget`/`total_amount_spent`/`maintenance_balance`, scoped per-Farm-Project instead of per-month). This is a compatibility check only — nothing below is being built in this phase.

- **Filtering Work by Plot alone will not be enough later, and this is a real gap, not a hypothetical one.** A single Plot can outlive one Project (a landscaping Project now, an expansion Project next year) and continues taking ordinary maintenance Work indefinitely after a Project's execution wraps up. `Work.plot == Project.plot` can't distinguish "work that belongs to this Project" from "work that belongs to a different Project on the same Plot" or "routine maintenance work, unrelated to any Project." A future per-Project rollup needs Work tagged to a Project directly, not inferred through Plot.
- **Recommendation: add one nullable `farm_project` (Link to Farm Project) field to `Work` now**, at the same time Phase 3 creates the Farm Project doctype — inert, nothing populates or reads it yet, zero behavior change. This is cheap specifically because it's added *before* Work volume against Farm-Project-linked Plots starts accumulating; done later, it becomes a real backfill/migration problem (best-effort guessing which historical Work rows belong to which Farm Project from plot+date-range overlap, with genuinely unresolvable cases wherever Farm Projects/maintenance overlap in time on the same Plot).
- **Explicitly not doing now**: no auto-population logic on Work (e.g. inferring "current open Project for this Plot" at Work-creation time), no new `doc_events`, and no budget-cache fields added to Project itself (`total_amount_spent`-style). The field-vs-cache distinction is deliberate: an empty Link field is harmlessly inert, but a cached total with no computation logic behind it yet would display as a misleading zero — the wrong kind of "added now." Both the auto-population logic and the cached rollup fields are natural work for whichever future phase actually builds this tracking.
- **Confirms the rest of the design already supports this cleanly**: Estimated Project Cost reads live off `Project.estimate → grand_total_inc_tax`, no new field needed. Actual cost is `SUM(Work.total_cost WHERE Work.project = X AND Work.docstatus = 1)` once the field above exists. Remaining balance is the difference — no other schema gap found.
- **APPROVED**: this is the one point in this whole plan that touches `Work.json` — a file called out elsewhere in this project as sensitive/protected. Purely additive (one nullable field, nothing wired to it), and explicitly signed off now rather than riding in as a side effect of building Farm Project.

### Real-data validation (Asha project — historical BOQ + invoice)

Checked the model against a real historical Philosan job (not just the original 2 samples), specifically to stress-test the costing sequence and data model — not to force the system to reproduce every arithmetic quirk of a manually-maintained spreadsheet. These documents are inherently inconsistent (see next section); the goal was catching structural gaps, not chasing exact number matches.

- **Confirms the costing sequence works on a real number**: Supervision (₹7,270) on this job is exactly 20% of Cost Subtotal (Plants + Labour + Materials = ₹36,350) — a clean match to the finalized Cost Subtotal → Supervision(% of Cost Subtotal) mechanism, no change needed.
- **Real gap found — dual pricing per line.** The historical BOQ carries a "Customer" price/amount *and* a separate "Company Anticipated" price/amount per line, side by side — exactly the profit-per-line visibility the Internal Costing Sheet is supposed to provide, but `Project Line Item` only had one `rate` field. Fixed above: added `internal_rate`/`internal_amount`, internal-only, never rendered on the client-facing BOQ or Quotation.
- **Real gap found — `section` can't be a fixed Select.** This job's BOQ nests "Landscape Portion" and "Plantation (Behind the house)" as sub-groups under Plants, puts Transportation inside the Plant section rather than standalone, and has no Design or Irrigation sections at all — a different section shape than the original sample. Fixed above: `section` is free text, template-suggested but not enforced.
- **Confirms the manual/override path is the norm, not the exception**, for a large share of real BOQ lines (specific plants, specific customer-requested quantities, no formula behind most rows) — no data-model change needed, since `is_manual`/free-add-any-line was already supported, but this raises its priority for the later UI-design phase: the manual-add flow needs to be as fast and first-class as the template-generate flow, not a secondary path.
- **Not chasing**: the BOQ's "Company Anticipated" grand total (₹42,050) doesn't cleanly reconcile against its own visible line items in this export, and the invoice shows 0% tax despite being titled "Tax Invoice." Both are just artifacts of a hand-maintained spreadsheet with inconsistent habits across jobs — not something the system should try to replicate. The already-agreed logical rules (Section 3's sequence, the editable tax field defaulting to 18% but allowing 0) remain the source of truth; these documents inform gaps in *structure*, not exact arithmetic to match.

---

## 3. Calculation Engine

**Formulas and rates are data, not code.**

- Each `Category Template Item` row carries `consumption_rate` + `consumption_basis` (Select: Per Plant / Per Pit / Per Sqft / Per Running Foot / Fixed Quantity) — covers the client's stated formulas without an open-ended `eval()` mechanism (a real security/maintainability tradeoff, flagged rather than silently decided).
- `Activity.standard_output`: Labour Days = Total Quantity / Standard Output is one fixed Python function; the rate varies by record, the formula shape is fixed code.
- Plant Quantity = Area / (Row Spacing × Plant Spacing) is likewise one fixed formula, fed by per-category (or per-Estimate-overridden) spacing values.
- **Recalculation is server-side**, mirroring Work's existing pattern, and override-aware: recalculating on an area change skips any line flagged `is_override`, so overrides never get silently clobbered.
- Changing a standard rate next year is a desk-UI edit to one `Category Template Item` record — zero code deploy.

### Costing sequence — finalized by the client, replaces the earlier proposed version

Linear, no circular dependencies. Total project cost first, then profit once, then tax last.

**Step 1 — Cost Subtotal** = Material + Labour + Machinery + Overheads − Discounts (section-level only). The actual cost of executing the project, before any service charges or profit.

**Step 2 — Subtotal Before Profit** = Cost Subtotal + every `Project Cost Component` row (Supervision, Consultation, and any future ones — each independently Fixed or % **of Cost Subtotal**, not chained off each other). Supervision and Consultation are cost components here, not profit.

**Step 3 — Subtotal Before Tax** = Subtotal Before Profit + Profit (Fixed or % of Subtotal Before Profit). Profit is applied exactly once, after all project costs are known.

**Step 4 — Grand Total** = Subtotal Before Tax + Tax (% of Subtotal Before Tax, default 18%, editable). Tax is always last.

```text
Materials + Labour + Machinery + Overheads − Discounts
──────────────────────────────
Cost Subtotal
+ Supervision + Consultation + (future components)
──────────────────────────────
Subtotal Before Profit
+ Profit
──────────────────────────────
Subtotal Before Tax
+ Tax
──────────────────────────────
Grand Total
```

| Component | Type | Calculation base |
|---|---|---|
| Material / Labour / Machinery | Cost | Line items |
| Overheads | Cost | Configured amount |
| Discounts | Deduction | Section |
| Supervision, Consultation, future components | Cost | Fixed amount or % of **Cost Subtotal** |
| Profit | Markup | Fixed amount or % of **Subtotal Before Profit** |
| Tax | Tax | % of **Subtotal Before Tax** |

Design principles carried into the engine: every calculation has exactly one defined base; the sequence is linear, never circular; Supervision/Consultation are costs, not profit; profit is applied once, after all costs; tax is always final; the model is extensible — new cost components are `Project Cost Component` rows, never a core-engine change; each component is independently Fixed-or-Percent against its own defined base.

**Rounding:** confirmed independent rounding drift between the BOQ and the Quotation totals is acceptable, tolerance under ₹100 — no strict reconciliation requirement.

---

## 4. Output Generation — Three Documents, One Dataset (the Estimate)

**Recommendation: extend the existing custom-Jinja + `get_pdf()` pattern**, not Frappe's Print Format/Print Designer — the Print Format record in this app is confirmed dead code; the real, proven mechanism is `collated_invoice.html` + `render_template` + `get_pdf`.

- **One shared context-building function** (`get_estimate_costing_context(estimate)`) assembles grouped/subtotaled line items, category rollups, the full costing sequence from Section 3, discounts, tax, profit, supervision, consultation — once. All three documents read from it.
- **Three Jinja templates**: `internal_costing_sheet.html` (full detail, showing both `rate`/`amount` and `internal_rate`/`internal_amount` side by side per line for real profit-per-line visibility — matches the dual-pricing pattern confirmed against a real historical BOQ, internal-only), `client_boq.html` (per-line, grouped by section with subtotals, `internal_rate`/`internal_amount` never rendered — matches the real sample BOQ), `client_quotation.html` (one row per section, amount in words, terms, signatory — matches the real sample Estimate).
- Excel export from the same context dict.

**Letter Head — flagged decision, recommendation (A): create a proper Letter Head record** (logo, header/footer HTML), referenced via `get_pdf`'s header-html option. Standard, editable without a deploy, consistent across all new templates. Alternative (B) is continuing the hardcoded-template approach matching existing precedent — cheaper now, costlier every time the brand/address changes. Recommendation stands: (A), since this module's whole point is a formal, signed, letterhead-branded client document.

---

## 5. Customization/Override Layer

"Start from Miyawaki Plantation template, then override 3 things":
1. On Estimate creation (or an explicit "Apply Template" action), the system copies the selected `Project Category`'s `Category Template Item`/`Category Template Activity` rows into the Estimate's own `Project Line Item` table — a snapshot, not a live reference. Rows flagged `is_manual` at the template level (Design & Layout, Labours) come across as manual placeholder lines needing a value.
2. User edits quantity/rate/spacing-derived values, or adds new manual lines. Edited rows get `is_override = 1`.
3. Recalculation skips overridden rows.
4. A wholly custom plant/item/activity is just a new `Project Line Item` row.
5. Master `Project Category`/`Activity`/`Item` records are never written to by Estimate edits.
6. A fully custom, no-template Estimate is simply one where no template was applied.

---

## 6. Resolved Decisions (previously open questions — answered directly by the client)

1. **Project↔Plot**: not mandatory at creation; Plot is auto-created at Approval only as a fallback, if the estimator hasn't already linked an existing one.
2. **Customer prerequisite**: not required — Estimate can hold bare `client_name`/`location`; Customer auto-created at Approval only as a fallback. Existing-client estimates should be linked to the real Customer/Plot manually by the estimator — no automatic fuzzy-matching, to avoid mis-attaching a new project to the wrong existing customer.
3. **Category Templates**: editable by Philosan staff in the desk UI.
4. **Manual lines**: permanent first-class concept — certain categories (design, complex mixed labour) are always manual by design, not just a stopgap.
5. **Tax**: single editable percentage field, default 18%.
6. **Profit margin**: whole-project only.
7. **Consultation charge**: per-project Select (Fixed/Percent); if Percent, based on Cost Subtotal (finalized costing sequence, Section 3 — supersedes an earlier draft's "total cost minus tax minus supervision" reading, which the client replaced with a cleaner linear sequence).
8. **Supervision**: per-project Select (Fixed/Percent), based on Cost Subtotal, extending Plot's percent-only precedent. Modeled with Consultation as `Project Cost Component` rows (Section 2) so future components (Transportation, Insurance, etc.) need no schema change.
9. **Rounding**: independent drift between BOQ and Quotation tolerated, under ₹100.
10. **Versioning**: a revision is a new dated Estimate record, history preserved — this is what drove splitting Estimate from Project (Section 2).
11. **Discounts**: section-level only — simplified from an earlier per-section-and-per-line draft; per-line discounting was more control than actually needed.
12. **Approval workflow**: **superseded** — originally a custom Draft → Sent → Approved → Converted-to-Project status field; now native `docstatus`/submit/amend, with "Approved"/"Converted to Project" as computed display labels and "Sent" dropped as a tracked value entirely (it's an action, not a state). See "Lifecycle model, revised" in Section 2 for the full model. Customer/Plot auto-create still happens at Submit ("Approved"); Farm Project still gets created for "Converted to Project" — those two behaviors are unchanged, only the status machinery underneath them changed.

---

## 7. Phased Implementation Roadmap (high-level — detailed task breakdown comes later, after design)

0. **Design phase** — all architecture/data-model/costing decisions in this document are now approved (Sections 1, 2, 3). This phase is the separate UI-design pass referenced throughout (SPA screens for Estimate/BOQ, per Section 1), not further open-question resolution. Gates implementation.
1. **Master data foundation** — Item Group/Item/Item Price setup for Material Master; new Activity and Machinery doctypes.
2. **Category Templates** — Project Category doctype + child tables (including `is_manual` template rows), seeded for the 14 agreed categories.
3. **Estimate core + calculation engine** — Estimate doctype, Project Line Item + Estimate Section Discount + Project Cost Component child tables, template-apply/copy logic, area unit conversion, server-side formula engine with override-aware recompute. Also add the inert `project` Link field to Work here (Section 2 forward-compatibility note) — cheapest point to add it, before any Project-linked Plot accumulates Work.
4. **Costing rollups** — Cost Subtotal → Subtotal Before Profit (cost components) → Subtotal Before Tax (profit) → Grand Total (tax), assembled exactly per the finalized Section 3 sequence.
5. **Approval workflow + Farm Project creation** — native submit/amend wiring, auto Customer/Plot creation at Submit, thin Farm Project record creation for "Converted to Project," and the Amend-blocked-once-linked guard (see Section 2's edge case). Also where Setup's wizard and Builder's local-preview-then-Create flow get merged — see the architectural note in Section 2.
6. **Output generation** — shared context function; three Jinja templates; Letter Head setup; Excel export.
7. **Reports** — cost summary, profit analysis, estimate comparison as Frappe Script/Query Reports.
8. **UAT & rollout** — parallel-run against real Philosan spreadsheet estimates (validated against the two reference documents already reviewed) before cutover.

Master data and the formula engine must exist before any output template is meaningful — output generation stays near the end, since it's a pure rendering layer over data earlier phases make correct. Approval/Project-creation logic is sequenced right before output generation since it doesn't block costing work but should land before UAT exercises the full lifecycle.

---

### Key files referenced (for whoever picks up implementation after sign-off)

- `apps/managefarmspro/managefarmspro/managefarmspro/doctype/plot/plot.py` — supervision_charge percent pattern to extend
- `apps/managefarmspro/managefarmspro/managefarmspro/doctype/work/work.py` — Item/Item Group/Item Price line-item + server-side recompute pattern to mirror
- `apps/managefarmspro/managefarmspro/managefarmspro/report/collated_plot_invoice/collated_plot_invoice.py` — `render_template` + `get_pdf` mechanism to extend
- `apps/managefarmspro/managefarmspro/templates/collated_invoice.html` — existing hardcoded-letterhead template; `money_in_words` usage precedent; Letter Head decision point
- `apps/managefarmspro/managefarmspro/hooks.py` — where new Estimate/Project doc_events and workflow transitions will register
