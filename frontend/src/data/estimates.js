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

// Whether a Farm Project already links back to this Estimate — drives the
// "Converted to Project" display label and whether Amend is allowed.
export async function fetchLinkedProject(estimateName) {
  const rows = await call("frappe.client.get_list", { doctype: "Farm Project", fields: ["name", "status"], filters: [["estimate", "=", estimateName]], limit_page_length: 1 })
  return rows[0] || null
}

export async function saveEstimate(doc) {
  return call("frappe.client.save", { doc })
}

// Customer requires only customer_name + customer_type — confirmed by
// reading Customer's DocType fields directly, not assumed. Plot's own
// required fields include `cluster` with no rule anywhere for which one an
// auto-created Plot should get, so — unlike Customer — Plot auto-creation on
// Submit is NOT implemented here. Left null; flagged in the UI instead of
// guessed.
//
// "Approve" in the UI = frappe.client.submit underneath (docstatus 0 -> 1).
// Document.submit() calls self.save() internally (confirmed by reading
// frappe/model/document.py) — it persists every field/child-table change on
// `doc` AND transitions docstatus in one write, so no separate save() call
// is needed first. Verified live: a single submit() round trip against a
// full doc dict correctly saved edited line items and flipped docstatus.
export async function approveEstimate(doc) {
  let customer = doc.customer
  if (!customer && doc.client_name) {
    const newCustomer = await call("frappe.client.insert", { doc: { doctype: "Customer", customer_name: doc.client_name, customer_type: "Individual" } })
    customer = newCustomer.name
  }
  doc.customer = customer
  return call("frappe.client.submit", { doc })
}

// Farm Project is deliberately thin (Section 2 of the plan) — no line-item
// duplication, plot nullable since Approve may not have been able to create
// one. Named "Farm Project", not "Project" — ERPNext already has its own
// Project doctype, and Frappe doctype names are globally unique per site.
// Nothing on the Estimate itself changes here — "Converted to Project" is
// purely the fact that this Farm Project now exists and points back.
export async function convertEstimateToProject(doc) {
  return call("frappe.client.insert", {
    doc: { doctype: "Farm Project", estimate: doc.name, customer: doc.customer || null, plot: doc.plot || null, category: doc.category, status: "Active" },
  })
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
// catches it).
export async function cancelEstimate(name) {
  return call("frappe.client.cancel", { doctype: "Estimate", name })
}

// Real Frappe amend: cancel the submitted doc, then insert a new one with
// amended_from set. Naming is Frappe's own (confirmed live on this site:
// Document Naming Settings.default_amend_naming = "Amend Counter", so the
// new name is EST-2026-00001-1, not a fresh EST-2026-000NN). The amended
// doc starts back at docstatus 0 — it goes through Approve again on its own.
//
// Caller must check fetchLinkedProject() first and refuse to call this if a
// Farm Project already links to the estimate — Frappe's own link-protection
// does NOT catch this (Farm Project isn't submittable, so its docstatus is
// always 0 and the framework's submitted-linked-doc check never triggers).
export async function amendEstimate(doc) {
  await call("frappe.client.cancel", { doctype: "Estimate", name: doc.name })
  const newDoc = {
    doctype: "Estimate",
    amended_from: doc.name,
    client_name: doc.client_name,
    customer: doc.customer,
    plot: doc.plot,
    location: doc.location,
    category: doc.category,
    area_value: doc.area_value,
    area_unit: doc.area_unit,
    area_sqft: doc.area_sqft,
    duration: doc.duration,
    line_items: doc.line_items,
    section_discounts: doc.section_discounts,
    cost_components: doc.cost_components,
    profit_type: doc.profit_type,
    profit_value: doc.profit_value,
    tax_percent: doc.tax_percent,
  }
  return call("frappe.client.insert", { doc: newDoc })
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
