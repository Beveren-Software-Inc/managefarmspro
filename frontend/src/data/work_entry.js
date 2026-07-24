import { call } from "@/call.js"

// Mirrors work.js exactly (Desk's own client script for Work): each line
// item picks a real Item filtered by item_group, unit auto-fills from
// Item.stock_uom, price comes from the "Standard Selling" Item Price, and
// total = unit_price * qty * count. The server has no independent check on
// these numbers (Work.total_cost is only ever summed from whatever
// total_price values arrive on the child rows — see hooks.py's
// calculate_total_cost) — same trust model Desk already runs on.
const ITEM_GROUP = { labor: "Labor", equipment: "Equipment", material: "Raw Material" }

export async function fetchWorkItems() {
  const rows = await call("frappe.client.get_list", {
    doctype: "Work Item",
    fields: ["name", "description"],
    limit_page_length: 0,
    order_by: "name asc",
  })
  return rows.map((r) => ({ value: r.name, label: r.name, description: r.description }))
}

// Fetches the item list AND every item's "Standard Selling" price up front
// (two queries total, once per section on page load) instead of looking up
// the price per line item on every Add click — that per-click round trip
// was the real cause of the "adding a line item feels laggy" report.
export async function fetchItemOptions(category) {
  const rows = await call("frappe.client.get_list", {
    doctype: "Item",
    fields: ["name", "item_name", "stock_uom"],
    filters: [["item_group", "=", ITEM_GROUP[category]]],
    limit_page_length: 0,
    order_by: "item_name asc",
  })
  if (!rows.length) return []

  const prices = await call("frappe.client.get_list", {
    doctype: "Item Price",
    fields: ["item_code", "price_list_rate"],
    filters: [
      ["item_code", "in", rows.map((r) => r.name)],
      ["price_list", "=", "Standard Selling"],
    ],
    limit_page_length: 0,
  })
  const priceByCode = Object.fromEntries(prices.map((p) => [p.item_code, p.price_list_rate]))

  return rows.map((r) => ({
    value: r.name,
    label: r.item_name,
    stock_uom: r.stock_uom,
    unit_price: priceByCode[r.name] || 0,
  }))
}

const CHILD_ITEM_FIELD = { labor: "labor_name", equipment: "item_name", material: "material_name" }
const CHILD_QTY_FIELD = {
  labor: "number_of_labor_units",
  equipment: "number_of_equipment_units",
  material: "number_of_material_units",
}
const CHILD_UNIT_FIELD = { labor: "labor_unit", equipment: "equipment_unit", material: "material_unit" }

// line: { item_code, item_display_name, qty, unit, unit_price, total_price }
export function toChildRow(category, line) {
  return {
    [CHILD_ITEM_FIELD[category]]: line.item_code,
    item_display_name: line.item_display_name,
    [CHILD_QTY_FIELD[category]]: line.qty,
    [CHILD_UNIT_FIELD[category]]: line.unit,
    unit_price: line.unit_price,
    total_price: line.total_price,
  }
}

// Reverse of toChildRow — loads an existing Work's raw child row (as
// returned by frappe.client.get) back into the same { item_code,
// item_display_name, qty, unit, unit_price, total_price } shape the add/edit
// UI works with, so a Draft Work's line items can be opened back into the
// same editor createWork's form uses.
export function fromChildRow(category, row) {
  return {
    item_code: row[CHILD_ITEM_FIELD[category]],
    item_display_name: row.item_display_name,
    qty: row[CHILD_QTY_FIELD[category]],
    unit: row[CHILD_UNIT_FIELD[category]],
    unit_price: row.unit_price,
    total_price: row.total_price,
  }
}

// Insert then submit — same two whitelisted methods Desk's own save+submit
// flow ultimately runs through, not a new endpoint.
export async function createWork({ plot, work_type_name, work_date, customer, description, labor, equipment, material }) {
  const doc = {
    doctype: "Work",
    plot,
    work_type_name,
    work_date,
    customer,
    description,
    labor_table: labor.map((l) => toChildRow("labor", l)),
    equipment_table: equipment.map((l) => toChildRow("equipment", l)),
    material_table: material.map((l) => toChildRow("material", l)),
  }
  const inserted = await call("frappe.client.insert", { doc })
  return call("frappe.client.submit", { doc: inserted })
}

// Loads the current Draft, overwrites the editable fields + child tables,
// and saves — the same frappe.client.save Desk's own form save ultimately
// runs through.
export async function updateWork(name, { work_type_name, work_date, description, labor, equipment, material }) {
  const doc = await call("frappe.client.get", { doctype: "Work", name })
  doc.work_type_name = work_type_name
  doc.work_date = work_date
  doc.description = description
  doc.labor_table = labor.map((l) => toChildRow("labor", l))
  doc.equipment_table = equipment.map((l) => toChildRow("equipment", l))
  doc.material_table = material.map((l) => toChildRow("material", l))
  return call("frappe.client.save", { doc })
}

export async function submitWork(doc) {
  return call("frappe.client.submit", { doc })
}

// frappe.client.cancel runs the document's real .cancel() — Frappe's own
// framework-level LinkExistsError check (a submitted Sales Invoice Item
// still linking to this Work via custom_work_id) blocks the cancel exactly
// as it would in Desk. The frontend also checks work.invoice_number up
// front (same signal collated_plot_invoice.py already treats as "already
// invoiced") purely to disable the button proactively — the framework check
// above is still the real enforcement.
export async function cancelWork(name) {
  return call("frappe.client.cancel", { doctype: "Work", name })
}
