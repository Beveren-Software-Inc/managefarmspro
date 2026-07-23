import { createRouter, createWebHistory } from "vue-router"
import ComingSoonView from "@/views/ComingSoonView.vue"
import DashboardView from "@/views/DashboardView.vue"
import CustomerListView from "@/views/CustomerListView.vue"
import CustomerDetailView from "@/views/CustomerDetailView.vue"
import PlotListView from "@/views/PlotListView.vue"
import PlotDetailView from "@/views/PlotDetailView.vue"
import GenerateInvoiceView from "@/views/GenerateInvoiceView.vue"
import InvoiceHistoryView from "@/views/InvoiceHistoryView.vue"
import WorkListView from "@/views/WorkListView.vue"
import WorkDetailView from "@/views/WorkDetailView.vue"
import WorkEntryView from "@/views/WorkEntryView.vue"

function stub(label, title) {
  return { component: ComingSoonView, props: { screen: label }, meta: { title } }
}

const routes = [
  { path: "/", name: "dashboard", component: DashboardView, meta: { title: "Dashboard" } },
  { path: "/owners", name: "owners", component: CustomerListView, meta: { title: "Customers" } },
  { path: "/owners/:id", name: "owner-detail", component: CustomerDetailView, meta: { title: "Customer" } },
  { path: "/plots", name: "plots", component: PlotListView, meta: { title: "Plots" } },
  { path: "/plots/:id", name: "plot-detail", component: PlotDetailView, meta: { title: "Plot" } },
  { path: "/works", name: "works", component: WorkListView, meta: { title: "Works" } },
  { path: "/works/new", name: "work-new", component: WorkEntryView, meta: { title: "New Work" } },
  { path: "/works/:id", name: "work-detail", component: WorkDetailView, meta: { title: "Work" } },
  {
    path: "/invoices",
    name: "invoices",
    component: InvoiceHistoryView,
    meta: { title: "Invoices" },
  },
  {
    path: "/invoices/generate",
    name: "invoice-generate",
    component: GenerateInvoiceView,
    meta: { title: "Generate Invoice" },
  },
]

const router = createRouter({
  history: createWebHistory("/farmpro/"),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
