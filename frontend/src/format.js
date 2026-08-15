export function formatCurrency(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN")
}

export function formatDate(iso) {
  if (!iso) return ""
  // Plain "YYYY-MM-DD" strings (Frappe Date fields) parse as UTC midnight in
  // JS — toLocaleDateString then renders that in the browser's local
  // timezone, which rolls the date back a day for any timezone behind UTC.
  // Building the Date from local year/month/day parts instead sidesteps the
  // UTC round-trip entirely. Full datetime strings (e.g. Comment.creation)
  // don't have this ambiguity, so they go through the normal Date parser.
  let date
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number)
    date = new Date(y, m - 1, d)
  } else {
    date = new Date(iso)
  }
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}
