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
import CategoryTemplateListView from "@/views/CategoryTemplateListView.vue"
import CategoryTemplateEditorView from "@/views/CategoryTemplateEditorView.vue"
import EstimateListView from "@/views/EstimateListView.vue"
import EstimateSetupView from "@/views/EstimateSetupView.vue"
import EstimateBuilderView from "@/views/EstimateBuilderView.vue"
import EstimateOutputView from "@/views/EstimateOutputView.vue"

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
  { path: "/estimates", name: "estimates", component: EstimateListView, meta: { title: "Estimates" } },
  { path: "/estimates/new", name: "estimate-new", component: EstimateSetupView, meta: { title: "New Estimate" } },
  { path: "/estimates/:id", name: "estimate-detail", component: EstimateBuilderView, meta: { title: "Estimate" } },
  { path: "/estimates/:id/edit", name: "estimate-edit", component: EstimateSetupView, meta: { title: "Edit Estimate" } },
  { path: "/estimates/:id/output", name: "estimate-output", component: EstimateOutputView, meta: { title: "Estimate Documents" } },
  {
    path: "/category-templates",
    name: "category-templates",
    component: CategoryTemplateListView,
    meta: { title: "Category Templates" },
  },
  {
    path: "/category-templates/:id",
    name: "category-template-detail",
    component: CategoryTemplateEditorView,
    meta: { title: "Category Template" },
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
