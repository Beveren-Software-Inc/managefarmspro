import { call } from "@/call.js"

// Small master tables (7 types, 54 plants today) — same "fetch everything,
// filter client-side" pattern as fetchAllItemOptions, not worth paginating.
export async function fetchPlantTypes() {
  const rows = await call("frappe.client.get_list", { doctype: "Plant Type", fields: ["name"], limit_page_length: 0, order_by: "name asc" })
  return rows.map((r) => ({ value: r.name, label: r.name }))
}

export async function fetchPlants() {
  const rows = await call("frappe.client.get_list", {
    doctype: "Plant",
    fields: ["name", "common_name", "scientific_name", "plant_type", "spacing_ft", "item"],
    limit_page_length: 0,
    order_by: "common_name asc",
  })
  return rows.map((r) => ({
    value: r.name,
    label: r.scientific_name ? `${r.common_name} (${r.scientific_name})` : r.common_name,
    plant_type: r.plant_type,
    spacing_ft: r.spacing_ft,
    item: r.item || null,
  }))
}
