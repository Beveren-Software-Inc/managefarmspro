import { call } from "@/call.js"

// Colors keyed to the design tokens in style.css — falls back to "info" for
// any Sales Invoice status this app doesn't have an opinion on.
const STATUS_COLOR = {
  Paid: "var(--color-positive)",
  Overdue: "var(--color-negative)",
  Unpaid: "var(--color-warning)",
  "Partly Paid": "var(--color-warning)",
}

// Backend chart labels come as "DD-MM-YYYY" — shorten to "23 Jun" for the x-axis.
function shortDate(ddmmyyyy) {
  const [day, month, year] = ddmmyyyy.split("-")
  if (!day || !month || !year) return ddmmyyyy
  return new Date(`${year}-${month}-${day}`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
}

function chartToSeries(chart) {
  const values = chart?.datasets?.[0]?.values || []
  const labels = chart?.labels || []
  return labels.map((label, i) => ({ label, value: values[i] || 0 }))
}

export async function fetchDashboardData() {
  const [plotCount, workCount, invoiceStatusChart, worksTrendChart, lowBalance] = await Promise.all([
    call("frappe.client.get_count", { doctype: "Plot" }),
    call("frappe.client.get_count", { doctype: "Work", filters: [["Work", "docstatus", "=", 1]] }),
    call("frappe.desk.doctype.dashboard_chart.dashboard_chart.get", { chart_name: "Invoice Status" }),
    call("frappe.desk.doctype.dashboard_chart.dashboard_chart.get", { chart_name: "Total Works" }),
    call("frappe.desk.query_report.run", { report_name: "Low Balance Plots", filters: {} }),
  ])

  const invoiceStatus = chartToSeries(invoiceStatusChart).map((s) => ({
    label: s.label,
    value: s.value,
    color: STATUS_COLOR[s.label] || "var(--color-info)",
  }))

  const worksTrend = chartToSeries(worksTrendChart).map((s) => ({ date: shortDate(s.label), count: s.value }))

  return {
    plotCount,
    workCount,
    invoicedTotal: invoiceStatus.reduce((t, s) => t + s.value, 0),
    invoiceStatus,
    worksTrend,
    lowBalancePlots: lowBalance?.result || [],
  }
}
