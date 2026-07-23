import { call } from "@/call.js"

// Owner (the doctype) has zero records on this site — the real, populated
// owner-relationship is Plot.customer_name -> ERPNext Customer directly.
// Browsing "Owners" in the SPA means browsing Customer records instead.
const FIELDS = ["name", "customer_name", "customer_type", "mobile_no", "email_id", "disabled", "creation"]

export async function fetchCustomers() {
  const [customers, plots] = await Promise.all([
    call("frappe.client.get_list", { doctype: "Customer", fields: FIELDS, limit_page_length: 0, order_by: "customer_name asc" }),
    call("frappe.client.get_list", { doctype: "Plot", fields: ["customer_name"], limit_page_length: 0 }),
  ])

  const plotCounts = {}
  for (const p of plots) {
    if (!p.customer_name) continue
    plotCounts[p.customer_name] = (plotCounts[p.customer_name] || 0) + 1
  }

  return customers.map((c) => ({ ...c, plot_count: plotCounts[c.name] || 0 }))
}

export async function fetchCustomer(name) {
  return call("frappe.client.get", { doctype: "Customer", name })
}
