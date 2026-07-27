import { call } from "@/call.js"
import { fetchAllItemOptions } from "@/data/category_templates.js"

// Revised lifecycle model: native docstatus/submit/amend, not a custom
// status field. "Approved" and "Converted to Project" are computed display
// labels (docstatus + whether a Farm Project links back), never stored.
// See estimate-boq-module-plan.md, "Lifecycle model, revised".
export function estimateStatusLabel(docstatus, hasProject) {
  if (docstatus === 2) return "Cancelled"
  if (docstatus === 0) return "Draft"
  return hasProject ? "Converted to Project" : "Approved"
}

const ESTIMATE_MODULE = "managefarmspro.managefarmspro.doctype.estimate.estimate"

const LIST_FIELDS = ["name", "client_name", "customer", "category", "area_value", "area_unit", "area_sqft", "docstatus", "grand_total", "amended_from", "modified"]

// Farm Project links are looked up in one batched query (all `estimate`
// values at once, matched client-side) rather than per-row — same
// "batch, don't fetch-per-row" pattern already used for Category Template
// item/activity counts.
export async function fetchEstimates() {
  const [estimates, projects] = await Promise.all([
    call("frappe.client.get_list", { doctype: "Estimate", fields: LIST_FIELDS, limit_page_length: 0, order_by: "modified desc" }),
    call("frappe.client.get_list", { doctype: "Farm Project", fields: ["estimate"], limit_page_length: 0 }),
  ])
  const withProject = new Set(projects.map((p) => p.estimate))
  return estimates.map((e) => ({ ...e, statusLabel: estimateStatusLabel(e.docstatus, withProject.has(e.name)) }))
}

// Same shape as fetchEstimates, scoped to one Customer — feeds the
// Customer Details "Estimates" tab, same pattern as that page's existing
// Plots/Invoices tabs (fetchPlotsForCustomer / fetchInvoicesForCustomer).
export async function fetchEstimatesForCustomer(customerName) {
  const [estimates, projects] = await Promise.all([
    call("frappe.client.get_list", { doctype: "Estimate", fields: LIST_FIELDS, filters: [["customer", "=", customerName]], limit_page_length: 0, order_by: "modified desc" }),
    call("frappe.client.get_list", { doctype: "Farm Project", fields: ["estimate"], filters: [["customer", "=", customerName]], limit_page_length: 0 }),
  ])
  const withProject = new Set(projects.map((p) => p.estimate))
  return estimates.map((e) => ({ ...e, statusLabel: estimateStatusLabel(e.docstatus, withProject.has(e.name)) }))
}

export async function fetchCategoryNames() {
  const rows = await call("frappe.client.get_list", { doctype: "Project Category", fields: ["category_name"], limit_page_length: 0, order_by: "category_name asc" })
  return rows.map((r) => r.category_name)
}

export function areaLabel(e) {
  if (!e.area_value) return "—"
  return `${e.area_value} ${e.area_unit || "Sqft"}`
}

const AREA_TO_SQFT = { Sqft: 1, Cent: 435.6, Acre: 43560 }
export function toSqft(unit, value) {
  return Math.round((Number(value) || 0) * (AREA_TO_SQFT[unit] || 1))
}

// Plant Quantity = Area / (Row Spacing x Plant Spacing) — the one formula
// already specified in the approved plan (Section 3). Pits are treated as
// one per plant. Per Running Foot has no perimeter input in this schema yet,
// so it passes the template's own rate through as a manual starting value.
function deriveQuantity(templateItem, template, areaSqft) {
  const rate = templateItem.consumption_rate || 0
  const plantQty = template.default_row_spacing && template.default_plant_spacing ? areaSqft / (template.default_row_spacing * template.default_plant_spacing) : 0
  switch (templateItem.consumption_basis) {
    case "Per Sqft":
      return areaSqft * rate
    case "Per Plant":
    case "Per Pit":
      return plantQty * rate
    case "Fixed Quantity":
      return rate || 1
    default:
      return rate
  }
}

// Pure — builds the line items/cost components a Category Template produces
// for a given area, with no backend call. Used by the Setup wizard to
// assemble the local draft (nothing persisted yet); the shape matches
// Project Line Item / Project Cost Component exactly so it can be inserted
// as-is once the user clicks Create.
export async function buildLineItemsFromTemplate(template, areaSqft) {
  const itemOptions = await fetchAllItemOptions()
  const byCode = Object.fromEntries(itemOptions.map((o) => [o.value, o]))

  const line_items = (template.items || []).map((ti) => {
    if (ti.is_manual) {
      return { section: "Materials", line_type: ti.line_type || "Manual", source_item: null, description: ti.description, quantity: 1, uom: ti.uom || "-", rate: 0, internal_rate: 0, amount: 0, is_override: 0, is_manual: 1 }
    }
    const opt = byCode[ti.item]
    const quantity = Math.round(deriveQuantity(ti, template, areaSqft) * 1000) / 1000
    const rate = opt?.unit_price || 0
    return {
      section: "Materials",
      line_type: ti.line_type || "Material",
      source_item: ti.item,
      description: ti.description || opt?.label || "",
      quantity,
      uom: ti.uom || opt?.stock_uom || "",
      rate,
      internal_rate: Math.round(rate * 0.8),
      amount: Math.round(quantity * rate * 100) / 100,
      is_override: 0,
      is_manual: 0,
    }
  })

  const cost_components = []
  if (template.default_supervision_value) {
    cost_components.push({ component_name: "Supervision", charge_type: template.default_supervision_type || "Percent", value: template.default_supervision_value })
  }
  cost_components.push({ component_name: "Consultation", charge_type: "Fixed", value: 0 })

  return { line_items, cost_components }
}

// The real first write — nothing exists in the backend before this. Lands
// at docstatus 0 (Draft) via a plain insert, never submit.
export async function createEstimate(draft) {
  const doc = {
    doctype: "Estimate",
    client_name: draft.client_name,
    customer: draft.customer || null,
    plot: draft.plot || null,
    location: draft.location,
    category: draft.category?.category_name || draft.category,
    area_value: draft.area_value,
    area_unit: draft.area_unit,
    area_sqft: draft.area_sqft,
    duration: draft.duration,
    line_items: draft.line_items,
    cost_components: draft.cost_components,
  }
  return call("frappe.client.insert", { doc })
}

export async function fetchEstimateDetail(name) {
  return call("frappe.client.get", { doctype: "Estimate", name })
}

// The Estimate plus whether a Farm Project already links back to it, in one
// round trip — drives the "Converted to Project" display label and whether
// Amend/Cancel are allowed. Replaces the fetchEstimateDetail +
// fetchLinkedProject pair every load site (Builder, Documents) used to fetch
// separately.
export async function fetchEstimateWithProject(name) {
  const result = await call(`${ESTIMATE_MODULE}.get_estimate_detail`, { estimate: name })
  const { linked_project, ...doc } = result
  return { doc, linkedProject: linked_project || null }
}

export async function saveEstimate(doc) {
  return call("frappe.client.save", { doc })
}

// "Approve" in the UI = frappe.client.submit underneath (docstatus 0 -> 1),
// nothing else. Customer creation used to be embedded here as a submit-time
// side effect — moved out entirely (see linkCustomer below) so a plain Desk
// Submit and an SPA Approve behave identically, and an Approved-but-
// unlinked Estimate is a valid, intentional state (a quoted prospect), not
// a half-finished one.
//
// Document.submit() calls self.save() internally (confirmed by reading
// frappe/model/document.py) — it persists every field/child-table change on
// `doc` AND transitions docstatus in one write, so no separate save() call
// is needed first. Verified live: a single submit() round trip against a
// full doc dict correctly saved edited line items and flipped docstatus.
export async function approveEstimate(doc) {
  return call("frappe.client.submit", { doc })
}

// Server-side, atomic (single save() round trip, not two sequential client
// awaits) — the separate whitelisted action both the SPA (as an
// Approve-time convenience, or any later time) and Desk (via estimate.js's
// "Link Customer" button) call. Pass either `customer` (link to an existing
// record) or `customerName` (create a new one) — never both.
//
// Resolves to either `{ customer }` on success, or `{ duplicate: true,
// existingCustomer, message }` if a same-named Customer already exists and
// no email/phone was given to tell them apart — the server deliberately
// returns this instead of throwing, so the caller can offer a one-click
// "use the existing one" path instead of just showing an error.
export async function linkCustomer(estimateName, { customer, customerName, customerType, emailId, mobileNo } = {}) {
  const result = await call(`${ESTIMATE_MODULE}.link_customer`, {
    estimate: estimateName,
    customer: customer || null,
    customer_name: customerName || null,
    customer_type: customerType || null,
    email_id: emailId || null,
    mobile_no: mobileNo || null,
  })
  if (result.duplicate) return { duplicate: true, existingCustomer: result.existing_customer, message: result.message }
  return result
}

// Link-only against an existing Plot.
export async function linkPlot(estimateName, plot) {
  return call(`${ESTIMATE_MODULE}.link_plot`, { estimate: estimateName, plot })
}

// Minimal Plot creation for the Convert-to-Project flow — Customer is never
// passed here, it's always whatever's already linked on the Estimate
// server-side, so a Plot can't get created against the wrong Customer.
export async function createPlot(estimateName, { plotName, area, units, cluster }) {
  return call(`${ESTIMATE_MODULE}.create_plot_and_link`, { estimate: estimateName, plot_name: plotName, area, units, cluster })
}

// Farm Project is deliberately thin (Section 2 of the plan) — no line-item
// duplication. Named "Farm Project", not "Project" — ERPNext already has
// its own Project doctype, and Frappe doctype names are globally unique per
// site. Nothing on the Estimate itself changes here — "Converted to
// Project" is purely the fact that this Farm Project now exists and points
// back.
//
// Customer+Plot are required — enforced server-side in convert_to_project
// itself (not just here), so the rule holds no matter who calls it. The SPA
// still pre-checks doc.customer/doc.plot before even offering this action,
// purely for UX (routes the user into the linking flow instead of showing a
// thrown-error toast) — that check is a convenience, not the real guard.
export async function convertEstimateToProject(doc) {
  return call(`${ESTIMATE_MODULE}.convert_to_project`, { estimate: doc.name })
}

// Standalone cancel (abandon, no replacement) — docstatus 1 -> 2, no follow-up
// insert. Frappe's own check_docstatus_transition (read directly in
// frappe/model/document.py) only allows Submitted -> Cancelled, never
// Draft -> Cancelled ("Cannot change docstatus from 0 (Draft) to 2
// (Cancelled)") — so this is only ever offered for Approved estimates in the
// UI, matching the framework's own rule rather than a guess. Same
// Farm-Project-link guard as amendEstimate applies: caller must refuse this
// if a Farm Project already links back, for the same reason (Farm Project
// isn't submittable, so Frappe's own submitted-linked-doc protection never
// catches it). Callers hold this in the reactive `linkedProject` state
// loaded via fetchEstimateWithProject, not a fresh fetch per click.
export async function cancelEstimate(name) {
  return call("frappe.client.cancel", { doctype: "Estimate", name })
}

// Server-side now (see estimate.py's amend_estimate) — cancels the doc, then
// uses frappe.copy_doc() to build the new one, which copies every field
// including child tables automatically. Replaces a hand-picked field list
// that lived here before (client_name, customer, plot, line_items, ... one
// by one) — fragile, since every new Estimate field needed a matching
// manual edit or amend would silently drop it. Naming is Frappe's own
// (confirmed live on this site: Document Naming Settings.
// default_amend_naming = "Amend Counter", so the new name is
// EST-2026-00001-1, not a fresh EST-2026-000NN). The amended doc starts back
// at docstatus 0 — it goes through Approve again on its own.
//
// Caller must refuse to call this if a Farm Project already links to the
// estimate (held in reactive `linkedProject` state) — Frappe's own
// link-protection does NOT catch this (Farm Project isn't submittable, so
// its docstatus is always 0 and the framework's submitted-linked-doc check
// never triggers).
export async function amendEstimate(doc) {
  return call(`${ESTIMATE_MODULE}.amend_estimate`, { estimate: doc.name })
}

const OUTPUT_MODULE = "managefarmspro.managefarmspro.estimate_output"

// Real server-side generation (plan.md Phase 6) — shared costing context +
// Jinja template + get_pdf, same pattern as the working invoice pipeline
// (collated_plot_invoice.py's download_invoice_pdf). docType is one of
// 'estimate' | 'client-boq' | 'internal', matching estimate_output.py's
// DOC_TEMPLATES keys. Returns a full URL to the generated PDF file.
export async function downloadEstimatePdf(estimateName, docType) {
  return call(`${OUTPUT_MODULE}.download_estimate_pdf`, { estimate: estimateName, doc_type: docType })
}
