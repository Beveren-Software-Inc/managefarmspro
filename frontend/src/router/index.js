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
import FarmProjectListView from "@/views/FarmProjectListView.vue"
import FarmProjectDetailView from "@/views/FarmProjectDetailView.vue"
import LowBalancePlotsView from "@/views/LowBalancePlotsView.vue"
import SiteVisitListView from "@/views/SiteVisitListView.vue"
import SiteVisitSetupView from "@/views/SiteVisitSetupView.vue"
import SiteVisitDetailView from "@/views/SiteVisitDetailView.vue"
import SiteVisitCalendarView from "@/views/SiteVisitCalendarView.vue"
import SiteVisitSettingsView from "@/views/SiteVisitSettingsView.vue"

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
  { path: "/low-balance-plots", name: "low-balance-plots", component: LowBalancePlotsView, meta: { title: "Low Balance Plots" } },
  { path: "/site-visits", name: "site-visits", component: SiteVisitListView, meta: { title: "Site Visits" } },
  { path: "/site-visits/new", name: "site-visit-new", component: SiteVisitSetupView, meta: { title: "New Site Visit" } },
  { path: "/site-visits/calendar", name: "site-visit-calendar", component: SiteVisitCalendarView, meta: { title: "Visit Calendar" } },
  { path: "/site-visits/:id", name: "site-visit-detail", component: SiteVisitDetailView, meta: { title: "Site Visit" } },
  {
    path: "/settings/site-visit-pricing",
    name: "site-visit-settings",
    component: SiteVisitSettingsView,
    meta: { title: "Site Visit Pricing" },
  },
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
  { path: "/projects", name: "projects", component: FarmProjectListView, meta: { title: "Farm Projects" } },
  { path: "/projects/:id", name: "project-detail", component: FarmProjectDetailView, meta: { title: "Farm Project" } },
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
