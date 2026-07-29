// Populated by www/farmpro.html from the logged-in Frappe session — never mock data.
const boot = window.frappe_boot || {}

export const session = {
  user: boot.user || "",
  fullName: boot.full_name || boot.user || "",
  csrfToken: boot.csrf_token || "",
  roles: boot.roles || [],
}

// Client-side-only gate — real enforcement is still the doctype's own
// System Manager-only permission (project_category.json). This just hides
// the New/Clone/Edit actions from users who'd fail the save anyway, instead
// of showing controls that silently 403. Not a role system — a narrow,
// single-purpose check for this one entry point.
export function isSystemManager() {
  return session.roles.includes("System Manager")
}

export function initials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("")
}
