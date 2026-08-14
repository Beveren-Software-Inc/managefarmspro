import { call } from "@/call.js"

const FIELDS = [
  "name",
  "plot_name",
  "cluster",
  "plot_status",
  "customer_name",
  "plot_location",
  "monthly_maintenance_budget",
  "total_amount_spent",
  "maintenance_balance",
  "units",
  "area",
  "supervision_charge",
]

export function plotBalance(plot) {
  return plot.maintenance_balance ?? plot.monthly_maintenance_budget - plot.total_amount_spent
}

export async function fetchPlots() {
  return call("frappe.client.get_list", {
    doctype: "Plot",
    fields: FIELDS,
    limit_page_length: 0,
    order_by: "plot_name asc",
  })
}

export async function fetchClusters() {
  return call("frappe.client.get_list", {
    doctype: "Cluster",
    fields: ["name", "cluster_name"],
    limit_page_length: 0,
    order_by: "cluster_name asc",
  })
}

export async function fetchPlotsForCustomer(customerName) {
  return call("frappe.client.get_list", {
    doctype: "Plot",
    fields: FIELDS,
    filters: [["customer_name", "=", customerName]],
    limit_page_length: 0,
    order_by: "plot_name asc",
  })
}

// Plot.work_details is a child table Desk already keeps in sync with every
// Work's status/total_cost (see work.py:update_work_child) — reuse it
// instead of running a separate Work query.
//
// Deliberately NOT calling the existing get_plot_balances whitelisted method
// here: it unconditionally does plot_doc.save() after a plain read, which
// races concurrent writes to the same Plot row (QueryDeadlockError /
// "Record has changed since last read") on this dataset — a pre-existing
// bug in work.py we're not permitted to touch. Plot.total_amount_spent /
// maintenance_balance are already kept current on every Work submit/cancel
// (work.py:update_plot_totals), so reading them straight off the doc is the
// same data the rest of the app already relies on (Plot List, Low Balance
// Plots report).
export async function fetchPlotDetail(name) {
  return call("frappe.client.get", { doctype: "Plot", name })
}

export async function fetchPlotLocations() {
  return call("frappe.client.get_list", { doctype: "Plot Location", fields: ["name"], limit_page_length: 0, order_by: "name asc" })
}

// Standalone Add Plot entry point (Plots list). Plot's own doctype
// permissions restrict create to System Manager (plot.json) — same
// precedent as Category Templates, gated with isSystemManager() in the
// view. Real Desk's own standalone /app/plot/new form has no Customer
// field at all (a Plot is normally created from within a Customer record,
// which sets it contextually) — deliberately included here anyway since a
// Plot created from this list has no such context and needs a real owner
// for budget/invoicing to resolve at all (confirmed: customer_name is
// settable at insert despite being read_only in the form, same trick
// estimate.py's create_plot_and_link already relies on). Plain
// frappe.client.insert against Plot, same direct-insert pattern as
// createCustomer() — no new whitelisted method needed.
export async function createPlot({
  plot_number,
  plot_name,
  cluster,
  customer_name,
  area,
  units,
  plot_status,
  plot_location,
  preferred_plot_name,
  monthly_maintenance_budget,
  supervision_charge,
}) {
  const doc = {
    doctype: "Plot",
    plot_number: plot_number || null,
    plot_name,
    cluster,
    customer_name,
    area,
    units: units || "Cent",
    plot_status: plot_status || "Active",
    plot_location: plot_location || null,
    preferred_plot_name: preferred_plot_name || null,
    monthly_maintenance_budget: monthly_maintenance_budget || 0,
    supervision_charge: supervision_charge || 0,
  }
  return call("frappe.client.insert", { doc })
}

// Reuses the real "Low Balance Plots" Script Report (managefarmspro/report/
// low_balance_plots/low_balance_plots.py) via the same whitelisted runner
// Desk's own report viewer and this app's Dashboard card already call
// (frappe.desk.query_report.run) — not a reimplementation of its SQL.
// Confirmed by reading that script directly: it only ever honors the
// `maintenance_balance_threshold` filter (default 500) even though the
// report's own filter config also defines Cluster/Plot Status filters —
// those are silently ignored server-side, a pre-existing gap in the report
// itself, not something to paper over with client-side filtering here.
export async function fetchLowBalancePlots(threshold) {
  const res = await call("frappe.desk.query_report.run", {
    report_name: "Low Balance Plots",
    filters: { maintenance_balance_threshold: threshold ?? 500 },
  })
  return res?.result || []
}

