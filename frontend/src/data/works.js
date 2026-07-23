import { call } from "@/call.js"

// Same mapping work.py:update_work_child already uses for Work Child.status —
// replicated here as a plain label lookup, not new business logic.
const DOCSTATUS_LABEL = { 0: "Draft", 1: "Submitted", 2: "Cancelled" }
const LABEL_DOCSTATUS = { Draft: 0, Submitted: 1, Cancelled: 2 }
export const WORK_STATUSES = ["Draft", "Submitted", "Cancelled"]
export const WORK_PAGE_SIZE = 50

export function workStatus(docstatus) {
  return DOCSTATUS_LABEL[docstatus] || "Unknown"
}

const FIELDS = ["name", "plot", "work_type_name", "work_date", "docstatus", "total_cost", "customer"]

function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

export function thisWeekRange() {
  const now = new Date()
  const day = now.getDay() || 7 // Sunday(0) -> 7, so week starts Monday
  const from = new Date(now)
  from.setDate(now.getDate() - day + 1)
  const to = new Date(from)
  to.setDate(from.getDate() + 6)
  return { from: toISODate(from), to: toISODate(to) }
}
export function thisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toISODate(from), to: toISODate(to) }
}

export async function fetchWork(name) {
  return call("frappe.client.get", { doctype: "Work", name })
}

function normalizeLine(row, qtyField, unitField) {
  return {
    description: row.item_display_name,
    qty: row[qtyField],
    unit: row[unitField],
    price: row.unit_price,
    total: row.total_price,
  }
}
export function laborLines(work) {
  return (work.labor_table || []).map((r) => normalizeLine(r, "number_of_labor_units", "labor_unit"))
}
export function equipmentLines(work) {
  return (work.equipment_table || []).map((r) => normalizeLine(r, "number_of_equipment_units", "equipment_unit"))
}
export function materialLines(work) {
  return (work.material_table || []).map((r) => normalizeLine(r, "number_of_material_units", "material_unit"))
}

export async function fetchWorks({ search, status, plot, from, to, limitStart = 0 } = {}) {
  const filters = []
  if (status) filters.push(["docstatus", "=", LABEL_DOCSTATUS[status]])
  if (plot) filters.push(["plot", "=", plot])
  if (from && to) filters.push(["work_date", "between", [from, to]])
  else if (from) filters.push(["work_date", ">=", from])
  else if (to) filters.push(["work_date", "<=", to])

  const args = {
    doctype: "Work",
    fields: FIELDS,
    filters,
    order_by: "work_date desc, creation desc",
    limit_start: limitStart,
    limit_page_length: WORK_PAGE_SIZE,
  }
  if (search) {
    args.or_filters = [
      ["work_type_name", "like", `%${search}%`],
      ["plot", "like", `%${search}%`],
      ["name", "like", `%${search}%`],
    ]
  }
  return call("frappe.client.get_list", args)
}
