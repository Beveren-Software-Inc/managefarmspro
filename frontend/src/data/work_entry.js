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
