// Populated by www/farmpro.html from the logged-in Frappe session — never mock data.
const boot = window.frappe_boot || {}

export const session = {
  user: boot.user || "",
  fullName: boot.full_name || boot.user || "",
  csrfToken: boot.csrf_token || "",
}

export function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("")
}
