<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import {
  fetchEstimateWithProject,
  saveEstimate,
  createEstimate,
  approveEstimate,
  convertEstimateToProject,
  linkCustomer,
  linkPlot,
  createPlot,
  amendEstimate,
  cancelEstimate,
  estimateStatusLabel,
  areaLabel,
} from "@/data/estimates.js"
import { fetchCustomers } from "@/data/customers.js"
import { fetchPlotsForCustomer, fetchClusters } from "@/data/plots.js"
import { estimateDraft, clearEstimateDraft } from "@/data/estimateDraft.js"
import { LINE_TYPES, LINE_TYPE_ITEM_GROUPS, fetchAllItemOptions } from "@/data/category_templates.js"
import { formatCurrency } from "@/format.js"

const route = useRoute()
const router = useRouter()

// "/estimates/local" = the pre-Create phase: nothing persisted yet, working
// entirely off the shared draft store Setup just populated. Any other id is
// a real, already-created Estimate.
const isLocalMode = computed(() => route.params.id === "local")

const loading = ref(true)
const error = ref(null)
const doc = ref(null)
const linkedProject = ref(null) // Farm Project referencing this Estimate, if any

// ---- Local editable "sections" view — grouped by section for editing,
// flattened back to the flat line_items table (with its own `section`
// string per row) only at load/save/create boundaries. ----
const sections = reactive([])
const costComponents = reactive([])
const profitType = ref("Percent")
const profitValue = ref(0)
const taxPercent = ref(18)

function groupLineItems(lineItems, sectionDiscounts) {
  const bySection = {}
  const order = []
  for (const li of lineItems || []) {
    const key = li.section || "General"
    if (!bySection[key]) {
      bySection[key] = { name: key, discount: 0, lines: [] }
      order.push(key)
    }
    bySection[key].lines.push({
      line_type: li.line_type,
      source_item: li.source_item,
      description: li.description,
      quantity: li.quantity,
      uom: li.uom,
      rate: li.rate,
      internal_rate: li.internal_rate,
      is_manual: !!li.is_manual,
      is_override: !!li.is_override,
    })
  }
  for (const sd of sectionDiscounts || []) {
    if (!bySection[sd.section]) {
      bySection[sd.section] = { name: sd.section, discount: 0, lines: [] }
      order.push(sd.section)
    }
    bySection[sd.section].discount = sd.discount_percent || 0
  }
  return order.map((k) => bySection[k])
}

function loadIntoLocalState(d) {
  sections.splice(0, sections.length, ...groupLineItems(d.line_items, d.section_discounts))
  costComponents.splice(0, costComponents.length, ...(d.cost_components || []).map((c) => ({ component_name: c.component_name, charge_type: c.charge_type, value: c.value })))
  profitType.value = d.profit_type || "Percent"
  profitValue.value = d.profit_value || 0
  taxPercent.value = d.tax_percent ?? 18
  snapshotPristine()
}

const itemOptions = ref([])

// Vue Router reuses this component instance across /estimates/local ->
// /estimates/EST-XXXX navigations (same matched route, param-only change),
// so this load logic must be re-run on every route.params.id change, not
// just on mount — confirmed live: without the watcher below, Create and
// Amend both left a blank/crashing page (doc.value still null) until a
// manual refresh.
async function loadForRoute() {
  loading.value = true
  error.value = null
  try {
    if (isLocalMode.value) {
      if (!estimateDraft.ready) {
        router.push("/estimates/new")
        return
      }
      doc.value = null
      linkedProject.value = null
      sections.splice(0, sections.length, ...groupLineItems(estimateDraft.line_items, []))
      costComponents.splice(0, costComponents.length, ...estimateDraft.cost_components.map((c) => ({ ...c })))
      snapshotPristine()
    } else {
      const { doc: d, linkedProject: project } = await fetchEstimateWithProject(route.params.id)
      doc.value = d
      linkedProject.value = project
      loadIntoLocalState(doc.value)
    }
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this estimate."
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  itemOptions.value = await fetchAllItemOptions()
  loadForRoute()
})
watch(() => route.params.id, loadForRoute)

function flattenLocalState() {
  const line_items = []
  for (const s of sections) {
    for (const l of s.lines) {
      line_items.push({
        section: s.name,
        line_type: l.line_type,
        source_item: l.source_item || null,
        description: l.description,
        quantity: l.quantity,
        uom: l.uom,
        rate: l.rate,
        internal_rate: l.internal_rate,
        amount: Math.round((l.quantity || 0) * (l.rate || 0) * 100) / 100,
        is_override: l.is_override ? 1 : 0,
        is_manual: l.is_manual ? 1 : 0,
      })
    }
  }
  const section_discounts = sections.filter((s) => s.discount > 0).map((s) => ({ section: s.name, discount_percent: s.discount }))
  const cost_components = costComponents.map((c) => ({ ...c, amount: c.charge_type === "Percent" ? Math.round((calc.value.costSubtotal * c.value) / 100) : c.value }))
  return {
    line_items,
    section_discounts,
    cost_components,
    profit_type: profitType.value,
    profit_value: profitValue.value,
    tax_percent: taxPercent.value,
    cost_subtotal: calc.value.costSubtotal,
    subtotal_before_profit: calc.value.subtotalBeforeProfit,
    subtotal_before_tax: calc.value.subtotalBeforeTax,
    grand_total: calc.value.grandTotal,
  }
}

// ---- UI state ----
const activeTab = ref("lineitems") // 'lineitems' | 'costing'
const showInternalCost = ref(false)
const collapsedSections = ref({})
const addLineSection = ref(null)
const newLine = reactive({ type: "Material", item: null, description: "", qty: "", unit: "", rate: "", internalRate: "" })

// One combobox, not a picker stacked on a separate description field: typing
// searches the item master (filtered to the selected line type's Item
// Groups, LINE_TYPE_ITEM_GROUPS), picking an item auto-fills Unit + Rate
// (same lookup already used for Unit); typing without picking just leaves
// it as a free-text manual line, same as before.
const addLineDropdownOpen = ref(false)
const filteredAddLineItems = computed(() => {
  const groups = LINE_TYPE_ITEM_GROUPS[newLine.type] || []
  const q = (newLine.description || "").trim().toLowerCase()
  return itemOptions.value.filter((o) => groups.includes(o.item_group) && (!q || o.label.toLowerCase().includes(q)))
})
function onAddLineDescriptionInput() {
  newLine.item = null // typing invalidates whatever was picked before
  addLineDropdownOpen.value = true
}
function pickAddLineItem(opt) {
  newLine.item = opt.value
  newLine.description = opt.label
  newLine.unit = opt.stock_uom || newLine.unit
  newLine.rate = opt.unit_price || newLine.rate
  addLineDropdownOpen.value = false
}

const TYPE_COLORS = {
  Material: "bg-warning-soft text-warning",
  Labour: "bg-info-soft text-info",
  Machinery: "bg-positive-soft text-positive",
  Manual: "bg-surface-muted text-muted",
  Overhead: "bg-accent-soft text-accent",
}

// Revised lifecycle model — native docstatus/submit/amend, not a custom
// status field. See estimate-boq-module-plan.md, "Lifecycle model, revised".
const statusLabel = computed(() => (isLocalMode.value ? "Not Created" : estimateStatusLabel(doc.value?.docstatus, !!linkedProject.value)))
const isEditable = computed(() => isLocalMode.value || doc.value?.docstatus === 0)
// Amend only makes sense once submitted, and must be blocked once a Farm
// Project already links back — Frappe's own link-protection does NOT catch
// this (Farm Project isn't submittable, so its docstatus is always 0 and the
// framework's submitted-linked-doc check never triggers). Enforced here.
const canAmend = computed(() => !isLocalMode.value && doc.value?.docstatus === 1 && !linkedProject.value)
// Standalone Cancel (abandon, no replacement) shares Amend's exact
// eligibility: Frappe only allows Submitted -> Cancelled (never
// Draft -> Cancelled — confirmed by reading check_docstatus_transition in
// frappe/model/document.py), so this is Approved-only; and it needs the
// same Farm-Project-link guard as Amend, for the same reason.
const canCancel = computed(() => canAmend.value)
// Standalone entry point into the same Link Customer/Plot modal Convert to
// Project blocks on — reachable any time after Approve, not just when
// attempting conversion.
const needsLinking = computed(() => !isLocalMode.value && doc.value?.docstatus === 1 && (!doc.value?.customer || !doc.value?.plot))

// Dirty-tracking, same pattern as Category Template Editor: snapshot right
// after every load/save, compare live state against it. Not used to gate
// Create in local mode — there's no prior saved state to compare against.
const pristineSnapshot = ref(null)
function snapshotPristine() {
  pristineSnapshot.value = JSON.stringify({ sections, costComponents, profitType: profitType.value, profitValue: profitValue.value, taxPercent: taxPercent.value })
}
const isDirty = computed(() => {
  if (isLocalMode.value || pristineSnapshot.value === null) return false
  return JSON.stringify({ sections, costComponents, profitType: profitType.value, profitValue: profitValue.value, taxPercent: taxPercent.value }) !== pristineSnapshot.value
})

function toggleSection(i) {
  collapsedSections.value[i] = !collapsedSections.value[i]
}
function openAddLine(i) {
  addLineSection.value = i
  Object.assign(newLine, { type: "Material", item: null, description: "", qty: "", unit: "", rate: "", internalRate: "" })
}
function commitLine(i) {
  if (!newLine.description || !newLine.qty || !newLine.rate) return
  sections[i].lines.push({
    line_type: newLine.type,
    source_item: newLine.item || null,
    description: newLine.description,
    quantity: Number(newLine.qty),
    uom: newLine.unit,
    rate: Number(newLine.rate),
    internal_rate: Number(newLine.internalRate) || Number(newLine.rate) * 0.8,
    is_manual: !newLine.item,
    is_override: false,
  })
  addLineSection.value = null
}
function removeLine(sIdx, lIdx) {
  sections[sIdx].lines.splice(lIdx, 1)
}
const sectionNameInputs = ref({})
function addSection() {
  sections.push({ name: "", discount: 0, lines: [] })
  const idx = sections.length - 1
  nextTick(() => sectionNameInputs.value[idx]?.focus())
}
// Editing a template-derived line's own fields flags it as diverged from the
// template default — matches the plan's override layer (Section 5).
function markOverridden(line) {
  if (line.source_item) line.is_override = true
}

function addCostComponent() {
  costComponents.push({ component_name: "Custom Component", charge_type: "Fixed", value: 0 })
}
function removeCostComponent(i) {
  costComponents.splice(i, 1)
}

// ---- Costing sequence — exactly the finalized plan (Section 3) ----
function sectionGross(s) {
  return s.lines.reduce((t, l) => t + (l.quantity || 0) * (l.rate || 0), 0)
}
function sectionInternal(s) {
  return s.lines.reduce((t, l) => t + (l.quantity || 0) * (l.internal_rate || 0), 0)
}
function sectionDiscountAmount(s) {
  return Math.round((sectionGross(s) * (s.discount || 0)) / 100)
}
function sectionSubtotal(s) {
  return sectionGross(s) - sectionDiscountAmount(s)
}

const calc = computed(() => {
  const linesTotal = sections.reduce((t, s) => t + sectionGross(s), 0)
  const discounts = sections.reduce((t, s) => t + sectionDiscountAmount(s), 0)
  const costSubtotal = linesTotal - discounts
  const internalTotal = sections.reduce((t, s) => t + sectionInternal(s), 0)

  const components = costComponents.map((c) => ({ ...c, amount: c.charge_type === "Percent" ? Math.round((costSubtotal * c.value) / 100) : Number(c.value || 0) }))
  const componentsTotal = components.reduce((t, c) => t + c.amount, 0)

  const subtotalBeforeProfit = costSubtotal + componentsTotal
  const profit = profitType.value === "Fixed" ? Number(profitValue.value || 0) : Math.round((subtotalBeforeProfit * (profitValue.value || 0)) / 100)
  const subtotalBeforeTax = subtotalBeforeProfit + profit
  const tax = Math.round((subtotalBeforeTax * (taxPercent.value || 0)) / 100)
  const grandTotal = subtotalBeforeTax + tax

  return {
    linesTotal,
    discounts,
    costSubtotal,
    internalTotal,
    components,
    componentsTotal,
    subtotalBeforeProfit,
    profit,
    subtotalBeforeTax,
    tax,
    grandTotal,
    marginValue: costSubtotal - internalTotal,
    marginPct: costSubtotal ? Math.round(((costSubtotal - internalTotal) / costSubtotal) * 100) : 0,
  }
})

// ---- Save (independent of status transitions; existing docs only) ----
const saving = ref(false)
const saved = ref(false)
const saveError = ref(null)
async function saveChanges() {
  saving.value = true
  saveError.value = null
  try {
    Object.assign(doc.value, flattenLocalState())
    doc.value = await saveEstimate(doc.value)
    loadIntoLocalState(doc.value)
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  } catch (e) {
    saveError.value = e.messages?.[0] || e.message || "Failed to save changes."
  } finally {
    saving.value = false
  }
}

// ---- Create (the real first write, local mode only) ----
const creating = ref(false)
async function createNow() {
  creating.value = true
  saveError.value = null
  try {
    const state = flattenLocalState()
    const created = await createEstimate({
      client_name: estimateDraft.client_name,
      customer: estimateDraft.customer,
      plot: estimateDraft.plot,
      location: estimateDraft.location,
      category: estimateDraft.category,
      area_value: estimateDraft.area_value,
      area_unit: estimateDraft.area_unit,
      area_sqft: estimateDraft.area_sqft,
      duration: estimateDraft.duration,
      line_items: state.line_items,
      cost_components: state.cost_components,
    })
    clearEstimateDraft()
    router.push(`/estimates/${created.name}`)
  } catch (e) {
    saveError.value = e.messages?.[0] || e.message || "Failed to create this estimate."
  } finally {
    creating.value = false
  }
}

function discardDraft() {
  clearEstimateDraft()
  router.push("/estimates/new")
}

// ---- Approve (submit) / Convert to Project ----
const primaryActionLabel = computed(() => {
  if (isLocalMode.value) return null // Create has its own button, see template
  if (doc.value?.docstatus === 0) return "Approve"
  if (doc.value?.docstatus === 1 && !linkedProject.value) return "Convert to Project"
  return null
})
const primaryActionIcon = computed(() => (doc.value?.docstatus === 0 ? "check" : "convert"))

const showConfirmTransition = ref(false)
const pendingAction = ref("") // 'approve' | 'convert'
const transitioning = ref(false)
const transitionError = ref(null)

// ---- Link Customer / Plot — decoupled from Approve/Convert, called out to
// explicitly (see estimates.js linkCustomer/linkPlot). Two entry points
// share the same customer picker state: an optional checkbox inside the
// Approve confirm dialog (a convenience — leaving it unchecked is a valid,
// intentional "Approved, not yet linked" state), and a blocking modal in
// front of Convert to Project (a hard requirement, enforced server-side
// too — see convert_to_project). ----
const allCustomers = ref([])
const customerOptionsForLink = computed(() => allCustomers.value.map((c) => ({ value: c.name, label: c.customer_name })))
async function ensureCustomersLoaded() {
  if (!allCustomers.value.length) allCustomers.value = await fetchCustomers()
}

const linkOnApprove = ref(false)
const approveCustomerMode = ref("existing") // 'existing' | 'new'
const approveCustomerId = ref("")
const approveNewCustomerName = ref("")
const approveCustomerType = ref("Individual")
const approveEmail = ref("")
const approveMobile = ref("")
const approveDuplicate = ref(null) // { message, existingCustomer } | null
watch(linkOnApprove, (v) => {
  if (v) ensureCustomersLoaded()
})
watch(approveCustomerMode, () => (approveDuplicate.value = null))

const showLinkRequired = ref(false)
const convertCustomerMode = ref("existing")
const convertCustomerId = ref("")
const convertNewCustomerName = ref("")
const convertCustomerType = ref("Individual")
const convertEmail = ref("")
const convertMobile = ref("")
const convertPlotMode = ref("existing") // 'existing' | 'new'
const convertPlotId = ref("")
const convertPlots = ref([])
const newPlotName = ref("")
const newPlotArea = ref(0)
const newPlotUnit = ref("Cent")
const newPlotCluster = ref("")
const allClusters = ref([])
const clusterOptionsForLink = computed(() => allClusters.value.map((c) => ({ value: c.name, label: c.cluster_name || c.name })))
async function ensureClustersLoaded() {
  if (!allClusters.value.length) allClusters.value = await fetchClusters()
}
const linking = ref(false)
const linkError = ref(null)
const convertDuplicate = ref(null)
watch(convertCustomerId, async (id) => {
  convertPlotId.value = ""
  convertPlots.value = id ? await fetchPlotsForCustomer(id) : []
})
watch(convertCustomerMode, () => (convertDuplicate.value = null))

// Plot.units options ("Sq.Ft") don't match Estimate.area_unit options
// ("Sqft") — same concept, different literal strings on each doctype.
const AREA_UNIT_TO_PLOT_UNIT = { Sqft: "Sq.Ft", Cent: "Cent", Acre: "Acre" }

// One-click "use the existing customer instead" — the duplicate response
// from linkCustomer carries the matching Customer's name, so this just
// flips the mode and preselects it; the user clicks Link again to commit.
function useDuplicateAsExisting(context) {
  if (context === "approve") {
    approveCustomerMode.value = "existing"
    approveCustomerId.value = approveDuplicate.value.existingCustomer
    approveDuplicate.value = null
  } else {
    convertCustomerMode.value = "existing"
    convertCustomerId.value = convertDuplicate.value.existingCustomer
    convertDuplicate.value = null
  }
}

async function openLinkRequired() {
  linkError.value = null
  convertDuplicate.value = null
  convertCustomerMode.value = "existing"
  convertCustomerId.value = ""
  convertNewCustomerName.value = doc.value?.client_name || ""
  convertCustomerType.value = "Individual"
  convertEmail.value = ""
  convertMobile.value = ""
  convertPlotMode.value = "existing"
  convertPlotId.value = ""
  convertPlots.value = []
  newPlotName.value = ""
  newPlotArea.value = doc.value?.area_value || 0
  newPlotUnit.value = AREA_UNIT_TO_PLOT_UNIT[doc.value?.area_unit] || "Cent"
  newPlotCluster.value = ""
  await Promise.all([ensureCustomersLoaded(), ensureClustersLoaded()])
  if (doc.value.customer) convertPlots.value = await fetchPlotsForCustomer(doc.value.customer)
  showLinkRequired.value = true
}

async function submitLinkRequired() {
  linking.value = true
  linkError.value = null
  convertDuplicate.value = null
  try {
    if (!doc.value.customer) {
      const result =
        convertCustomerMode.value === "existing"
          ? await linkCustomer(doc.value.name, { customer: convertCustomerId.value })
          : await linkCustomer(doc.value.name, { customerName: convertNewCustomerName.value, customerType: convertCustomerType.value, emailId: convertEmail.value, mobileNo: convertMobile.value })
      if (result.duplicate) {
        convertDuplicate.value = result
        return
      }
      doc.value.customer = result.customer
      convertPlots.value = await fetchPlotsForCustomer(doc.value.customer)
    }
    if (!doc.value.plot) {
      if (convertPlotMode.value === "existing" && convertPlotId.value) {
        const result = await linkPlot(doc.value.name, convertPlotId.value)
        doc.value.plot = result.plot
      } else if (convertPlotMode.value === "new" && newPlotName.value && newPlotCluster.value) {
        const result = await createPlot(doc.value.name, { plotName: newPlotName.value, area: newPlotArea.value, units: newPlotUnit.value, cluster: newPlotCluster.value })
        doc.value.plot = result.plot
      }
    }
    if (doc.value.customer && doc.value.plot) {
      showLinkRequired.value = false
      triggerTransition("convert")
    } else if (doc.value.customer && !doc.value.plot) {
      linkError.value = "Pick an existing plot, or fill in the new plot's name and cluster."
    }
  } catch (e) {
    linkError.value = e.messages?.[0] || e.message || "Failed to link customer/plot."
  } finally {
    linking.value = false
  }
}

function triggerTransition(action) {
  transitionError.value = null
  if (action === "convert" && (!doc.value.customer || !doc.value.plot)) {
    openLinkRequired()
    return
  }
  if (action === "approve") {
    linkOnApprove.value = false
    approveCustomerMode.value = "existing"
    approveCustomerId.value = ""
    approveNewCustomerName.value = doc.value?.client_name || ""
    approveCustomerType.value = "Individual"
    approveEmail.value = ""
    approveMobile.value = ""
    approveDuplicate.value = null
  }
  pendingAction.value = action
  showConfirmTransition.value = true
}

async function confirmTransition() {
  showConfirmTransition.value = false
  transitioning.value = true
  transitionError.value = null
  try {
    Object.assign(doc.value, flattenLocalState())
    if (pendingAction.value === "approve") {
      doc.value = await approveEstimate(doc.value)
      if (linkOnApprove.value) {
        try {
          const result =
            approveCustomerMode.value === "existing"
              ? await linkCustomer(doc.value.name, { customer: approveCustomerId.value })
              : await linkCustomer(doc.value.name, { customerName: approveNewCustomerName.value, customerType: approveCustomerType.value, emailId: approveEmail.value, mobileNo: approveMobile.value })
          if (result.duplicate) {
            // The dialog is already closed at this point (Approve itself
            // succeeded) — no live "switch to existing" affordance to show
            // here, unlike the Convert-to-Project modal which stays open.
            // Surface it plainly and point at the retry path instead.
            transitionError.value = `Estimate approved. ${result.message} Click "Convert to Project" to link a customer and pick which one.`
          } else {
            doc.value.customer = result.customer
          }
        } catch (e) {
          transitionError.value = `Estimate approved, but linking the customer failed: ${e.messages?.[0] || e.message || "unknown error"}`
        }
        linkOnApprove.value = false
      }
    } else if (pendingAction.value === "convert") {
      await convertEstimateToProject(doc.value)
      const refreshed = await fetchEstimateWithProject(doc.value.name)
      linkedProject.value = refreshed.linkedProject
    }
    loadIntoLocalState(doc.value)
  } catch (e) {
    transitionError.value = e.messages?.[0] || e.message || "Failed to update this estimate."
  } finally {
    transitioning.value = false
  }
}

// ---- Amend ("Revise" in the UI) ----
const showConfirmAmend = ref(false)
const amending = ref(false)
async function confirmAmend() {
  amending.value = true
  try {
    Object.assign(doc.value, flattenLocalState())
    const created = await amendEstimate(doc.value)
    showConfirmAmend.value = false
    router.push(`/estimates/${created.name}`)
  } catch (e) {
    transitionError.value = e.messages?.[0] || e.message || "Failed to revise this estimate."
    showConfirmAmend.value = false
  } finally {
    amending.value = false
  }
}

// ---- Cancel (abandon, no replacement) ----
const showConfirmCancel = ref(false)
const cancelling = ref(false)
async function confirmCancel() {
  cancelling.value = true
  try {
    doc.value = await cancelEstimate(doc.value.name)
    showConfirmCancel.value = false
    loadIntoLocalState(doc.value)
  } catch (e) {
    transitionError.value = e.messages?.[0] || e.message || "Failed to cancel this estimate."
    showConfirmCancel.value = false
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="space-y-0">
    <!-- Top bar: meta + actions -->
    <div class="flex flex-col lg:flex-row lg:items-start gap-4 mb-5">
      <div class="flex items-start gap-3">
        <button class="text-muted hover:text-foreground p-1 rounded-lg hover:bg-surface-muted transition-colors mt-0.5" @click="router.push('/estimates')">
          <AppIcon name="arrowLeft" :size="20" />
        </button>
        <div>
          <div class="flex items-center gap-3 flex-wrap">
            <h2 class="font-display text-2xl font-semibold text-foreground">{{ isLocalMode ? "New Estimate" : doc.name }}</h2>
            <StatusBadge :status="statusLabel" />
          </div>
          <p v-if="isLocalMode" class="text-sm text-muted mt-0.5">{{ estimateDraft.customer || estimateDraft.client_name }} · {{ estimateDraft.category?.category_name }} · {{ estimateDraft.area_value }} {{ estimateDraft.area_unit }} · {{ estimateDraft.duration || "—" }}</p>
          <p v-else class="text-sm text-muted mt-0.5">{{ doc.customer || doc.client_name }} · {{ doc.category }} · {{ areaLabel(doc) }} · {{ doc.duration || "—" }}</p>
        </div>
      </div>

      <div class="lg:ml-auto flex flex-wrap items-center gap-3">
        <!-- Navigate away / view output — only meaningful once a real record exists -->
        <div v-if="!isLocalMode" class="flex flex-wrap items-center gap-2">
          <router-link
            v-if="isEditable"
            :to="`/estimates/${doc.name}/edit`"
            class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
          >
            <AppIcon name="edit" :size="16" /> Edit Setup
          </router-link>

          <router-link
            :to="`/estimates/${doc.name}/output`"
            class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
          >
            <AppIcon name="file" :size="16" /> Documents
          </router-link>
        </div>

        <div v-if="!isLocalMode" class="hidden sm:block w-px h-6 bg-border" />

        <!-- Mutate / advance this estimate -->
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="isLocalMode">
            <button @click="discardDraft" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors">
              Cancel
            </button>
            <button
              @click="createNow"
              :disabled="creating"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
            >
              <AppIcon name="check" :size="16" /> {{ creating ? "Creating…" : "Create" }}
            </button>
          </template>
          <template v-else>
            <button
              v-if="canAmend"
              @click="showConfirmAmend = true"
              :disabled="isDirty"
              title="Save or discard your changes first"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AppIcon name="edit" :size="16" /> Revise
            </button>

            <button
              v-if="canCancel"
              @click="showConfirmCancel = true"
              :disabled="isDirty"
              title="Save or discard your changes first"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-negative hover:bg-negative-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AppIcon name="x" :size="16" /> Cancel Estimate
            </button>

            <button
              v-if="isEditable"
              @click="saveChanges"
              :disabled="!isDirty || saving"
              class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :class="saved ? 'border-positive text-positive' : ''"
            >
              <AppIcon :name="saved ? 'check' : 'edit'" :size="16" /> {{ saving ? "Saving…" : saved ? "Saved" : "Save Changes" }}
            </button>

            <button
              v-if="primaryActionLabel"
              @click="triggerTransition(doc.docstatus === 0 ? 'approve' : 'convert')"
              :disabled="transitioning || isDirty"
              :title="isDirty ? 'Save your changes first' : ''"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <AppIcon :name="primaryActionIcon" :size="16" /> {{ transitioning ? "Working…" : primaryActionLabel }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <p v-if="transitionError" class="text-sm text-negative bg-negative-soft rounded-lg p-3 mb-5">{{ transitionError }}</p>
    <p v-if="saveError" class="text-sm text-negative bg-negative-soft rounded-lg p-3 mb-5">{{ saveError }}</p>

    <div v-if="!isLocalMode && doc.amended_from" class="bg-surface-muted border border-border rounded-xl px-5 py-3 mb-5 text-sm text-foreground flex items-center gap-2">
      <AppIcon name="copy" :size="15" class="text-muted" />
      Amended from <router-link :to="`/estimates/${doc.amended_from}`" target="_blank" class="text-primary hover:underline font-medium">{{ doc.amended_from }}</router-link>
    </div>

    <!-- Status stepper -->
    <div v-if="!isLocalMode" class="bg-surface border border-border rounded-xl px-5 py-4 mb-5">
      <div class="flex items-center gap-0">
        <template v-for="(s, i) in ['Draft', 'Approved', 'Converted to Project']" :key="s">
          <div class="flex items-center gap-2">
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              :class="
                i < ['Draft', 'Approved', 'Converted to Project'].indexOf(statusLabel)
                  ? 'bg-primary text-primary-foreground'
                  : s === statusLabel
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/20'
                  : 'bg-surface-muted text-muted border border-border'
              "
            >
              <AppIcon v-if="i < ['Draft', 'Approved', 'Converted to Project'].indexOf(statusLabel)" name="check" :size="11" />
              <span v-else>{{ i + 1 }}</span>
            </div>
            <span class="text-sm whitespace-nowrap" :class="i <= ['Draft', 'Approved', 'Converted to Project'].indexOf(statusLabel) ? 'font-medium text-foreground' : 'text-muted'">{{ s }}</span>
          </div>
          <div v-if="i < 2" class="flex-1 h-px mx-2" :class="i < ['Draft', 'Approved', 'Converted to Project'].indexOf(statusLabel) ? 'bg-primary' : 'bg-border'" />
        </template>
      </div>
    </div>

    <!-- Main layout -->
    <div class="flex flex-col lg:flex-row gap-5 items-start">
      <div class="flex-1 min-w-0 space-y-4 w-full">
        <div class="flex gap-1 p-1 bg-surface border border-border rounded-xl w-fit">
          <button @click="activeTab = 'lineitems'" class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors" :class="activeTab === 'lineitems' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'">
            Line Items
          </button>
          <button @click="activeTab = 'costing'" class="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors" :class="activeTab === 'costing' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'">
            Costing & Margins
          </button>
        </div>

        <div v-if="activeTab === 'lineitems'" class="flex items-center justify-between">
          <p class="text-sm text-muted">{{ sections.length }} sections · {{ sections.reduce((t, s) => t + s.lines.length, 0) }} lines</p>
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <span class="text-xs font-medium" :class="showInternalCost ? 'text-negative' : 'text-muted'">
              <AppIcon :name="showInternalCost ? 'eye' : 'eyeOff'" :size="15" class="inline -mt-0.5" />
              {{ showInternalCost ? "Internal cost visible" : "Internal cost hidden" }}
            </span>
            <div @click="showInternalCost = !showInternalCost" class="relative w-9 h-5 rounded-full transition-colors cursor-pointer" :class="showInternalCost ? 'bg-negative' : 'bg-border'">
              <div class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" :class="showInternalCost ? 'left-[calc(100%-18px)]' : 'left-0.5'" />
            </div>
          </label>
        </div>

        <!-- LINE ITEMS TAB -->
        <div v-if="activeTab === 'lineitems'" class="space-y-3">
          <div v-for="(section, sIdx) in sections" :key="sIdx" class="bg-surface border border-border rounded-xl">
            <div class="flex items-center gap-3 px-4 py-3 bg-surface-muted/40 border-b border-border cursor-pointer select-none" @click="toggleSection(sIdx)">
              <AppIcon :name="collapsedSections[sIdx] ? 'chevronRight' : 'chevronDown'" :size="16" class="text-muted flex-shrink-0" />
              <input
                v-if="isEditable"
                v-model="section.name"
                type="text"
                placeholder="Section name"
                @click.stop
                @blur="section.name = section.name.trim() || 'New Section'"
                :ref="(el) => (sectionNameInputs[sIdx] = el)"
                class="font-semibold text-foreground flex-1 bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 -mx-1"
              />
              <h4 v-else class="font-semibold text-foreground flex-1">{{ section.name }}</h4>
              <div v-if="section.discount > 0" class="text-xs text-warning font-medium mr-2">−{{ section.discount }}% ({{ formatCurrency(sectionDiscountAmount(section)) }})</div>
              <span class="text-sm font-semibold text-foreground tabular-nums">{{ formatCurrency(sectionSubtotal(section)) }}</span>
            </div>

            <div v-if="!collapsedSections[sIdx]">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-left border-b border-border">
                    <th class="font-normal text-muted px-4 py-2.5 w-5"></th>
                    <th class="font-normal text-muted px-4 py-2.5">Description</th>
                    <th class="font-normal text-muted px-4 py-2.5 text-right">Qty</th>
                    <th class="font-normal text-muted px-4 py-2.5">Unit</th>
                    <th class="font-normal text-muted px-4 py-2.5 text-right">Rate</th>
                    <th class="font-normal text-muted px-4 py-2.5 text-right">Amount</th>
                    <th v-if="showInternalCost" class="font-normal px-4 py-2.5 text-right bg-negative-soft/30"><span class="text-negative/70 text-[11px] font-semibold">INTERNAL Rate</span></th>
                    <th v-if="showInternalCost" class="font-normal px-4 py-2.5 text-right bg-negative-soft/30"><span class="text-negative/70 text-[11px] font-semibold">INTERNAL Amt</span></th>
                    <th class="font-normal text-muted px-3 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(line, lIdx) in section.lines" :key="lIdx" class="hover:bg-surface-muted/20 transition-colors" :class="line.is_override ? 'bg-accent-soft/20' : ''">
                    <td class="px-4 py-2.5">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" :class="TYPE_COLORS[line.line_type] || 'bg-surface-muted text-muted'">{{ (line.line_type || "?").charAt(0) }}</span>
                    </td>
                    <td class="px-4 py-2.5">
                      <input v-if="isEditable" v-model="line.description" type="text" @change="markOverridden(line)" class="w-full text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 -mx-1" />
                      <span v-else class="text-foreground">{{ line.description }}</span>
                      <div class="flex items-center gap-1.5 mt-0.5">
                        <span v-if="line.is_manual" class="text-[10px] text-muted bg-surface-muted px-1.5 py-0.5 rounded">manual</span>
                        <span v-if="line.is_override" class="text-[10px] text-accent bg-accent-soft px-1.5 py-0.5 rounded font-medium">overridden</span>
                      </div>
                    </td>
                    <td class="px-4 py-2.5 text-right tabular-nums">
                      <input v-if="isEditable" v-model.number="line.quantity" type="number" step="1" @change="markOverridden(line)" class="w-20 text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 text-right tabular-nums" />
                      <span v-else class="text-muted">{{ line.quantity }}</span>
                    </td>
                    <td class="px-4 py-2.5 text-muted">{{ line.uom }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums">
                      <input v-if="isEditable" v-model.number="line.rate" type="number" @change="markOverridden(line)" class="w-20 text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 text-right tabular-nums" />
                      <span v-else class="text-muted">{{ formatCurrency(line.rate) }}</span>
                    </td>
                    <td class="px-4 py-2.5 text-right font-medium text-foreground tabular-nums">{{ formatCurrency((line.quantity || 0) * (line.rate || 0)) }}</td>
                    <td v-if="showInternalCost" class="px-4 py-2.5 text-right tabular-nums bg-negative-soft/20 text-negative/80 text-xs font-medium">{{ formatCurrency(line.internal_rate) }}</td>
                    <td v-if="showInternalCost" class="px-4 py-2.5 text-right tabular-nums bg-negative-soft/20 text-negative font-semibold text-xs">{{ formatCurrency((line.quantity || 0) * (line.internal_rate || 0)) }}</td>
                    <td class="px-3 py-2.5">
                      <button v-if="isEditable" @click="removeLine(sIdx, lIdx)" class="text-muted hover:text-negative transition-colors p-0.5 rounded" aria-label="Remove line">
                        <AppIcon name="x" :size="14" />
                      </button>
                    </td>
                  </tr>

                  <tr v-if="addLineSection === sIdx" class="bg-primary-soft/30">
                    <td class="px-4 py-2.5">
                      <select v-model="newLine.type" class="text-xs rounded-md border border-border bg-surface py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-primary/30 w-24">
                        <option v-for="t in LINE_TYPES" :key="t">{{ t }}</option>
                      </select>
                    </td>
                    <td class="px-4 py-2.5 min-w-[12rem] relative">
                      <input
                        v-model="newLine.description"
                        type="text"
                        placeholder="Search items or type a description…"
                        @focus="addLineDropdownOpen = true"
                        @input="onAddLineDescriptionInput"
                        @blur="addLineDropdownOpen = false"
                        class="w-full text-sm rounded-lg border border-primary/40 bg-surface px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <span v-if="newLine.item" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-primary font-medium bg-primary-soft px-1.5 py-0.5 rounded">linked</span>
                      <ul
                        v-if="addLineDropdownOpen && filteredAddLineItems.length"
                        class="absolute z-20 mt-1 w-72 max-h-56 overflow-auto rounded-lg border border-border bg-surface shadow-lg py-1"
                      >
                        <li
                          v-for="opt in filteredAddLineItems"
                          :key="opt.value"
                          @mousedown.prevent="pickAddLineItem(opt)"
                          class="px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-muted text-foreground flex justify-between gap-2"
                        >
                          <span class="truncate">{{ opt.label }}</span>
                          <span class="text-xs text-muted flex-shrink-0">{{ opt.stock_uom }} · {{ formatCurrency(opt.unit_price) }}</span>
                        </li>
                      </ul>
                    </td>
                    <td class="px-4 py-2.5">
                      <input v-model="newLine.qty" type="number" min="0" step="1" placeholder="Qty" class="w-16 text-sm rounded-lg border border-border bg-surface px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </td>
                    <td class="px-4 py-2.5">
                      <input v-model="newLine.unit" type="text" placeholder="Unit" class="w-16 text-sm rounded-lg border border-border bg-surface px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </td>
                    <td class="px-4 py-2.5">
                      <input v-model="newLine.rate" type="number" min="0" placeholder="Rate" class="w-20 text-sm rounded-lg border border-border bg-surface px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </td>
                    <td class="px-4 py-2.5 text-right text-muted tabular-nums text-sm">{{ newLine.qty && newLine.rate ? formatCurrency(newLine.qty * newLine.rate) : "—" }}</td>
                    <td v-if="showInternalCost" class="px-4 py-2.5 bg-negative-soft/20">
                      <input v-model="newLine.internalRate" type="number" min="0" placeholder="Int. Rate" class="w-20 text-sm rounded-lg border border-border bg-surface px-2 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </td>
                    <td v-if="showInternalCost" class="px-4 py-2.5 bg-negative-soft/20"></td>
                    <td class="px-3 py-2.5">
                      <div class="flex gap-1">
                        <button @click="commitLine(sIdx)" class="text-positive hover:bg-positive-soft rounded p-0.5 transition-colors" aria-label="Confirm add"><AppIcon name="check" :size="14" /></button>
                        <button @click="addLineSection = null" class="text-muted hover:text-negative rounded p-0.5 transition-colors" aria-label="Cancel add"><AppIcon name="x" :size="14" /></button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="!collapsedSections[sIdx] && isEditable" class="flex items-center gap-3 px-4 py-3 border-t border-border bg-surface-muted/20">
              <button v-if="addLineSection !== sIdx" @click="openAddLine(sIdx)" class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary-soft px-2.5 py-1.5 rounded-lg transition-colors">
                <AppIcon name="plus" :size="14" /> Add Line
              </button>
              <div class="ml-auto flex items-center gap-2 text-xs text-muted">
                <span>Section discount:</span>
                <div class="flex items-center gap-1">
                  <div class="relative">
                    <input
                      :value="section.discount"
                      @input="section.discount = Math.min(100, Math.max(0, Number($event.target.value) || 0))"
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      class="w-20 text-sm text-right rounded-lg border border-border bg-surface pl-2 pr-6 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">%</span>
                  </div>
                  <span v-if="section.discount > 0" class="text-warning tabular-nums">= −{{ formatCurrency(sectionDiscountAmount(section)) }}</span>
                </div>
              </div>
            </div>
          </div>

          <button v-if="isEditable" @click="addSection" class="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted hover:border-primary/40 hover:text-primary transition-colors">
            <AppIcon name="plus" :size="16" /> Add Section
          </button>
        </div>

        <!-- COSTING TAB -->
        <div v-if="activeTab === 'costing'" class="space-y-4">
          <div class="bg-surface border border-border rounded-xl overflow-hidden">
            <div class="flex items-center gap-2 px-5 py-3 border-b border-border bg-surface-muted/40">
              <AppIcon name="layers" :size="16" class="text-primary" />
              <h4 class="font-medium text-foreground">Cost Components</h4>
            </div>
            <div class="divide-y divide-border">
              <div v-for="(comp, ci) in calc.components" :key="ci" class="flex items-center gap-3 px-5 py-3 flex-wrap">
                <input v-model="costComponents[ci].component_name" :disabled="!isEditable" type="text" class="flex-1 min-w-[8rem] text-sm rounded-lg border border-border bg-background px-3 py-1.5 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <div class="flex items-center gap-1 p-0.5 rounded-lg bg-surface-muted">
                  <button :disabled="!isEditable" @click="costComponents[ci].charge_type = 'Percent'" class="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors" :class="comp.charge_type === 'Percent' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'">
                    <AppIcon name="percent" :size="12" /> %
                  </button>
                  <button :disabled="!isEditable" @click="costComponents[ci].charge_type = 'Fixed'" class="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors" :class="comp.charge_type === 'Fixed' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'">
                    ₹ Fixed
                  </button>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-muted text-sm">{{ comp.charge_type === "Percent" ? "" : "₹" }}</span>
                  <input v-model.number="costComponents[ci].value" :disabled="!isEditable" type="number" min="0" class="w-24 text-sm text-right rounded-lg border border-border bg-background px-2 py-1.5 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <span v-if="comp.charge_type === 'Percent'" class="text-muted text-sm">%</span>
                </div>
                <span class="text-sm font-semibold text-foreground tabular-nums w-28 text-right">= {{ formatCurrency(comp.amount) }}</span>
                <button v-if="isEditable" @click="removeCostComponent(ci)" class="text-muted hover:text-negative transition-colors p-1 rounded" aria-label="Remove component"><AppIcon name="trash" :size="14" /></button>
              </div>
            </div>
            <div v-if="isEditable" class="px-5 py-3 border-t border-border">
              <button @click="addCostComponent" class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary-soft px-2.5 py-1.5 rounded-lg transition-colors">
                <AppIcon name="plus" :size="14" /> Add Component
              </button>
            </div>
          </div>

          <div class="bg-surface border border-border rounded-xl p-5">
            <h4 class="font-medium text-foreground mb-4">Margins & Tax</h4>
            <div class="grid sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-sm text-muted mb-1.5">Profit Type</label>
                <div class="flex items-center gap-1 p-0.5 rounded-lg bg-surface-muted w-fit">
                  <button :disabled="!isEditable" @click="profitType = 'Percent'" class="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors" :class="profitType === 'Percent' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'">%</button>
                  <button :disabled="!isEditable" @click="profitType = 'Fixed'" class="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors" :class="profitType === 'Fixed' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'">₹ Fixed</button>
                </div>
              </div>
              <div>
                <label class="block text-sm text-muted mb-1.5">Profit Value</label>
                <div class="relative">
                  <input v-model.number="profitValue" :disabled="!isEditable" type="number" min="0" class="w-full py-2.5 px-3 pr-8 rounded-lg bg-background border border-border text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <span v-if="profitType === 'Percent'" class="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">%</span>
                </div>
              </div>
              <div>
                <label class="block text-sm text-muted mb-1.5">Tax (%)</label>
                <div class="relative">
                  <input v-model.number="taxPercent" :disabled="!isEditable" type="number" min="0" max="100" class="w-full py-2.5 px-3 pr-8 rounded-lg bg-background border border-border text-sm disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sticky right sidebar -->
      <div class="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-6 space-y-3">
        <div class="bg-surface border border-border rounded-xl overflow-hidden">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-muted/40">
            <AppIcon name="trending" :size="16" class="text-primary" />
            <h4 class="font-semibold text-foreground text-sm">Costing Summary</h4>
          </div>
          <dl class="px-4 py-3 space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-muted">Lines Total</dt><dd class="tabular-nums text-foreground">{{ formatCurrency(calc.linesTotal) }}</dd></div>
            <div v-if="calc.discounts > 0" class="flex justify-between"><dt class="text-muted">Discounts</dt><dd class="tabular-nums text-warning">−{{ formatCurrency(calc.discounts) }}</dd></div>
            <div class="flex justify-between font-medium pt-1 border-t border-border"><dt class="text-foreground">Cost Subtotal</dt><dd class="tabular-nums">{{ formatCurrency(calc.costSubtotal) }}</dd></div>
            <div v-for="comp in calc.components" :key="comp.component_name" class="flex justify-between">
              <dt class="text-muted">+ {{ comp.component_name }} <span class="text-xs">({{ comp.charge_type === "Percent" ? comp.value + "%" : "fixed" }})</span></dt>
              <dd class="tabular-nums text-foreground">{{ formatCurrency(comp.amount) }}</dd>
            </div>
            <div class="flex justify-between pt-1 border-t border-border"><dt class="text-muted">Subtotal Before Profit</dt><dd class="tabular-nums text-foreground">{{ formatCurrency(calc.subtotalBeforeProfit) }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">+ Profit ({{ profitType === "Percent" ? profitValue + "%" : "fixed" }})</dt><dd class="tabular-nums text-foreground">{{ formatCurrency(calc.profit) }}</dd></div>
            <div class="flex justify-between pt-1 border-t border-border"><dt class="text-muted">Subtotal Before Tax</dt><dd class="tabular-nums text-foreground">{{ formatCurrency(calc.subtotalBeforeTax) }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">+ Tax ({{ taxPercent }}%)</dt><dd class="tabular-nums text-foreground">{{ formatCurrency(calc.tax) }}</dd></div>
          </dl>
          <div class="px-4 py-3 bg-primary text-primary-foreground">
            <div class="flex items-center justify-between">
              <span class="font-semibold">Grand Total</span>
              <span class="font-display text-xl font-bold tabular-nums">{{ formatCurrency(calc.grandTotal) }}</span>
            </div>
          </div>
        </div>

        <div v-if="showInternalCost" class="bg-negative-soft/60 border border-negative/20 rounded-xl px-4 py-3 text-sm">
          <div class="flex items-center gap-2 mb-2">
            <AppIcon name="lock" :size="14" class="text-negative/70" />
            <span class="font-medium text-negative/80 text-xs uppercase tracking-wide">Internal Only</span>
          </div>
          <div class="flex justify-between mb-1"><span class="text-muted">Total Internal Cost</span><span class="tabular-nums text-negative font-medium">{{ formatCurrency(calc.internalTotal) }}</span></div>
          <div class="flex justify-between"><span class="text-muted">Margin Value</span><span class="tabular-nums text-positive font-semibold">{{ formatCurrency(calc.marginValue) }}</span></div>
          <div class="flex justify-between pt-1 border-t border-negative/20 mt-1"><span class="text-muted">Margin %</span><span class="tabular-nums text-positive font-bold">{{ calc.marginPct }}%</span></div>
        </div>

        <div v-if="!isLocalMode" class="bg-surface border border-border rounded-xl p-4 text-sm space-y-2">
          <p class="text-xs font-semibold text-muted uppercase tracking-wide">Quick Actions</p>
          <router-link :to="`/estimates/${doc.name}/output`" class="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <AppIcon name="file" :size="15" /> View Documents
          </router-link>
          <router-link v-if="needsLinking" to="#" @click.prevent="openLinkRequired" class="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <AppIcon name="users" :size="15" /> {{ !doc.customer ? "Link Customer & Plot" : "Link Plot" }}
          </router-link>
          <router-link v-if="canAmend" to="#" @click.prevent="showConfirmAmend = true" class="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
            <AppIcon name="copy" :size="15" /> Revise
          </router-link>
          <router-link v-if="canCancel" to="#" @click.prevent="showConfirmCancel = true" class="flex items-center gap-2 text-negative hover:opacity-80 transition-opacity">
            <AppIcon name="x" :size="15" /> Cancel Estimate
          </router-link>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showConfirmAmend"
      title="Revise this estimate?"
      :message="`This cancels ${doc.name} and creates a new estimate to continue editing, following Frappe's own revision numbering. The original stays visible via its revision history.`"
      confirm-label="Revise"
      cancel-label="Cancel"
      @confirm="confirmAmend"
      @cancel="showConfirmAmend = false"
    />

    <ConfirmDialog
      v-if="showConfirmTransition"
      title="Confirm"
      :message="
        pendingAction === 'approve'
          ? `Approve ${doc.name}? This locks the line items from further direct edits — use Revise afterward if changes are needed.`
          : `Convert ${doc.name} to a Project? This creates a Farm Project record. This cannot be undone.`
      "
      confirm-label="Confirm"
      cancel-label="Cancel"
      @confirm="confirmTransition"
      @cancel="showConfirmTransition = false"
    >
      <div v-if="pendingAction === 'approve' && !doc.customer" class="space-y-2.5 pt-1">
        <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <input type="checkbox" v-model="linkOnApprove" class="rounded border-border" />
          Link a customer now
        </label>
        <div v-if="linkOnApprove" class="space-y-2 pl-6">
          <div class="flex gap-1 p-1 bg-surface-muted rounded-lg w-fit">
            <button
              type="button"
              @click="approveCustomerMode = 'existing'"
              class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              :class="approveCustomerMode === 'existing' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'"
            >
              Existing
            </button>
            <button
              type="button"
              @click="approveCustomerMode = 'new'"
              class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
              :class="approveCustomerMode === 'new' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'"
            >
              New
            </button>
          </div>
          <RecordPicker v-if="approveCustomerMode === 'existing'" v-model="approveCustomerId" :options="customerOptionsForLink" placeholder="Select customer" />
          <template v-else>
            <input
              v-model="approveNewCustomerName"
              type="text"
              placeholder="Customer name"
              class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select v-model="approveCustomerType" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option>Individual</option>
              <option>Company</option>
              <option>Partnership</option>
            </select>
            <div class="grid grid-cols-2 gap-2">
              <input
                v-model="approveEmail"
                type="email"
                placeholder="Email (optional)"
                class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                v-model="approveMobile"
                type="text"
                placeholder="Phone (optional)"
                class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div v-if="approveDuplicate" class="p-2.5 rounded-lg bg-warning-soft border border-warning/20 text-xs text-foreground space-y-1.5">
              <p>{{ approveDuplicate.message }}</p>
              <button type="button" @click="useDuplicateAsExisting('approve')" class="font-semibold text-primary hover:underline">Use the existing customer instead</button>
            </div>
          </template>
        </div>
      </div>
    </ConfirmDialog>

    <div v-if="showLinkRequired" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50" @click.self="showLinkRequired = false">
      <div class="bg-surface rounded-xl w-full max-w-sm shadow-2xl">
        <div class="p-6 space-y-3">
          <div class="flex items-center gap-2.5">
            <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-warning-soft text-warning shrink-0">
              <AppIcon name="alert" :size="18" />
            </span>
            <h3 class="font-display text-lg font-semibold text-foreground">Link Customer & Plot</h3>
          </div>
          <p class="text-sm text-muted leading-relaxed">Converting {{ doc?.name }} to a Project needs a linked Customer and Plot.</p>

          <div v-if="!doc.customer" class="space-y-2">
            <p class="text-xs font-semibold text-muted uppercase tracking-wide">Customer</p>
            <div class="flex gap-1 p-1 bg-surface-muted rounded-lg w-fit">
              <button
                type="button"
                @click="convertCustomerMode = 'existing'"
                class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                :class="convertCustomerMode === 'existing' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'"
              >
                Existing
              </button>
              <button
                type="button"
                @click="convertCustomerMode = 'new'"
                class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                :class="convertCustomerMode === 'new' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'"
              >
                New
              </button>
            </div>
            <RecordPicker v-if="convertCustomerMode === 'existing'" v-model="convertCustomerId" :options="customerOptionsForLink" placeholder="Select customer" />
            <template v-else>
              <input
                v-model="convertNewCustomerName"
                type="text"
                placeholder="Customer name"
                class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <select v-model="convertCustomerType" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option>Individual</option>
                <option>Company</option>
                <option>Partnership</option>
              </select>
              <div class="grid grid-cols-2 gap-2">
                <input
                  v-model="convertEmail"
                  type="email"
                  placeholder="Email (optional)"
                  class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  v-model="convertMobile"
                  type="text"
                  placeholder="Phone (optional)"
                  class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div v-if="convertDuplicate" class="p-2.5 rounded-lg bg-warning-soft border border-warning/20 text-xs text-foreground space-y-1.5">
                <p>{{ convertDuplicate.message }}</p>
                <button type="button" @click="useDuplicateAsExisting('convert')" class="font-semibold text-primary hover:underline">Use the existing customer instead</button>
              </div>
            </template>
          </div>

          <div v-if="doc.customer && !doc.plot" class="space-y-2">
            <p class="text-xs font-semibold text-muted uppercase tracking-wide">Plot</p>
            <div class="flex gap-1 p-1 bg-surface-muted rounded-lg w-fit">
              <button
                type="button"
                @click="convertPlotMode = 'existing'"
                class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                :class="convertPlotMode === 'existing' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'"
              >
                Existing
              </button>
              <button
                type="button"
                @click="convertPlotMode = 'new'"
                class="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                :class="convertPlotMode === 'new' ? 'bg-surface text-foreground shadow-sm' : 'text-muted'"
              >
                New
              </button>
            </div>
            <template v-if="convertPlotMode === 'existing'">
              <RecordPicker v-model="convertPlotId" :options="convertPlots.map((p) => ({ value: p.name, label: `${p.plot_name} — ${p.area} ${p.units}` }))" placeholder="Select plot" />
              <p v-if="!convertPlots.length" class="text-xs text-muted">No plots on file for this customer yet — switch to "New" to create one.</p>
            </template>
            <template v-else>
              <p class="text-xs text-muted">For {{ doc.customer }}</p>
              <input
                v-model="newPlotName"
                type="text"
                placeholder="Plot name / number"
                class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div class="grid grid-cols-2 gap-2">
                <input
                  v-model.number="newPlotArea"
                  type="number"
                  step="0.01"
                  placeholder="Area"
                  class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <select v-model="newPlotUnit" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option>Sq.Ft</option>
                  <option>Cent</option>
                  <option>Acre</option>
                </select>
              </div>
              <RecordPicker v-model="newPlotCluster" :options="clusterOptionsForLink" placeholder="Select cluster" />
            </template>
          </div>

          <p v-if="linkError" class="text-sm text-negative bg-negative-soft rounded-lg p-2.5">{{ linkError }}</p>
        </div>
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button class="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="showLinkRequired = false">Cancel</button>
          <button
            class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="linking"
            @click="submitLinkRequired"
          >
            {{ linking ? "Linking…" : "Link" }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showConfirmCancel"
      title="Cancel this estimate?"
      :message="`This cancels ${doc.name} for good — no replacement is created. Use Revise instead if you want to keep working on it. This cannot be undone.`"
      confirm-label="Yes, Cancel Estimate"
      cancel-label="Go Back"
      @confirm="confirmCancel"
      @cancel="showConfirmCancel = false"
    />
  </div>
</template>
