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

