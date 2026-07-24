<script setup>
import { ref, reactive, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import BalancePill from "@/components/BalancePill.vue"
import LineItemsTable from "@/components/LineItemsTable.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import { fetchWork, workStatus, laborLines, equipmentLines, materialLines } from "@/data/works.js"
import { fetchPlotDetail, plotBalance } from "@/data/plots.js"
import { fetchWorkItems, fetchItemOptions, fromChildRow, updateWork, submitWork, cancelWork } from "@/data/work_entry.js"
import { useLineItemSections } from "@/composables/useLineItemSections.js"
import { formatCurrency, formatDate } from "@/format.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const work = ref(null)
const plot = ref(null)

const isDraft = computed(() => work.value?.docstatus === 0)
const isSubmitted = computed(() => work.value?.docstatus === 1)
const alreadyInvoiced = computed(() => !!work.value?.invoice_number)

// Read-only display of the saved doc — used for Submitted/Cancelled work,
// and as the source the Draft editor below is seeded from.
const labor = computed(() => (work.value ? laborLines(work.value) : []))
const equipment = computed(() => (work.value ? equipmentLines(work.value) : []))
const material = computed(() => (work.value ? materialLines(work.value) : []))

function categoryTotal(items) {
  return items.reduce((t, i) => t + (i.total || 0), 0)
}

// Draft edit state — same field set and the same add/remove line-item
// interaction the New Work page uses.
const form = reactive({ work_type_name: "", work_date: "", description: "" })
const workItemOptions = ref([])
const { sections, selectedItemFor, addItem, removeItem, sectionTotal } = useLineItemSections()

function onWorkTypeSelect(option) {
  form.description = option?.description || form.description
}

const draftTotal = computed(() => sectionTotal("labor") + sectionTotal("equipment") + sectionTotal("material"))
const displayTotal = computed(() => (isDraft.value ? draftTotal.value : work.value?.total_cost || 0))

async function loadWork() {
  work.value = await fetchWork(route.params.id)
  plot.value = await fetchPlotDetail(work.value.plot)

  form.work_type_name = work.value.work_type_name
  form.work_date = work.value.work_date
  form.description = work.value.description

  sections.labor.items = (work.value.labor_table || []).map((r) => fromChildRow("labor", r))
  sections.equipment.items = (work.value.equipment_table || []).map((r) => fromChildRow("equipment", r))
  sections.material.items = (work.value.material_table || []).map((r) => fromChildRow("material", r))
}

onMounted(async () => {
  try {
    await loadWork()
    if (isDraft.value) {
      const [workItems, laborOpts, equipmentOpts, materialOpts] = await Promise.all([
        fetchWorkItems(),
        fetchItemOptions("labor"),
        fetchItemOptions("equipment"),
        fetchItemOptions("material"),
      ])
      workItemOptions.value = workItems
      sections.labor.itemOptions = laborOpts
      sections.equipment.itemOptions = equipmentOpts
      sections.material.itemOptions = materialOpts
    }
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this work."
  } finally {
    loading.value = false
  }
})

const actionError = ref(null)
const showSubmitConfirm = ref(false)
const showCancelConfirm = ref(false)
const submitting = ref(false)
const cancelling = ref(false)
const savingDraft = ref(false)
const discarding = ref(false)

function openSubmitConfirm() {
  actionError.value = null
  showSubmitConfirm.value = true
}

async function doSubmit() {
  showSubmitConfirm.value = false
  submitting.value = true
  actionError.value = null
  try {
    const saved = await updateWork(work.value.name, {
      work_type_name: form.work_type_name,
      work_date: form.work_date,
      description: form.description,
      labor: sections.labor.items,
      equipment: sections.equipment.items,
      material: sections.material.items,
    })
    await submitWork(saved)
    await loadWork()
  } catch (e) {
    actionError.value = e.messages?.[0] || e.message || "Failed to submit this work."
  } finally {
    submitting.value = false
  }
}

async function saveDraft() {
  savingDraft.value = true
  actionError.value = null
  try {
    await updateWork(work.value.name, {
      work_type_name: form.work_type_name,
      work_date: form.work_date,
      description: form.description,
      labor: sections.labor.items,
      equipment: sections.equipment.items,
      material: sections.material.items,
    })
    await loadWork()
  } catch (e) {
    actionError.value = e.messages?.[0] || e.message || "Failed to save this draft."
  } finally {
    savingDraft.value = false
  }
}

// No confirm — nothing has been persisted yet, so there's nothing
// destructive to walk back. Just re-seeds the form/sections from the last
// saved doc, same as loadWork() already does on initial page load.
async function discardEdits() {
  discarding.value = true
  actionError.value = null
  try {
    await loadWork()
  } catch (e) {
    actionError.value = e.messages?.[0] || e.message || "Failed to reload this work."
  } finally {
    discarding.value = false
  }
}

function openCancelConfirm() {
  actionError.value = null
  showCancelConfirm.value = true
}

async function doCancel() {
  showCancelConfirm.value = false
  cancelling.value = true
  actionError.value = null
  try {
    await cancelWork(work.value.name)
    await loadWork()
  } catch (e) {
    actionError.value = e.messages?.[0] || e.message || "Failed to cancel this work."
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else-if="work" class="space-y-6">
    <button class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground" @click="router.push('/works')">
      <AppIcon name="arrowLeft" :size="16" /> Back to Works
    </button>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-start gap-4">
      <div>
        <div class="flex items-center gap-3 flex-wrap">
          <h2 class="font-display text-2xl font-semibold text-foreground">{{ work.work_type_name }}</h2>
          <StatusBadge :status="workStatus(work.docstatus)" />
        </div>
        <p class="text-sm text-muted mt-1">
          {{ work.name }} · {{ formatDate(work.work_date) }} ·
          <router-link :to="`/plots/${work.plot}`" class="text-primary hover:underline">{{ work.plot }}</router-link>
        </p>
      </div>

      <div class="sm:ml-auto flex flex-col items-start sm:items-end gap-3">
        <div class="text-left sm:text-right">
          <p class="text-xs text-muted">Total Cost</p>
          <p class="font-display text-2xl font-bold text-foreground tabular-nums">{{ formatCurrency(displayTotal) }}</p>
        </div>

        <div v-if="isDraft" class="flex flex-wrap items-center justify-end gap-2">
          <button
            class="px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
            :disabled="discarding || savingDraft || submitting"
            @click="discardEdits"
          >
            {{ discarding ? "Reverting…" : "Cancel" }}
          </button>
          <button
            class="px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
            :disabled="savingDraft || submitting || discarding"
            @click="saveDraft"
          >
            {{ savingDraft ? "Saving…" : "Save Draft" }}
          </button>
          <button
            class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-60"
            :disabled="submitting || savingDraft || discarding"
            @click="openSubmitConfirm"
          >
            <AppIcon name="check" :size="17" /> {{ submitting ? "Submitting…" : "Submit Work" }}
          </button>
        </div>

        <div v-else-if="isSubmitted" class="text-left sm:text-right">
          <button
            class="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-negative/30 text-negative text-sm font-semibold hover:bg-negative-soft disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            :disabled="alreadyInvoiced || cancelling"
            @click="openCancelConfirm"
          >
            <AppIcon name="x" :size="17" /> {{ cancelling ? "Cancelling…" : "Cancel Work" }}
          </button>
          <p v-if="alreadyInvoiced" class="text-xs text-muted mt-1.5 max-w-[16rem]">
            Already part of invoice {{ work.invoice_number }} — cannot cancel.
          </p>
        </div>
      </div>
    </div>

    <p v-if="actionError" class="text-sm text-negative bg-negative-soft rounded-lg p-3">{{ actionError }}</p>

    <div class="grid lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-4">
        <!-- Draft: editable fields + line items -->
        <template v-if="isDraft">
          <div class="bg-surface border border-border rounded-xl p-5 space-y-4">
            <h3 class="font-medium text-foreground">Work Details</h3>
            <div class="grid sm:grid-cols-2 gap-4">
              <label class="block">
                <span class="text-sm text-muted mb-1.5 block">Work Type</span>
                <RecordPicker
                  v-model="form.work_type_name"
                  :options="workItemOptions"
                  placeholder="Select work type"
                  @select="onWorkTypeSelect"
                />
              </label>
              <label class="block">
                <span class="text-sm text-muted mb-1.5 block">Work Date</span>
                <input v-model="form.work_date" type="date" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
            </div>
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Description</span>
              <textarea v-model="form.description" rows="2" placeholder="What was done on this plot…" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"></textarea>
            </label>
          </div>

          <div v-for="(sec, key) in sections" :key="key" class="bg-surface border border-border rounded-xl">
            <button type="button" class="flex items-center gap-2 w-full px-5 py-3.5 text-left" @click="sec.open = !sec.open">
              <span class="text-primary"><AppIcon :name="sec.icon" :size="18" /></span>
              <span class="font-medium text-foreground">{{ sec.label }}</span>
              <span class="ml-1 text-xs text-muted">({{ sec.items.length }})</span>
              <span class="ml-auto text-sm font-semibold text-foreground tabular-nums">{{ formatCurrency(sectionTotal(key)) }}</span>
              <span class="text-muted transition-transform" :class="sec.open ? 'rotate-180' : ''"><AppIcon name="chevronDown" :size="18" /></span>
            </button>

            <div v-if="sec.open" class="border-t border-border p-4 space-y-3">
              <div v-if="!sec.items.length" class="text-sm text-muted text-center py-2">No items yet.</div>
              <div v-for="(item, idx) in sec.items" :key="idx" class="grid grid-cols-12 gap-2 items-center text-sm">
                <span class="col-span-5 text-foreground truncate">{{ item.item_display_name }}</span>
                <span class="col-span-2 text-right text-muted tabular-nums">{{ item.qty }} {{ item.unit }}</span>
                <span class="col-span-3 text-right text-muted tabular-nums">{{ formatCurrency(item.unit_price) }}</span>
                <span class="col-span-1 text-right font-medium text-foreground tabular-nums">{{ formatCurrency(item.total_price) }}</span>
                <button type="button" class="col-span-1 flex justify-center text-muted hover:text-negative" @click="removeItem(key, idx)" aria-label="Remove item">
                  <AppIcon name="x" :size="17" />
                </button>
              </div>

              <div class="grid grid-cols-12 gap-2 items-end pt-2 border-t border-border">
                <label class="col-span-12 sm:col-span-4 block">
                  <span class="text-xs text-muted mb-1 block">Item</span>
                  <RecordPicker v-model="sec.picker.itemCode" :options="sec.itemOptions" :placeholder="`Select ${sec.label.toLowerCase()} item`" />
                </label>
                <label class="col-span-4 sm:col-span-2 block">
                  <span class="text-xs text-muted mb-1 block">Qty</span>
                  <input v-model.number="sec.picker.qty" type="number" min="0" step="0.5" class="w-full py-2.5 px-2 rounded-lg bg-background border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </label>
                <label class="col-span-4 sm:col-span-2 block">
                  <span class="text-xs text-muted mb-1 block">Unit</span>
                  <p class="w-full py-2.5 px-2 rounded-lg bg-surface-muted border border-border text-sm text-center text-muted truncate">
                    {{ selectedItemFor(key)?.stock_uom || "—" }}
                  </p>
                </label>
                <label class="col-span-4 sm:col-span-2 block">
                  <span class="text-xs text-muted mb-1 block">Count</span>
                  <input v-model.number="sec.picker.count" type="number" min="1" class="w-full py-2.5 px-2 rounded-lg bg-background border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </label>
                <button
                  type="button"
                  :disabled="!sec.picker.itemCode || !sec.picker.qty"
                  class="col-span-12 sm:col-span-2 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
                  @click="addItem(key)"
                >
                  <AppIcon name="plus" :size="15" /> Add
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Submitted/Cancelled: read-only -->
        <template v-else>
          <div v-if="work.description" class="bg-surface border border-border rounded-xl p-5">
            <h4 class="font-medium text-foreground mb-1">Description</h4>
            <p class="text-sm text-muted leading-relaxed">{{ work.description }}</p>
          </div>
          <LineItemsTable title="Labor" icon="users" :items="labor" />
          <LineItemsTable title="Equipment" icon="work" :items="equipment" />
          <LineItemsTable title="Material" icon="layers" :items="material" />
        </template>
      </div>

      <!-- Context sidebar -->
      <div class="space-y-4">
        <div v-if="plot" class="bg-surface border border-border rounded-xl p-5">
          <h4 class="font-medium text-foreground mb-3">Plot Context</h4>
          <dl class="text-sm divide-y divide-border">
            <div class="flex justify-between py-2.5"><dt class="text-muted">Plot</dt><dd class="text-foreground">{{ plot.plot_name }}</dd></div>
            <div class="flex justify-between py-2.5"><dt class="text-muted">Customer</dt><dd class="text-foreground text-right">{{ plot.customer_name }}</dd></div>
            <div class="flex justify-between py-2.5"><dt class="text-muted">Monthly Budget</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(plot.monthly_maintenance_budget) }}</dd></div>
            <div class="flex justify-between py-2.5 items-center"><dt class="text-muted">Maintenance Balance</dt><dd><BalancePill :balance="plotBalance(plot)" :budget="plot.monthly_maintenance_budget" size="sm" /></dd></div>
          </dl>
        </div>
        <div class="bg-primary text-primary-foreground rounded-xl p-5">
          <p class="text-sm text-primary-foreground/70">Work Total</p>
          <p class="font-display text-3xl font-bold mt-1 tabular-nums">{{ formatCurrency(displayTotal) }}</p>
          <div class="mt-4 space-y-1.5 text-sm text-primary-foreground/80">
            <div class="flex justify-between"><span>Labor</span><span class="tabular-nums">{{ formatCurrency(isDraft ? sectionTotal("labor") : categoryTotal(labor)) }}</span></div>
            <div class="flex justify-between"><span>Equipment</span><span class="tabular-nums">{{ formatCurrency(isDraft ? sectionTotal("equipment") : categoryTotal(equipment)) }}</span></div>
            <div class="flex justify-between"><span>Material</span><span class="tabular-nums">{{ formatCurrency(isDraft ? sectionTotal("material") : categoryTotal(material)) }}</span></div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showSubmitConfirm"
      title="Submit this work?"
      message="This saves your changes and submits the work. Submitted work is locked from further edits and counts toward the plot's spending."
      confirm-label="Submit"
      cancel-label="Go Back"
      @confirm="doSubmit"
      @cancel="showSubmitConfirm = false"
    />
    <ConfirmDialog
      v-if="showCancelConfirm"
      title="Cancel this work?"
      message="This cancels the submitted work and reverses its contribution to the plot's spending. This cannot be undone."
      confirm-label="Yes, Cancel Work"
      cancel-label="Go Back"
      @confirm="doCancel"
      @cancel="showCancelConfirm = false"
    />
  </div>

  <div v-else class="text-center py-20 text-muted">Work not found.</div>
</template>
