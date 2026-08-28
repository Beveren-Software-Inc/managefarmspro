import { call } from "@/call.js"

// Colors keyed to the design tokens in style.css — falls back to "info" for
// any Sales Invoice status this app doesn't have an opinion on.
const STATUS_COLOR = {
  Paid: "var(--color-positive)",
  Overdue: "var(--color-negative)",
  Unpaid: "var(--color-warning)",
  "Partly Paid": "var(--color-warning)",
}

function chartToSeries(chart) {
  const values = chart?.datasets?.[0]?.values || []
  const labels = chart?.labels || []
  return labels.map((label, i) => ({ label, value: values[i] || 0 }))
}

// Local-constructed date strings, not toISOString() — that's UTC-based and
// reintroduces the exact off-by-one bug already fixed in formatDate() for
// any timezone behind UTC. Date-range filters need the same care as display.
function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export async function fetchDashboardData() {
  const today = new Date()
  const todayIso = localIso(today)
  const plus7Iso = localIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7))

  const [
    plotCount,
    workCount,
    customerCount,
    invoiceStatusChart,
    lowBalance,
    estimateActiveCount,
    estimatesAwaitingAction,
    farmProjectActiveCount,
    farmProjectsActive,
    siteVisitUpcomingCount,
    siteVisitsUpcoming,
  ] = await Promise.all([
    call("frappe.client.get_count", { doctype: "Plot" }),
    call("frappe.client.get_count", { doctype: "Work", filters: [["Work", "docstatus", "=", 1]] }),
    call("frappe.client.get_count", { doctype: "Customer" }),
    call("frappe.desk.doctype.dashboard_chart.dashboard_chart.get", { chart_name: "Invoice Status" }),
    call("frappe.desk.query_report.run", { report_name: "Low Balance Plots", filters: {} }),
    call("frappe.client.get_count", { doctype: "Estimate", filters: [["docstatus", "in", [0, 1]]] }),
    call("managefarmspro.managefarmspro.dashboard.get_estimates_awaiting_action", { days: 7 }),
    call("frappe.client.get_count", { doctype: "Farm Project", filters: { status: "Active" } }),
    call("frappe.client.get_list", {
      doctype: "Farm Project",
      filters: { status: "Active" },
      fields: ["name", "customer", "estimated_cost", "actual_cost", "cost_balance"],
      limit_page_length: 0,
    }),
    call("frappe.client.get_count", {
      doctype: "Site Visit",
      filters: [
        ["status", "=", "Scheduled"],
        ["scheduled_date", ">=", todayIso],
        ["scheduled_date", "<=", plus7Iso],
      ],
    }),
    call("frappe.client.get_list", {
      doctype: "Site Visit",
      filters: [
        ["status", "=", "Scheduled"],
        ["scheduled_date", ">=", todayIso],
        ["scheduled_date", "<=", plus7Iso],
      ],
      fields: ["name", "customer", "customer.customer_name as customer_name", "site_location", "scheduled_date", "slot"],
      order_by: "scheduled_date asc",
      limit_page_length: 5,
    }),
  ])

  const invoiceStatus = chartToSeries(invoiceStatusChart).map((s) => ({
    label: s.label,
    value: s.value,
    color: STATUS_COLOR[s.label] || "var(--color-info)",
  }))

  // 10% of budget remaining (or already over) — a flat rupee threshold
  // (Low Balance Plots' ₹500) doesn't translate to project-scale budgets.
  // Not expressible as a plain Frappe filter (compares two fields on the
  // same row), so computed client-side against the small Active-projects set.
  const farmProjectsAtRisk = farmProjectsActive
    .filter((p) => p.cost_balance <= (p.estimated_cost || 0) * 0.1)
    .sort((a, b) => a.cost_balance - b.cost_balance)
    .slice(0, 5)

  return {
    plotCount,
    workCount,
    customerCount,
    invoiceStatus,
    // Dashboard card only — full list is one click away via "View all"
    // (/low-balance-plots), no need to show every row here.
    lowBalancePlots: (lowBalance?.result || []).slice(0, 3),
    estimateActiveCount,
    estimatesAwaitingAction,
    farmProjectActiveCount,
    farmProjectsAtRisk,
    siteVisitUpcomingCount,
    siteVisitsUpcoming,
  }
}
