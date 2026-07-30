<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { useRouter, useRoute } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import { fetchCategoryTemplates, fetchCategoryTemplate, CATEGORY_ICONS, spacingLabel, pitSizeLabel, supervisionLabel } from "@/data/category_templates.js"
import { fetchCustomers } from "@/data/customers.js"
import { fetchPlotsForCustomer } from "@/data/plots.js"
import { buildLineItemsFromTemplate, fetchEstimateDetail, saveEstimate, toSqft } from "@/data/estimates.js"
import { setEstimateDraft } from "@/data/estimateDraft.js"
import { formatCurrency } from "@/format.js"

const router = useRouter()
const route = useRoute()

// /estimates/new vs /estimates/:id/edit — same wizard, same component, same
// pattern the v0 reference itself uses (both routes point at this view).
// Edit mode only makes sense for a Draft (docstatus 0) — Builder only shows
// the "Edit Setup" link then — but guard here too in case someone lands on
// the URL directly against a submitted estimate.
const isEdit = computed(() => !!route.params.id)
const currentStep = ref(isEdit.value ? 2 : 0) // jump straight to Area & Duration, same as v0; Back still reaches Category/Client

const loading = ref(true)
const error = ref(null)
const categories = ref([])
const customers = ref([])
// Snapshot right after prefill — used only to warn if Category/Area changed,
// since line items aren't auto-regenerated on edit (see goNext()).
const originalCategory = ref(null)
const originalAreaSqft = ref(null)

onMounted(async () => {
  try {
    const [cats, custs] = await Promise.all([fetchCategoryTemplates(), fetchCustomers()])
    categories.value = cats
    customers.value = custs

    if (isEdit.value) {
      const doc = await fetchEstimateDetail(route.params.id)
      if (doc.docstatus !== 0) {
        error.value = "This estimate is no longer a Draft, so its setup can't be edited."
        return
      }
      selectedCategory.value = doc.category || ""
      if (doc.customer) {
        clientMode.value = "customer"
        customerId.value = doc.customer
        plotId.value = doc.plot || ""
      } else {
        clientMode.value = "prospect"
        prospectName.value = doc.client_name || ""
        prospectLocation.value = doc.location || ""
      }
      // Stored data only keeps area_value + area_unit, never whether the
      // original entry was Length×Width — so edit mode starts from whatever
      // unit is on file (never back into "lxw"), which is all the data
      // actually supports.
      if (["Acre", "Cent", "Sqft"].includes(doc.area_unit)) {
        areaMode.value = doc.area_unit
        areaValue.value = doc.area_value
      }
      duration.value = doc.duration || ""
      originalCategory.value = doc.category || ""
      originalAreaSqft.value = doc.area_sqft || 0
    }
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load setup data."
  } finally {
    loading.value = false
  }
})

// ── Step 0: Category ──────────────────────────────────────────
// Edit mode stays single-category (selectedCategory) — recalculation diffs
// against one fresh template, and reworking that for multiple categories is
// out of scope here (see goNext()'s edit branch). Create mode is
// multi-select (selectedCategories, ordered — first picked is primary,
// becomes Estimate.category/Farm Project.category) — a real business
// scenario per the client's own "Complete Plot Development" description
// (food forest + boundary + composting + water catchment, bundled per
// client, not a fixed combination worth its own category).
const selectedCategory = ref("")
const selectedCategories = ref([])
const selectedTemplate = ref(null) // full doc for whichever category is currently previewed
const loadingTemplate = ref(false)

watch(selectedCategory, async (name) => {
  if (!name) {
    selectedTemplate.value = null
    return
  }
  loadingTemplate.value = true
  try {
    selectedTemplate.value = await fetchCategoryTemplate(name)
  } finally {
    loadingTemplate.value = false
  }
})

function toggleCategory(name) {
  selectedCategory.value = name // drives the preview panel either way
  if (isEdit.value) return // edit mode stays single-select
  const i = selectedCategories.value.indexOf(name)
  if (i === -1) selectedCategories.value.push(name)
  else selectedCategories.value.splice(i, 1)
}
function removeSelectedCategory(name) {
  selectedCategories.value = selectedCategories.value.filter((n) => n !== name)
}

const TYPE_COLORS = {
  Material: "bg-warning-soft text-warning",
  Labour: "bg-info-soft text-info",
  Machinery: "bg-positive-soft text-positive",
  Manual: "bg-surface-muted text-muted",
  Overhead: "bg-accent-soft text-accent",
}

// ── Step 1: Client ─────────────────────────────────────────────
const clientMode = ref("customer")
const customerOptions = computed(() => customers.value.map((c) => ({ value: c.name, label: c.customer_name })))
const customerId = ref("")
const plotId = ref("")
const prospectName = ref("")
const prospectLocation = ref("")

const selectedCustomer = computed(() => customers.value.find((c) => c.name === customerId.value) || null)
const customerPlots = ref([])
watch(customerId, async (id) => {
  plotId.value = ""
  customerPlots.value = id ? await fetchPlotsForCustomer(id) : []
})
const plotOptions = computed(() => customerPlots.value.map((p) => ({ value: p.name, label: `${p.plot_name} — ${p.area} ${p.units} (${p.cluster})` })))

// ── Step 2: Area & Duration ────────────────────────────────────
const AREA_MODES = [
  { key: "lxw", label: "Length × Width" },
  { key: "Acre", label: "Acres" },
  { key: "Cent", label: "Cents" },
  { key: "Sqft", label: "Sq.ft" },
]
const areaMode = ref("lxw")
const areaLength = ref("")
const areaWidth = ref("")
const areaValue = ref("")
const duration = ref("")

function setAreaMode(key) {
  areaMode.value = key
  areaLength.value = ""
  areaWidth.value = ""
  areaValue.value = ""
}

const areaSqft = computed(() => {
  if (areaMode.value === "lxw") return Math.round((Number(areaLength.value) || 0) * (Number(areaWidth.value) || 0))
  return toSqft(areaMode.value, areaValue.value)
})

// ── Steps ──────────────────────────────────────────────────────
const steps = [
  { key: "category", label: "Category", icon: "template" },
  { key: "client", label: "Client", icon: "users" },
  { key: "area", label: "Area & Duration", icon: "plot" },
]

const canStep1 = computed(() => (isEdit.value ? !!selectedCategory.value : selectedCategories.value.length > 0))
const canStep2 = computed(() => (clientMode.value === "customer" ? !!customerId.value : !!prospectName.value.trim() && !!prospectLocation.value.trim()))
const canStep3 = computed(() => areaSqft.value > 0)

const creating = ref(false)
const createError = ref(null)

// Line items were generated from the *original* category/area. Editing
// setup here always patches the header fields; whether it also touches
// line_items depends on recalculateLines below.
const setupChanged = computed(() => isEdit.value && (selectedCategory.value !== originalCategory.value || areaSqft.value !== originalAreaSqft.value))
const recalculateLines = ref(true) // only surfaced/consulted when setupChanged

// Override-aware merge (plan.md: "recalculating on an area change skips any
// line flagged is_override"), extended the same way to freely-added lines —
// a hand-added line carries just as much real intent as an edited template
// row, and there's no separate flag marking "added by the user" to tell it
// apart from a template row otherwise. So the only lines ever regenerated
// are ones that are BOTH item-linked (source_item set, i.e. actually came
// from the template) AND never overridden — every manual, overridden, or
// freely-added line is left exactly as-is.
//
// Manual template rows (e.g. "Design and Layout") reappear in freshLines
// every time buildLineItemsFromTemplate runs, since the template always
// includes its own placeholders — skip re-adding one if a preserved row
// already has the same description, or filling one in would leave a
// duplicate blank placeholder sitting next to the real one. Same problem for
// an *overridden* item-linked row: the item it came from is still part of
// the category template, so it still shows up in freshLines too — skip
// re-adding by source_item for the same reason (caught via simulation
// before this ever touched a real record: an overridden row and its fresh
// duplicate both survived until this check was added).
//
// Cost components (Supervision/Consultation/etc.) are never touched here —
// unlike line items they carry no override flag at all, so there is no way
// to distinguish an edited percentage from a template default. Leaving them
// alone is the only choice that can't silently overwrite real user input.
function mergeRegeneratedLines(oldLines, freshLines) {
  const preserved = (oldLines || []).filter((l) => l.is_override || l.is_manual)
  const preservedManualDescriptions = new Set(preserved.filter((l) => l.is_manual).map((l) => l.description))
  const preservedSourceItems = new Set(preserved.filter((l) => l.source_item).map((l) => l.source_item))
  const freshToAdd = freshLines.filter((l) => {
    if (l.is_manual) return !preservedManualDescriptions.has(l.description)
    if (l.source_item) return !preservedSourceItems.has(l.source_item)
    return true
  })
  return [...preserved, ...freshToAdd]
}

async function goNext() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
    return
  }

  if (isEdit.value) {
    creating.value = true
    createError.value = null
    try {
      const fresh = await fetchEstimateDetail(route.params.id)
      const patch = {
        category: selectedCategory.value,
        client_name: clientMode.value === "customer" ? selectedCustomer.value?.customer_name : prospectName.value.trim(),
        customer: clientMode.value === "customer" ? customerId.value || null : null,
        plot: clientMode.value === "customer" ? plotId.value || null : null,
        location: clientMode.value === "customer" ? null : prospectLocation.value.trim(),
        area_value: areaMode.value === "lxw" ? areaSqft.value : Number(areaValue.value),
        area_unit: areaMode.value === "lxw" ? "Sqft" : areaMode.value,
        area_sqft: areaSqft.value,
        duration: duration.value,
      }
      if (setupChanged.value && recalculateLines.value) {
        const { line_items: freshLines } = await buildLineItemsFromTemplate(selectedTemplate.value, areaSqft.value)
        patch.line_items = mergeRegeneratedLines(fresh.line_items, freshLines)
      }
      Object.assign(fresh, patch)
      await saveEstimate(fresh)
      router.push(`/estimates/${route.params.id}`)
    } catch (e) {
      createError.value = e.messages?.[0] || e.message || "Failed to save these changes."
    } finally {
      creating.value = false
    }
    return
  }

  // Nothing persisted here — this only assembles the local draft (line
  // items/cost components from the template) and hands it to the Builder's
  // "before Create" phase. The actual insert happens later, when the user
  // clicks Create there, per the revised lifecycle model.
  creating.value = true
  createError.value = null
  try {
    // Multi-category: apply every selected template, in selection order.
    // Only the first (primary) contributes cost_components — Supervision/
    // Consultation apply once per project, not once per bundled category,
    // or a 3-category estimate would end up with 3 Supervision rows.
    const templates = await Promise.all(selectedCategories.value.map((name) => fetchCategoryTemplate(name)))
    const built = await Promise.all(templates.map((t) => buildLineItemsFromTemplate(t, areaSqft.value)))
    const line_items = built.flatMap((b) => b.line_items)
    const cost_components = built[0]?.cost_components || []
    setEstimateDraft({
      category: templates[0],
      client_name: clientMode.value === "customer" ? selectedCustomer.value?.customer_name : prospectName.value.trim(),
      customer: clientMode.value === "customer" ? customerId.value : null,
      plot: clientMode.value === "customer" ? plotId.value || null : null,
      location: clientMode.value === "customer" ? null : prospectLocation.value.trim(),
      area_value: areaMode.value === "lxw" ? areaSqft.value : Number(areaValue.value),
      area_unit: areaMode.value === "lxw" ? "Sqft" : areaMode.value,
      area_sqft: areaSqft.value,
      duration: duration.value,
      line_items,
      cost_components,
    })
    router.push("/estimates/local")
  } catch (e) {
    createError.value = e.messages?.[0] || e.message || "Failed to build this estimate."
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="max-w-3xl mx-auto space-y-6">
    <!-- Page header -->
    <div class="flex items-center gap-3">
      <button
        class="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-muted transition-colors"
        @click="router.push(isEdit ? `/estimates/${route.params.id}` : '/estimates')"
        aria-label="Go back"
      >
        <AppIcon name="arrowLeft" :size="20" />
      </button>
      <div>
        <h2 class="font-display text-2xl font-semibold text-foreground">{{ isEdit ? `Edit Estimate · ${route.params.id}` : "New Estimate" }}</h2>
        <p class="text-sm text-muted mt-0.5">{{ isEdit ? "Update project details for this draft." : "Set up project details, then proceed to the builder." }}</p>
      </div>
    </div>

    <!-- Stepper -->
    <div class="flex items-center gap-0">
      <template v-for="(step, i) in steps" :key="step.key">
        <div class="flex items-center gap-2">
          <div
            class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all"
            :class="currentStep > i ? 'bg-primary text-primary-foreground' : currentStep === i ? 'bg-primary text-primary-foreground ring-[3px] ring-primary/20' : 'bg-surface-muted text-muted border border-border'"
          >
            <AppIcon v-if="currentStep > i" name="check" :size="13" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="text-sm font-medium whitespace-nowrap" :class="currentStep >= i ? 'text-foreground' : 'text-muted'">{{ step.label }}</span>
        </div>
        <div v-if="i < steps.length - 1" class="flex-1 h-px mx-3 transition-colors" :class="currentStep > i ? 'bg-primary/30' : 'bg-border'" />
      </template>
    </div>

    <p v-if="createError" class="text-sm text-negative bg-negative-soft rounded-lg p-3">{{ createError }}</p>

    <!-- STEP 0 — Category -->
    <template v-if="currentStep === 0">
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-display text-base font-semibold text-foreground mb-1">Select Project Category</h3>
        <p class="text-xs text-muted mb-4">
          {{
            isEdit
              ? "Choose the category that best describes this project. A template will be pre-loaded."
              : "Pick one or more categories — each applies its own template. The first one picked is the primary category. Click a card again to preview it without changing your selection."
          }}
        </p>

        <div class="grid sm:grid-cols-2 gap-2.5">
          <button
            v-for="t in categories"
            :key="t.name"
            @click="toggleCategory(t.name)"
            class="flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all"
            :class="
              (isEdit ? selectedCategory === t.name : selectedCategories.includes(t.name))
                ? 'border-primary bg-primary-soft shadow-sm'
                : 'border-border bg-surface hover:border-primary/40 hover:bg-surface-muted/40'
            "
          >
            <div
              class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
              :class="(isEdit ? selectedCategory === t.name : selectedCategories.includes(t.name)) ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-primary'"
            >
              <AppIcon :name="CATEGORY_ICONS[t.category_name] || 'leaf'" :size="16" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-medium text-foreground text-sm leading-tight">{{ t.category_name }}</p>
              <p class="text-xs text-muted mt-0.5 truncate">Spacing: {{ spacingLabel(t) }}</p>
            </div>
            <div
              class="flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
              :class="(isEdit ? selectedCategory === t.name : selectedCategories.includes(t.name)) ? 'border-primary bg-primary' : 'border-border'"
            >
              <AppIcon v-if="isEdit ? selectedCategory === t.name : selectedCategories.includes(t.name)" name="check" :size="9" class="text-primary-foreground" />
            </div>
          </button>
        </div>

        <div v-if="!isEdit && selectedCategories.length" class="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-border">
          <span class="text-xs text-muted mr-1">Applying:</span>
          <span
            v-for="(name, i) in selectedCategories"
            :key="name"
            class="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium"
            :class="i === 0 ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-foreground border border-border'"
          >
            {{ name }} <span v-if="i === 0" class="opacity-75">· Primary</span>
            <button @click.stop="removeSelectedCategory(name)" class="p-0.5 rounded-full hover:bg-black/10" :aria-label="`Remove ${name}`">
              <AppIcon name="x" :size="10" />
            </button>
          </span>
        </div>
      </div>

      <p v-if="loadingTemplate" class="text-sm text-muted text-center py-4">Loading template…</p>
      <div v-else-if="selectedTemplate" class="bg-surface border border-border rounded-xl overflow-hidden">
        <div class="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-surface-muted/30">
          <AppIcon name="template" :size="16" class="text-primary" />
          <span class="font-medium text-foreground text-sm">Template Preview — {{ selectedTemplate.category_name }}</span>
        </div>

        <div class="grid grid-cols-3 gap-px bg-border border-b border-border">
          <div class="bg-surface px-4 py-3">
            <p class="text-[11px] text-muted uppercase tracking-wide font-medium">Spacing</p>
            <p class="text-sm font-medium text-foreground mt-0.5">{{ spacingLabel(selectedTemplate) }}</p>
          </div>
          <div class="bg-surface px-4 py-3">
            <p class="text-[11px] text-muted uppercase tracking-wide font-medium">Pit Size</p>
            <p class="text-sm font-medium text-foreground mt-0.5">{{ pitSizeLabel(selectedTemplate) }}</p>
          </div>
          <div class="bg-surface px-4 py-3">
            <p class="text-[11px] text-muted uppercase tracking-wide font-medium">Supervision</p>
            <p class="text-sm font-medium text-foreground mt-0.5">{{ supervisionLabel(selectedTemplate) }}</p>
          </div>
        </div>

        <p v-if="!selectedTemplate.items?.length" class="px-5 py-4 text-sm text-muted">No standard items on this template yet.</p>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-surface-muted/30 border-b border-border">
                <th class="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Item</th>
                <th class="text-left px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Type</th>
                <th class="text-left px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Basis</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <tr v-for="(l, i) in selectedTemplate.items" :key="i" class="hover:bg-surface-muted/20 transition-colors">
                <td class="px-4 py-2.5 text-foreground">{{ l.item || l.description }}</td>
                <td class="px-3 py-2.5">
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" :class="TYPE_COLORS[l.line_type] || 'bg-surface-muted text-muted'">{{ l.line_type || "—" }}</span>
                </td>
                <td class="px-3 py-2.5 text-muted">{{ l.is_manual ? "Manual" : l.consumption_basis }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="selectedTemplate.activities?.length" class="flex flex-wrap gap-1.5 px-4 py-3 border-t border-border bg-surface-muted/20">
          <span class="text-xs text-muted mr-1 self-center">Activities:</span>
          <span v-for="act in selectedTemplate.activities" :key="act.name" class="px-2.5 py-0.5 rounded-full bg-surface border border-border text-xs text-foreground">{{ act.activity }}</span>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <p v-if="!canStep1" class="text-xs text-muted">Select a category above to preview its template.</p>
        <span v-else class="text-xs text-positive flex items-center gap-1">
          <AppIcon name="check" :size="13" />
          {{ isEdit || selectedCategories.length <= 1 ? "Template ready to apply" : `${selectedCategories.length} templates ready to apply` }}
        </span>
        <button
          :disabled="!canStep1"
          @click="goNext"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Apply Template{{ !isEdit && selectedCategories.length > 1 ? "s" : "" }} & Continue <AppIcon name="chevronRight" :size="16" />
        </button>
      </div>
    </template>

    <!-- STEP 1 — Client -->
    <template v-if="currentStep === 1">
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-display text-base font-semibold text-foreground mb-1">Client Details</h3>
        <p class="text-xs text-muted mb-5">Link this estimate to an existing customer or enter a prospect's details.</p>

        <div class="flex gap-1 p-1 bg-surface-muted rounded-lg w-fit mb-6">
          <button
            @click="clientMode = 'customer'"
            class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="clientMode === 'customer' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'"
          >
            <span class="flex items-center gap-1.5"><AppIcon name="users" :size="14" /> Existing Customer</span>
          </button>
          <button
            @click="clientMode = 'prospect'"
            class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
            :class="clientMode === 'prospect' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'"
          >
            <span class="flex items-center gap-1.5"><AppIcon name="users" :size="14" /> Prospect</span>
          </button>
        </div>

        <div v-if="clientMode === 'customer'" class="space-y-4">
          <label class="block">
            <span class="text-sm text-muted mb-1.5 block">Customer <span class="text-negative">*</span></span>
            <RecordPicker v-model="customerId" :options="customerOptions" placeholder="Select customer" />
          </label>

          <div v-if="selectedCustomer" class="flex items-center gap-3 p-3.5 rounded-xl bg-primary-soft border border-primary/15">
            <div class="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
              {{ selectedCustomer.customer_name.charAt(0) }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-foreground text-sm">{{ selectedCustomer.customer_name }}</p>
              <p class="text-xs text-muted truncate">
                {{ selectedCustomer.customer_type }} · {{ selectedCustomer.mobile_no || "No phone on file" }} · {{ selectedCustomer.plot_count }} plot{{ selectedCustomer.plot_count !== 1 ? "s" : "" }}
              </p>
            </div>
            <span class="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase" :class="!selectedCustomer.disabled ? 'bg-positive-soft text-positive' : 'bg-surface-muted text-muted'">
              {{ !selectedCustomer.disabled ? "Active" : "Inactive" }}
            </span>
          </div>

          <label class="block">
            <span class="text-sm text-muted mb-1.5 block">Linked Plot <span class="text-muted text-xs">(optional)</span></span>
            <RecordPicker v-model="plotId" :options="plotOptions" :placeholder="customerId ? 'No plot linked' : 'Select a customer first'" />
            <p v-if="!customerId" class="text-xs text-muted mt-1">Select a customer first to see their plots.</p>
          </label>
        </div>

        <div v-else class="space-y-4">
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Client Name <span class="text-negative">*</span></span>
              <input v-model="prospectName" type="text" placeholder="e.g. Anjali Menon" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Location / Site Address <span class="text-negative">*</span></span>
              <input v-model="prospectLocation" type="text" placeholder="e.g. Yelahanka New Town, Bengaluru" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
          </div>

          <div class="flex items-start gap-2.5 p-3.5 rounded-xl bg-info-soft border border-info/15 text-xs text-info leading-relaxed">
            <AppIcon name="info" :size="14" class="flex-shrink-0 mt-0.5" />
            <span>Nothing is created automatically. You can link or create a Customer when you approve this estimate, or any time after — it's required before converting to a Project.</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <button @click="currentStep--" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors">
          <AppIcon name="arrowLeft" :size="16" /> Back
        </button>
        <button
          :disabled="!canStep2"
          @click="goNext"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue <AppIcon name="chevronRight" :size="16" />
        </button>
      </div>
    </template>

    <!-- STEP 2 — Area & Duration -->
    <template v-if="currentStep === 2">
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-display text-base font-semibold text-foreground mb-1">Area & Duration</h3>
        <p class="text-xs text-muted mb-5">Enter the project area to drive quantity calculations in the builder.</p>

        <div class="mb-5">
          <span class="text-sm text-muted mb-2 block">Area input mode</span>
          <div class="flex flex-wrap gap-1 p-1 bg-surface-muted rounded-lg w-fit">
            <button
              v-for="m in AREA_MODES"
              :key="m.key"
              @click="setAreaMode(m.key)"
              class="px-3.5 py-1.5 rounded-md text-xs font-medium transition-all"
              :class="areaMode === m.key ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'"
            >
              {{ m.label }}
            </button>
          </div>
        </div>

        <div v-if="areaMode === 'lxw'" class="grid grid-cols-2 gap-4 mb-4">
          <label class="block">
            <span class="text-sm text-muted mb-1.5 block">Length (ft)</span>
            <input v-model="areaLength" type="number" min="0" placeholder="e.g. 120" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
          <label class="block">
            <span class="text-sm text-muted mb-1.5 block">Width (ft)</span>
            <input v-model="areaWidth" type="number" min="0" placeholder="e.g. 80" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
        </div>
        <div v-else class="mb-4">
          <label class="block">
            <span class="text-sm text-muted mb-1.5 block">{{ areaMode === "Acre" ? "Acres" : areaMode === "Cent" ? "Cents" : "Square Feet" }}</span>
            <input
              v-model="areaValue"
              type="number"
              min="0"
              :placeholder="areaMode === 'Acre' ? 'e.g. 1.5' : areaMode === 'Cent' ? 'e.g. 240' : 'e.g. 9600'"
              class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>

        <div v-if="areaSqft > 0" class="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-primary-soft border border-primary/15 text-primary mb-4">
          <AppIcon name="check" :size="15" class="flex-shrink-0" />
          <span class="font-semibold tabular-nums">{{ areaSqft.toLocaleString("en-IN") }} Sq.ft</span>
          <span class="text-primary/60 text-xs">computed</span>
        </div>

        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Estimated Duration <span class="text-xs text-muted">(optional)</span></span>
          <input v-model="duration" type="text" placeholder="e.g. 30 days, 6 weeks" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
      </div>

      <div class="bg-surface border border-border rounded-xl p-5">
        <h4 class="font-medium text-foreground text-sm mb-4">Estimate Summary</h4>
        <div class="grid sm:grid-cols-2 gap-x-6 gap-y-0 text-sm divide-y sm:divide-y-0 sm:divide-x divide-border">
          <dl class="space-y-3 sm:pr-6">
            <div class="flex items-center justify-between py-0.5"><dt class="text-muted">Category</dt><dd class="font-medium text-foreground">{{ selectedCategory || "—" }}</dd></div>
            <div class="flex items-center justify-between py-0.5"><dt class="text-muted">Area</dt><dd class="font-medium text-foreground tabular-nums">{{ areaSqft > 0 ? areaSqft.toLocaleString("en-IN") + " Sq.ft" : "—" }}</dd></div>
          </dl>
          <dl class="space-y-3 sm:pl-6">
            <div class="flex items-center justify-between py-0.5">
              <dt class="text-muted">Client</dt>
              <dd class="font-medium text-foreground truncate max-w-[160px]">{{ clientMode === "customer" ? selectedCustomer?.customer_name || "—" : prospectName || "—" }}</dd>
            </div>
            <div class="flex items-center justify-between py-0.5"><dt class="text-muted">Duration</dt><dd class="font-medium text-foreground">{{ duration || "—" }}</dd></div>
          </dl>
        </div>
      </div>

      <div v-if="setupChanged" class="p-3.5 rounded-xl bg-warning-soft border border-warning/20 text-xs text-warning leading-relaxed space-y-2.5">
        <div class="flex items-start gap-2.5">
          <AppIcon name="info" :size="14" class="flex-shrink-0 mt-0.5" />
          <span>Category or area changed from the original.</span>
        </div>
        <label class="flex items-start gap-2 cursor-pointer">
          <input v-model="recalculateLines" type="checkbox" class="mt-0.5 rounded border-warning/40" />
          <span>Recalculate line items for the new category/area. Lines you've edited, overridden, or added by hand are always kept as-is — only untouched, template-generated lines get regenerated.</span>
        </label>
      </div>

      <div class="flex items-center justify-between">
        <button @click="currentStep--" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors">
          <AppIcon name="arrowLeft" :size="16" /> Back
        </button>
        <button
          :disabled="!canStep3 || creating"
          @click="goNext"
          class="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <AppIcon name="estimate" :size="16" />
          {{ creating ? (isEdit ? "Saving…" : "Preparing…") : isEdit ? "Save Changes" : "Continue" }}
        </button>
      </div>
    </template>
  </div>
</template>
