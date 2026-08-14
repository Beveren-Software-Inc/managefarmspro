import { call } from "@/call.js"

const FIELDS = [
  "name",
  "estimate",
  "customer",
  "plot",
  "category",
  "status",
  "estimated_cost",
  "actual_cost",
  "cost_balance",
]

export function farmProjectBalance(project) {
  return project.cost_balance ?? project.estimated_cost - project.actual_cost
}

export async function fetchFarmProjects() {
  return call("frappe.client.get_list", {
    doctype: "Farm Project",
    fields: FIELDS,
    limit_page_length: 0,
    order_by: "creation desc",
  })
}

export async function fetchFarmProjectsForPlot(plotName) {
  return call("frappe.client.get_list", {
    doctype: "Farm Project",
    fields: FIELDS,
    filters: [["plot", "=", plotName]],
    limit_page_length: 0,
    order_by: "creation desc",
  })
}

export async function fetchFarmProjectDetail(name) {
  return call("frappe.client.get", { doctype: "Farm Project", name })
}

export async function updateFarmProjectStatus(name, status) {
  const doc = await call("frappe.client.get", { doctype: "Farm Project", name })
  doc.status = status
  return call("frappe.client.save", { doc })
}

// Tasks are edited as a full local array in the detail view (add/toggle
// status/remove), then saved back in one shot here — same "load doc, patch,
// save" shape as updateFarmProjectStatus/updateCategoryTemplate, avoiding a
// separate add/update/remove RPC per action for what's really one field.
export async function saveFarmProjectTasks(name, tasks) {
  const doc = await call("frappe.client.get", { doctype: "Farm Project", name })
  doc.tasks = tasks
  return call("frappe.client.save", { doc })
}
