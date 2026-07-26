import { call } from "@/call.js"

// Child tables can't be queried directly via frappe.client.get_list (Frappe
// requires parent context to check permissions on a child doctype — confirmed
// by hitting a real PermissionError trying it). Same reason this app's own
// collated_plot_invoice.py never queries Labor/Equipment/Material Child via
// the generic client API either. With only 14 categories, fetching each full
// doc (child tables come embedded for free) is simpler and cheap enough.
export async function fetchCategoryTemplates() {
  const rows = await call("frappe.client.get_list", { doctype: "Project Category", fields: ["name"], limit_page_length: 0, order_by: "category_name asc" })
  const docs = await Promise.all(rows.map((r) => call("frappe.client.get", { doctype: "Project Category", name: r.name })))

  return docs.map((d) => ({
    name: d.name,
    category_name: d.category_name,
    description: d.description,
    default_row_spacing: d.default_row_spacing,
    default_plant_spacing: d.default_plant_spacing,
    default_pit_size: d.default_pit_size,
    default_supervision_type: d.default_supervision_type,
    default_supervision_value: d.default_supervision_value,
    itemCount: (d.items || []).length,
    activityCount: (d.activities || []).length,
  }))
}

export async function fetchCategoryTemplate(name) {
  return call("frappe.client.get", { doctype: "Project Category", name })
}

export async function updateCategoryTemplate(name, patch) {
  const doc = await call("frappe.client.get", { doctype: "Project Category", name })
  Object.assign(doc, patch)
  return call("frappe.client.save", { doc })
}

export const LINE_TYPES = ["Material", "Labour", "Machinery", "Manual", "Overhead"]
export const CONSUMPTION_BASES = ["Per Plant", "Per Pit", "Per Sqft", "Per Running Foot", "Fixed Quantity"]

// Maps a line's type to the real Item Groups it should search — confirmed
// against live data: today's 399 items sit entirely under the three legacy
// groups Work also uses (Raw Material/Labor/Equipment); the newer
// Estimate-specific groups (Plants, Manure & Inputs, Irrigation Materials,
// Structure Materials) exist as records but have no items in them yet, so
// they're included for forward-compatibility, not because they're populated.
export const LINE_TYPE_ITEM_GROUPS = {
  Material: ["Raw Material", "Products", "Consumable", "Plants", "Manure & Inputs", "Irrigation Materials", "Structure Materials"],
  Labour: ["Labor"],
  Machinery: ["Equipment", "Tools"],
  Overhead: ["Services", "Farm Services", "Miscellaneous"],
}

export async function fetchActivities() {
  const rows = await call("frappe.client.get_list", { doctype: "Activity", fields: ["name", "activity_name", "unit"], limit_page_length: 0, order_by: "activity_name asc" })
  return rows.map((r) => ({ value: r.name, label: r.activity_name, unit: r.unit }))
}

// Unfiltered across all Item Groups (399 real items today — small enough for
// a searchable combobox, same scale as other pickers already in this app).
// Item Price batched in one extra query, same pattern as Work Entry's item
// options — a per-row price lookup was the "laggy add" bug fixed there.
export async function fetchAllItemOptions() {
  const rows = await call("frappe.client.get_list", { doctype: "Item", fields: ["name", "item_name", "item_group", "stock_uom"], limit_page_length: 0, order_by: "item_name asc" })
  if (!rows.length) return []

  const prices = await call("frappe.client.get_list", {
    doctype: "Item Price",
    fields: ["item_code", "price_list_rate"],
    filters: [["item_code", "in", rows.map((r) => r.name)], ["price_list", "=", "Standard Selling"]],
    limit_page_length: 0,
  })
  const priceByCode = Object.fromEntries(prices.map((p) => [p.item_code, p.price_list_rate]))

  return rows.map((r) => ({ value: r.name, label: r.item_name, item_group: r.item_group, stock_uom: r.stock_uom, unit_price: priceByCode[r.name] || 0 }))
}

export function spacingLabel(t) {
  if (t.default_row_spacing && t.default_plant_spacing) return `${t.default_row_spacing}m x ${t.default_plant_spacing}m`
  return "—"
}
export function pitSizeLabel(t) {
  return t.default_pit_size || "—"
}
export function supervisionLabel(t) {
  if (!t.default_supervision_value) return "—"
  return t.default_supervision_type === "Fixed" ? `Fixed ₹${t.default_supervision_value}` : `${t.default_supervision_value}% of cost`
}

// Matches v0's per-category icon choices, keyed to this app's real 14
// category names (two of which differ slightly in wording from v0's mock
// data — mapped by intent, not string match).
export const CATEGORY_ICONS = {
  "Landscape Work": "leaf",
  "Food Forest": "sprout",
  "Miyawaki Plantation": "leaf",
  "General Plantation": "sprout",
  "Water Catchment Systems": "wallet",
  "Composting Units": "layers",
  "Vegetable Beds / Kitchen Gardens": "sprout",
  "Irrigation Works": "wallet",
  "Land Beautification": "leaf",
  "Flowering Gardens": "leaf",
  "Boundary Plantation": "sprout",
  "Timber Plantation": "sprout",
  "Walkway Development": "plot",
  "Garden Structures": "plot",
}
