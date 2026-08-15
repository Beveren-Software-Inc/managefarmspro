import { call, uploadFile } from "@/call.js"

const SITE_VISIT_MODULE = "managefarmspro.managefarmspro.doctype.site_visit.site_visit"

export const SITE_VISIT_STATUSES = ["Scheduled", "Visited", "Completed", "Cancelled"]
export const SITE_VISIT_PAGE_SIZE = 50

const LIST_FIELDS = [
  "name",
  "customer",
  "customer.customer_name as customer_name",
  "site_location",
  "distance_km",
  "distance_tier",
  "preferred_date",
  "scheduled_date",
  "status",
  "base_charge",
  "total_amount",
  "sales_invoice",
  "analysis_status",
  "creation",
]

// Investigated the "slow" report directly: the list query itself is a single
// LEFT JOIN (confirmed via frappe.get_list debug=True — no N+1), fast even
// unbounded at today's row count. The real structural issue is that this
// fetched every Site Visit ever created with no limit at all, unlike Invoice
// History's own established SITE_VISIT_PAGE_SIZE-equivalent pagination — that
// only gets worse as the table grows. Brought in line with that same pattern.
export async function fetchSiteVisits({ search, status, limitStart = 0, dateFrom, dateTo } = {}) {
  const filters = []
  if (status) filters.push(["status", "=", status])
  if (dateFrom) filters.push(["scheduled_date", ">=", dateFrom])
  if (dateTo) filters.push(["scheduled_date", "<=", dateTo])

  const args = {
    doctype: "Site Visit",
    fields: LIST_FIELDS,
    filters,
    order_by: "scheduled_date desc, creation desc",
    limit_start: limitStart,
    limit_page_length: SITE_VISIT_PAGE_SIZE,
  }
  if (search) {
    // Customer autonames off customer_name (confirmed via Customer's own
    // autoname behavior elsewhere in this app), so matching against the
    // "customer" link value doubles as a customer-name search.
    args.or_filters = [
      ["name", "like", `%${search}%`],
      ["customer", "like", `%${search}%`],
      ["site_location", "like", `%${search}%`],
    ]
  }
  return call("frappe.client.get_list", args)
}

// Cheap COUNT queries, independent of the paginated rows the list actually
// renders — filter chips need the true total per status, not just what's
// been loaded so far.
export async function fetchSiteVisitStatusCounts() {
  const [all, ...perStatus] = await Promise.all([
    call("frappe.client.get_count", { doctype: "Site Visit" }),
    ...SITE_VISIT_STATUSES.map((s) => call("frappe.client.get_count", { doctype: "Site Visit", filters: { status: s } })),
  ])
  return { All: all, ...Object.fromEntries(SITE_VISIT_STATUSES.map((s, i) => [s, perStatus[i]])) }
}

// Same get_pricing_tier() the backend uses on save — the amount shown here
// can never drift from what actually gets charged.
export async function previewBaseCharge(distanceKm) {
  return call(`${SITE_VISIT_MODULE}.preview_base_charge`, { distance_km: distanceKm })
}

export async function checkDateAvailability(scheduledDate, exclude) {
  return call(`${SITE_VISIT_MODULE}.check_date_availability`, { scheduled_date: scheduledDate, exclude })
}

// Resolves/creates the Customer (existing-vs-prospect, same duplicate-check
// UX as Estimate's link_customer) and creates the Site Visit in one call.
export async function createSiteVisit(fields) {
  return call(`${SITE_VISIT_MODULE}.create_site_visit`, fields)
}

export async function fetchSiteVisit(name) {
  return call("frappe.client.get", { doctype: "Site Visit", name })
}

// fieldname may be a {field: value} dict — frappe.client.set_value's own
// signature, reused as-is rather than wrapping it in a new whitelisted method.
export async function saveSiteVisitFields(name, fieldname) {
  return call("frappe.client.set_value", { doctype: "Site Visit", name, fieldname })
}

export async function updateSiteVisitStatus(name, status, comment) {
  return call(`${SITE_VISIT_MODULE}.update_status`, { site_visit: name, status, comment })
}

export async function fetchSiteVisitTimeline(name) {
  return call(`${SITE_VISIT_MODULE}.fetch_timeline`, { site_visit: name })
}

export async function uploadSiteVisitAttachment(name, file, caption) {
  const uploaded = await uploadFile(file, { doctype: "Site Visit", docname: name })
  return call(`${SITE_VISIT_MODULE}.add_attachment`, { site_visit: name, file_url: uploaded.file_url, caption })
}

export async function removeSiteVisitAttachment(name, rowName) {
  return call(`${SITE_VISIT_MODULE}.remove_attachment`, { site_visit: name, row_name: rowName })
}

// Creates + submits a real Sales Invoice (base charge + expense lines) —
// same pipeline collated_plot_invoice.py's own Generate Invoice uses, not a
// second invoicing system.
export async function generateSiteVisitInvoice(name) {
  return call(`${SITE_VISIT_MODULE}.generate_invoice`, { site_visit: name })
}

export async function fetchSiteVisitInvoiceSummary(salesInvoice) {
  return call(`${SITE_VISIT_MODULE}.fetch_invoice_summary`, { sales_invoice: salesInvoice })
}

// Same render_template -> get_pdf -> File pipeline as Estimate's own PDF
// outputs (estimate_output.py) — NOT Frappe's generic print-format route.
// This app's default "New SI" print format is built for the Work-invoicing
// flow and renders "Work Name"/"Work Description" placeholder labels on any
// invoice that doesn't populate those Work-specific fields, Site Visit's
// included — confirmed live, not reusable here.
export async function downloadSiteVisitInvoicePdf(name) {
  return call(`${SITE_VISIT_MODULE}.download_invoice_pdf`, { site_visit: name })
}

export async function fetchSiteVisitSettings() {
  return call("frappe.client.get", { doctype: "Site Visit Settings", name: "Site Visit Settings" })
}

// Single doctype with a child table — fetched/modified/saved as a whole doc,
// same as any other Frappe Single with children.
export async function saveSiteVisitSettings(doc) {
  return call("frappe.client.save", { doc })
}
