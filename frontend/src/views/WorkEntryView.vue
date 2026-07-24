<script setup>
import { ref, reactive, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import BalancePill from "@/components/BalancePill.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import { fetchPlots, plotBalance } from "@/data/plots.js"
import { fetchWorkItems, fetchItemOptions, createWork } from "@/data/work_entry.js"
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
  work_type_name: "",
  work_date: new Date().toISOString().slice(0, 10),
  description: "",
})

const selectedPlot = computed(() => plots.value.find((p) => p.name === form.plot))
const plotOptions = computed(() => plots.value.map((p) => p.plot_name))

function onWorkTypeSelect(option) {
  form.description = option?.description || form.description
}

const { sections, selectedItemFor, addItem, removeItem, sectionTotal } = useLineItemSections()

const totalCost = computed(() => sectionTotal("labor") + sectionTotal("equipment") + sectionTotal("material"))

const projectedBalance = computed(() =>
  selectedPlot.value ? plotBalance(selectedPlot.value) - totalCost.value : 0,
)

const submitting = ref(false)
const submitError = ref(null)
const showBudgetConfirm = ref(false)

function submit() {
  submitError.value = null

  if (
    selectedPlot.value?.monthly_maintenance_budget > 0 &&
    totalCost.value > plotBalance(selectedPlot.value)
  ) {
    showBudgetConfirm.value = true
    return
  }

  doSubmit()
}

async function doSubmit() {
  showBudgetConfirm.value = false
  submitting.value = true
  try {
    const work = await createWork({
      plot: form.plot,
      work_type_name: form.work_type_name,
      work_date: form.work_date,
      customer: selectedPlot.value?.customer_name,
      description: form.description,
      labor: sections.labor.items,
      equipment: sections.equipment.items,
      material: sections.material.items,
    })
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
    <button class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground" @click="router.push('/works')">
      <AppIcon name="arrowLeft" :size="16" /> Back to Works
    </button>

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
          <div v-if="selectedPlot" class="space-y-3 text-sm">
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
            <button
              class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-hover disabled:opacity-60"
              :disabled="submitting || !form.plot || !form.work_type_name"
              @click="submit"
            >
              <AppIcon name="check" :size="18" />
              {{ submitting ? "Saving…" : "Submit Work" }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="showBudgetConfirm"
      title="Exceeds maintenance balance"
      message="This work amount exceeds the plot's maintenance balance. Do you still want to save this work?"
      confirm-label="Save anyway"
      @confirm="doSubmit"
      @cancel="showBudgetConfirm = false"
    />
  </div>
</template>
