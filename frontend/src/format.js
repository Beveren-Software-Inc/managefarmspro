export function formatCurrency(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN")
}

export function formatDate(iso) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}
