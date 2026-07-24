import { reactive } from "vue"

// The Labor/Equipment/Material add-row interaction from the New Work page,
// pulled out so the Work Detail page's Draft-edit mode can reuse the exact
// same add/remove logic instead of a second copy of it.
export function useLineItemSections() {
  const sections = reactive({
    labor: { open: true, icon: "users", label: "Labor", itemOptions: [], items: [], picker: { itemCode: "", qty: 1, count: 1 } },
    equipment: { open: false, icon: "work", label: "Equipment", itemOptions: [], items: [], picker: { itemCode: "", qty: 1, count: 1 } },
    material: { open: false, icon: "layers", label: "Material", itemOptions: [], items: [], picker: { itemCode: "", qty: 1, count: 1 } },
  })

  function selectedItemFor(category) {
    const sec = sections[category]
    return sec.itemOptions.find((o) => o.value === sec.picker.itemCode) || null
  }

  // Price and unit are already loaded on itemOptions up front, so adding a
  // line item is instant — no network round trip per Add click.
  function addItem(category) {
    const sec = sections[category]
    const item = selectedItemFor(category)
    if (!item || !sec.picker.qty) return

    const count = sec.picker.count || 1
    const qty = sec.picker.qty
    sec.items.push({
      item_code: item.value,
      item_display_name: count > 1 ? `${count} ${item.label}` : item.label,
      qty,
      unit: item.stock_uom,
      unit_price: item.unit_price,
      total_price: item.unit_price * qty * count,
    })
    sec.picker = { itemCode: "", qty: 1, count: 1 }
    sec.open = true
  }

  function removeItem(category, idx) {
    sections[category].items.splice(idx, 1)
  }

  function sectionTotal(category) {
    return sections[category].items.reduce((t, i) => t + (i.total_price || 0), 0)
  }

  return { sections, selectedItemFor, addItem, removeItem, sectionTotal }
}
