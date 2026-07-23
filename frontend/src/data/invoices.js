import { call } from "@/call.js"

const REPORT_MODULE = "managefarmspro.managefarmspro.report.collated_plot_invoice.collated_plot_invoice"

export function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().slice(0, 10)
}
export function monthEnd(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().slice(0, 10)
}

// Same query the "Collated Plot Invoice" report runs on screen — only
// submitted, not-yet-invoiced Work rows for this plot/date range. Whatever
// this returns is exactly what generateInvoice() below will bill.
export async function fetchInvoiceableWorks(filters) {
  const [, data] = await call(`${REPORT_MODULE}.execute`, { filters })
  return data
}

// Calls the exact existing "Generate Invoice" mechanism Desk uses: creates
// and submits a real Sales Invoice, stamps Work.invoice_number, renders the
// PDF, returns its URL. Not reimplemented — same whitelisted method, same
// business logic, unchanged.
export async function generateInvoice(filters) {
  return call(`${REPORT_MODULE}.download_invoice_pdf`, { filters })
}

const HISTORY_FIELDS = ["name", "plot", "customer", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"]
export const INVOICE_PAGE_SIZE = 50

// Sales Invoice.plot is only ever set by download_invoice_pdf above — it's
// the real marker for "an invoice this app generated" (InvoiceList, despite
// its name, plays no role here — see investigation notes).
export async function fetchInvoiceHistory({ search, status, limitStart = 0 } = {}) {
  const filters = [["plot", "is", "set"]]
  if (status) filters.push(["status", "=", status])

  const args = {
    doctype: "Sales Invoice",
    fields: HISTORY_FIELDS,
    filters,
    order_by: "posting_date desc",
    limit_start: limitStart,
    limit_page_length: INVOICE_PAGE_SIZE,
  }
  if (search) {
    args.or_filters = [
      ["plot", "like", `%${search}%`],
      ["customer", "like", `%${search}%`],
      ["name", "like", `%${search}%`],
    ]
  }
  return call("frappe.client.get_list", args)
}

export async function fetchInvoicesForCustomer(customerName) {
  return call("frappe.client.get_list", {
    doctype: "Sales Invoice",
    fields: HISTORY_FIELDS,
    filters: [
      ["plot", "is", "set"],
      ["customer", "=", customerName],
    ],
    order_by: "posting_date desc",
    limit_page_length: 0,
  })
}

// pdf_invoice_link (set via db.set_value in download_invoice_pdf) isn't a
// real registered field on Sales Invoice, so it can't be queried — read the
// PDF's actual File record instead.
export async function fetchInvoicePdfUrls(invoiceNames) {
  if (!invoiceNames.length) return {}
  const files = await call("frappe.client.get_list", {
    doctype: "File",
    fields: ["attached_to_name", "file_url"],
    filters: [
      ["attached_to_doctype", "=", "Sales Invoice"],
      ["attached_to_name", "in", invoiceNames],
    ],
    limit_page_length: 0,
  })
  return Object.fromEntries(files.map((f) => [f.attached_to_name, f.file_url]))
}
