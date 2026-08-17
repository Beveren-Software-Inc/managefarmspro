<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import BackButton from "@/components/BackButton.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import BalancePill from "@/components/BalancePill.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import { fetchPlots, plotBalance } from "@/data/plots.js"
import { fetchFarmProjectsForPlot, farmProjectBalance } from "@/data/farm_projects.js"
import { fetchWorkItems, fetchItemOptions, createWork, createWorkDraft } from "@/data/work_entry.js"
import { useLineItemSections } from "@/composables/useLineItemSections.js"
import { formatCurrency } from "@/format.js"

const route = useRoute()
const router = useRouter()

const plots = ref([])
const workItemOptions = ref([])
const loadingOptions = ref(true)

onMounted(async () => {
  const [plotRows, workItems, labor, equipment, material] = await Promise.all([
    fetchPlots(),
    fetchWorkItems(),
    fetchItemOptions("labor"),
    fetchItemOptions("equipment"),
    fetchItemOptions("material"),
  ])
  plots.value = plotRows
  workItemOptions.value = workItems
  sections.labor.itemOptions = labor
  sections.equipment.itemOptions = equipment
  sections.material.itemOptions = material
  loadingOptions.value = false
})

const form = reactive({
  plot: typeof route.query.plot === "string" ? route.query.plot : "",
  farm_project: typeof route.query.farm_project === "string" ? route.query.farm_project : "",
  work_type_name: "",
  work_date: new Date().toISOString().slice(0, 10),
  description: "",
})

const selectedPlot = computed(() => plots.value.find((p) => p.name === form.plot))
const plotOptions = computed(() => plots.value.map((p) => p.plot_name))

// Farm Project is optional — most Work still just logs against a plot's
// maintenance budget with no project involved. When exactly one Active Farm
// Project exists for the selected plot we default to it (still editable/
// clearable); with zero or multiple matches we leave it for the user to pick.
const farmProjects = ref([]) // full rows (incl. estimated_cost/cost_balance) — Budget Context needs more than just {value,label}
const farmProjectOptions = computed(() =>
  farmProjects.value.map((r) => ({ value: r.name, label: `${r.name} · ${r.category || "Farm Project"} (${r.status})` })),
)
const selectedFarmProject = computed(() => farmProjects.value.find((p) => p.name === form.farm_project))

watch(
  () => form.plot,
  async (plotName) => {
    if (!plotName) {
      farmProjects.value = []
      form.farm_project = ""
      return
    }
    const rows = await fetchFarmProjectsForPlot(plotName)
    farmProjects.value = rows
    if (!rows.some((r) => r.name === form.farm_project)) {
      const activeMatches = rows.filter((r) => r.status === "Active")
      form.farm_project = activeMatches.length === 1 ? activeMatches[0].name : ""
    }
  },
  { immediate: true },
)

function onWorkTypeSelect(option) {
  form.description = option?.description || form.description
}

const { sections, selectedItemFor, addItem, removeItem, sectionTotal } = useLineItemSections()

const totalCost = computed(() => sectionTotal("labor") + sectionTotal("equipment") + sectionTotal("material"))

// Budget Context switches to the Farm Project's own figures once one's
// selected — a plot's monthly maintenance budget is the wrong number to show
// against project work, which draws down the project's total estimated cost
// instead (see Farm Project.actual_cost / Work.update_farm_project_totals).
const projectedBalance = computed(() => {
  if (selectedFarmProject.value) return farmProjectBalance(selectedFarmProject.value) - totalCost.value
  if (selectedPlot.value) return plotBalance(selectedPlot.value) - totalCost.value
  return 0
})

const budgetConfirmMessage = computed(() =>
  selectedFarmProject.value
    ? "This work amount exceeds the Farm Project's remaining balance. Do you still want to save this work?"
    : "This work amount exceeds the plot's maintenance balance. Do you still want to save this work?",
)

const submitting = ref(false)
const savingDraft = ref(false)
const submitError = ref(null)
const showSubmitConfirm = ref(false)

function workPayload() {
  return {
    plot: form.plot,
    farm_project: form.farm_project,
    work_type_name: form.work_type_name,
    work_date: form.work_date,
    customer: selectedPlot.value?.customer_name,
    description: form.description,
    labor: sections.labor.items,
    equipment: sections.equipment.items,
    material: sections.material.items,
  }
}

// Follows the same context switch as the Budget Context card itself: Work
// tied to a Farm Project draws against that project's own balance and has no
// relation to the plot's monthly maintenance budget at all — checking the
// plot instead would warn (or fail to warn) against the wrong number entirely.
const isOverBudget = computed(() => {
  if (selectedFarmProject.value) return totalCost.value > farmProjectBalance(selectedFarmProject.value)
  if (selectedPlot.value?.monthly_maintenance_budget > 0) return totalCost.value > plotBalance(selectedPlot.value)
  return false
})

// Submit always confirms first now — same "Submit this work?" checkpoint
// Work Detail's own Draft-editing already uses, rather than only appearing
// when over budget. The dialog itself offers "Save as Draft instead" so a
// user who clicked Submit but changes their mind isn't forced to go back and
// hunt for the separate Save Draft button.
const submitConfirmTitle = computed(() => (isOverBudget.value ? "Exceeds maintenance balance" : "Submit this work?"))
const submitConfirmMessage = computed(() =>
  isOverBudget.value
    ? budgetConfirmMessage.value
    : "This saves your work and submits it. Submitted work is locked from further edits and counts toward the plot's spending.",
)

function submit() {
  submitError.value = null
  showSubmitConfirm.value = true
}

// Saving as Draft never affects a plot's budget rollup (update_plot_totals
// only runs on Work submit/cancel — work.py), so there's nothing to warn
// about here even when the running total exceeds the plot's balance.
async function saveDraft() {
  showSubmitConfirm.value = false
  submitError.value = null
  savingDraft.value = true
  try {
    const work = await createWorkDraft(workPayload())
    router.push(`/works/${work.name}`)
  } catch (e) {
    submitError.value = e.messages?.[0] || e.message || "Failed to save this draft."
  } finally {
    savingDraft.value = false
  }
}

async function doSubmit() {
  showSubmitConfirm.value = false
  submitting.value = true
  try {
    const work = await createWork(workPayload())
    router.push(`/works/${work.name}`)
  } catch (e) {
    submitError.value = e.messages?.[0] || e.message || "Failed to save this work."
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <BackButton fallback="/works" fallback-label="Back to Works" />

    <div>
      <h2 class="font-display text-2xl font-semibold text-foreground">Log New Work</h2>
      <p class="text-sm text-muted mt-1">Record labor, equipment and material against a plot's maintenance budget.</p>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-6">
        <!-- Work info -->
        <div class="bg-surface border border-border rounded-xl p-5 space-y-4">
          <h3 class="font-medium text-foreground">Work Details</h3>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Plot</span>
              <FilterCombobox v-model="form.plot" :options="plotOptions" placeholder="Select a plot" />
            </label>
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
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Farm Project <span class="text-muted/60">(optional)</span></span>
              <RecordPicker
                v-model="form.farm_project"
                :options="farmProjectOptions"
                :disabled="!form.plot"
                placeholder="No Farm Project linked"
              />
            </label>
          </div>
          <label class="block">
            <span class="text-sm text-muted mb-1.5 block">Description</span>
            <textarea v-model="form.description" rows="2" placeholder="What was done on this plot…" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"></textarea>
          </label>
        </div>

        <!-- Line-item sections -->
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
            <div
              v-for="(item, idx) in sec.items"
              :key="idx"
              class="grid grid-cols-12 gap-2 items-center text-sm"
            >
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
      </div>

      <!-- Sticky summary sidebar -->
      <div class="space-y-4">
        <div class="bg-surface border border-border rounded-xl p-5 lg:sticky lg:top-24">
          <h3 class="font-medium text-foreground mb-3">Budget Context</h3>

          <!-- Farm Project selected: draws against the project's own estimated cost, not the plot's monthly maintenance budget. -->
          <div v-if="selectedFarmProject" class="space-y-3 text-sm">
            <div>
              <p class="text-muted text-xs">Farm Project</p>
              <p class="text-foreground font-medium">{{ selectedFarmProject.name }}</p>
              <p class="text-muted text-xs">{{ selectedFarmProject.category || "—" }} · {{ selectedFarmProject.status }}</p>
            </div>
            <dl class="divide-y divide-border">
              <div class="flex justify-between py-2"><dt class="text-muted">Total Budget</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(selectedFarmProject.estimated_cost) }}</dd></div>
              <div class="flex justify-between py-2 items-center"><dt class="text-muted">Current Balance</dt><dd><BalancePill :balance="farmProjectBalance(selectedFarmProject)" :budget="selectedFarmProject.estimated_cost" size="sm" /></dd></div>
              <div class="flex justify-between py-2"><dt class="text-muted">This Work</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(totalCost) }}</dd></div>
              <div class="flex justify-between py-2 items-center"><dt class="text-muted font-medium">Balance After</dt><dd><BalancePill :balance="projectedBalance" :budget="selectedFarmProject.estimated_cost" size="sm" /></dd></div>
            </dl>
          </div>

          <!-- No Farm Project — plain maintenance work against the plot's monthly budget. -->
          <div v-else-if="selectedPlot" class="space-y-3 text-sm">
            <div>
              <p class="text-muted text-xs">Plot</p>
              <p class="text-foreground font-medium">{{ selectedPlot.plot_name }}</p>
              <p class="text-muted text-xs">{{ selectedPlot.customer_name }}</p>
            </div>
            <dl class="divide-y divide-border">
              <div class="flex justify-between py-2"><dt class="text-muted">Monthly Budget</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(selectedPlot.monthly_maintenance_budget) }}</dd></div>
              <div class="flex justify-between py-2 items-center"><dt class="text-muted">Current Balance</dt><dd><BalancePill :balance="plotBalance(selectedPlot)" :budget="selectedPlot.monthly_maintenance_budget" size="sm" /></dd></div>
              <div class="flex justify-between py-2"><dt class="text-muted">This Work</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(totalCost) }}</dd></div>
              <div class="flex justify-between py-2 items-center"><dt class="text-muted font-medium">Balance After</dt><dd><BalancePill :balance="projectedBalance" :budget="selectedPlot.monthly_maintenance_budget" size="sm" /></dd></div>
            </dl>
          </div>
          <p v-else class="text-sm text-muted">Select a plot to see its budget.</p>

          <div class="mt-4 pt-4 border-t border-border">
            <div class="flex items-center justify-between mb-4">
              <span class="text-sm text-muted">Total Cost</span>
              <span class="font-display text-2xl font-bold text-foreground tabular-nums">{{ formatCurrency(totalCost) }}</span>
            </div>
            <p v-if="submitError" class="text-sm text-negative bg-negative-soft rounded-lg p-3 mb-3">{{ submitError }}</p>
            <div class="flex flex-col gap-2">
              <button
                class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
                :disabled="savingDraft || submitting || !form.plot || !form.work_type_name"
                @click="saveDraft"
              >
                {{ savingDraft ? "Saving…" : "Save Draft" }}
              </button>
              <button
                class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-hover disabled:opacity-60"
                :disabled="submitting || savingDraft || !form.plot || !form.work_type_name"
                @click="submit"
              >
                <AppIcon name="check" :size="18" />
                {{ submitting ? "Saving…" : "Submit Work" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showSubmitConfirm"
      :title="submitConfirmTitle"
      :message="submitConfirmMessage"
      :confirm-label="isOverBudget ? 'Save anyway' : 'Submit'"
      cancel-label="Go Back"
      @confirm="doSubmit"
      @cancel="showSubmitConfirm = false"
    >
      <button type="button" :disabled="savingDraft" class="text-sm font-medium text-primary hover:underline disabled:opacity-50" @click="saveDraft">
        {{ savingDraft ? "Saving…" : "Save as Draft instead" }}
      </button>
    </ConfirmDialog>
  </div>
</template>
