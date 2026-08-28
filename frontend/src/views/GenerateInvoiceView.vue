<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import { fetchPlots } from "@/data/plots.js"
import { fetchInvoiceableWorks, generateInvoice, monthStart, monthEnd } from "@/data/invoices.js"
import { formatCurrency, formatDate } from "@/format.js"

const plots = ref([])
const plotsLoading = ref(true)

onMounted(async () => {
  try {
    plots.value = await fetchPlots()
  } finally {
    plotsLoading.value = false
  }
})

const form = reactive({
  plot: "",
  from: monthStart(),
  to: monthEnd(),
})

const plotOptions = computed(() => plots.value.map((p) => p.plot_name))
const selectedPlot = computed(() => plots.value.find((p) => p.name === form.plot))
const supervisionPercent = computed(() => selectedPlot.value?.supervision_charge || 0)

const works = ref([])
const worksLoading = ref(false)
const worksError = ref(null)

async function loadWorks() {
  if (!form.plot || !form.from || !form.to) {
    works.value = []
    return
  }
  worksLoading.value = true
  worksError.value = null
  try {
    works.value = await fetchInvoiceableWorks({ plot: form.plot, start_date: form.from, end_date: form.to })
  } catch (e) {
    worksError.value = e.messages?.[0] || e.message || "Failed to load works for this plot."
    works.value = []
  } finally {
    worksLoading.value = false
  }
}

watch(() => [form.plot, form.from, form.to], loadWorks, { immediate: true })

const groupedByDate = computed(() => {
  const map = {}
  for (const w of works.value) {
    if (!map[w.work_date]) map[w.work_date] = []
    map[w.work_date].push(w)
  }
  return Object.entries(map)
    .sort(([a], [b]) => new Date(a) - new Date(b))
    .map(([date, items]) => ({ date, items }))
})

const worksTotal = computed(() => works.value.reduce((t, w) => t + (w.total_cost || 0), 0))
const supervisionCharge = computed(() => (supervisionPercent.value / 100) * worksTotal.value)
const grandTotal = computed(() => worksTotal.value + supervisionCharge.value)

const showPreview = ref(false)
const generating = ref(false)
const generated = ref(false)
const generateError = ref(null)
const pdfUrl = ref(null)

async function confirmGenerate() {
  generating.value = true
  generateError.value = null
  try {
    pdfUrl.value = await generateInvoice({ plot: form.plot, start_date: form.from, end_date: form.to })
    generated.value = true
    await loadWorks() // invoiced works drop out of the un-invoiced list
  } catch (e) {
    generateError.value = e.messages?.[0] || e.message || "Failed to generate invoice."
  } finally {
    generating.value = false
  }
}

function closePreview() {
  showPreview.value = false
  generated.value = false
  generateError.value = null
  pdfUrl.value = null
}
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6">
    <div>
      <h2 class="font-display text-2xl font-semibold text-foreground">Generate Invoice</h2>
      <p class="text-sm text-muted mt-1">Collate a plot's works over a date range into a billable invoice.</p>
    </div>

    <!-- Selector -->
    <div class="bg-surface border border-border rounded-xl p-5">
      <div class="grid sm:grid-cols-3 gap-4">
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Plot</span>
          <FilterCombobox
            v-model="form.plot"
            :options="plotOptions"
            :placeholder="plotsLoading ? 'Loading plots…' : 'Select a plot'"
          />
        </label>
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">From Date</span>
          <input v-model="form.from" type="date" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">To Date</span>
          <input v-model="form.to" type="date" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
      </div>
      <div v-if="selectedPlot" class="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border text-sm">
        <span class="text-muted">Client: <span class="text-foreground font-medium">{{ selectedPlot.customer_name }}</span></span>
        <span class="text-muted">·</span>
        <span class="text-muted">{{ works.length }} works matched</span>
        <span class="text-muted">·</span>
        <span class="text-muted">Total: <span class="text-foreground font-medium tabular-nums">{{ formatCurrency(worksTotal) }}</span></span>
      </div>
    </div>

    <p v-if="worksLoading" class="text-sm text-muted text-center py-10">Loading works…</p>
    <p v-else-if="worksError" class="text-center py-10 text-negative bg-negative-soft rounded-xl">{{ worksError }}</p>

    <!-- Grouped breakdown -->
    <div v-else-if="works.length" class="space-y-4">
      <h3 class="font-display text-lg font-semibold text-foreground">Works in Period</h3>
      <div v-for="group in groupedByDate" :key="group.date" class="bg-surface border border-border rounded-xl overflow-hidden">
        <div class="flex items-center gap-2 px-5 py-3 bg-surface-muted/40 border-b border-border">
          <AppIcon name="calendar" :size="16" class="text-primary" />
          <span class="font-medium text-foreground">{{ formatDate(group.date) }}</span>
          <span class="ml-auto text-sm font-semibold text-foreground tabular-nums">
            {{ formatCurrency(group.items.reduce((t, w) => t + (w.total_cost || 0), 0)) }}
          </span>
        </div>
        <div v-for="w in group.items" :key="w.work_id" class="px-5 py-4 border-b border-border last:border-0">
          <div class="flex items-center justify-between mb-2">
            <p class="font-medium text-foreground">{{ w.work_name }} <span class="text-xs text-muted">· {{ w.work_id }}</span></p>
            <span class="text-sm font-semibold text-foreground tabular-nums">{{ formatCurrency(w.total_cost) }}</span>
          </div>
          <ul v-if="w.items?.length" class="text-sm space-y-1">
            <li v-for="(line, i) in w.items" :key="i" class="flex items-center gap-2 text-muted">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-muted text-muted uppercase tracking-wide">{{ line.item_group }}</span>
              <span class="text-foreground">{{ line.item_name }}</span>
              <span class="text-xs">({{ line.qty }} {{ line.unit }} × {{ formatCurrency(line.rate) }})</span>
              <span class="ml-auto tabular-nums text-foreground">{{ formatCurrency(line.amount) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Totals + generate -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <dl class="space-y-2 text-sm max-w-sm ml-auto">
          <div class="flex justify-between"><dt class="text-muted">Total for All Works</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(worksTotal) }}</dd></div>
          <div class="flex justify-between"><dt class="text-muted">Supervision Charges <span class="text-xs">({{ supervisionPercent }}%)</span></dt><dd class="text-foreground tabular-nums">{{ formatCurrency(supervisionCharge) }}</dd></div>
          <div class="flex justify-between pt-2 border-t border-border"><dt class="font-semibold text-foreground">Grand Total</dt><dd class="font-display text-xl font-bold text-primary tabular-nums">{{ formatCurrency(grandTotal) }}</dd></div>
        </dl>
        <div class="flex justify-end mt-5">
          <button
            class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-hover"
            @click="showPreview = true"
          >
            <AppIcon name="invoice" :size="18" /> Preview Invoice
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="form.plot" class="text-center py-16 text-muted bg-surface border border-border rounded-xl">
      No billable works found for this plot in the selected period.
    </div>
    <div v-else class="text-center py-16 text-muted bg-surface border border-border rounded-xl">
      Select a plot to see its billable works.
    </div>

    <!-- Preview modal -->
    <div v-if="showPreview" class="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-foreground/50 overflow-y-auto" @click.self="closePreview">
      <div class="bg-surface rounded-xl w-full max-w-2xl my-8 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 class="font-display text-lg font-semibold text-foreground">Invoice Preview</h3>
          <button class="text-muted hover:text-foreground p-1" @click="closePreview" aria-label="Close"><AppIcon name="x" :size="20" /></button>
        </div>

        <div class="p-6 space-y-5">
          <!-- Invoice header -->
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-2">
              <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground"><AppIcon name="sprout" :size="20" /></span>
              <div>
                <p class="font-display font-semibold text-foreground">ManageFarmsPro</p>
                <p class="text-xs text-muted">Collated Plot Invoice</p>
              </div>
            </div>
            <div class="text-right text-sm">
              <p class="font-medium text-foreground">{{ generated ? "Generated" : "DRAFT" }}</p>
              <p class="text-muted text-xs">{{ formatDate(form.from) }} – {{ formatDate(form.to) }}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm rounded-lg bg-surface-muted/50 p-4">
            <div><p class="text-muted text-xs">Client</p><p class="text-foreground font-medium">{{ selectedPlot?.customer_name }}</p></div>
            <div><p class="text-muted text-xs">Plot</p><p class="text-foreground font-medium">{{ selectedPlot?.plot_name }} · {{ selectedPlot?.cluster }}</p></div>
          </div>

          <!-- Line summary -->
          <div class="border border-border rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted bg-surface-muted/50 border-b border-border">
                  <th class="font-medium px-4 py-2">Date</th>
                  <th class="font-medium px-4 py-2">Work</th>
                  <th class="font-medium px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="w in works" :key="w.work_id">
                  <td class="px-4 py-2 text-muted">{{ formatDate(w.work_date) }}</td>
                  <td class="px-4 py-2 text-foreground">{{ w.work_name }}</td>
                  <td class="px-4 py-2 text-right text-foreground tabular-nums">{{ formatCurrency(w.total_cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <dl class="space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-muted">Total for All Works</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(worksTotal) }}</dd></div>
            <div class="flex justify-between"><dt class="text-muted">Supervision Charges</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(supervisionCharge) }}</dd></div>
          </dl>

          <div class="rounded-lg bg-primary text-primary-foreground p-4">
            <div class="flex items-center justify-between">
              <span class="font-medium">Grand Total</span>
              <span class="font-display text-2xl font-bold tabular-nums">{{ formatCurrency(grandTotal) }}</span>
            </div>
          </div>

          <p v-if="generateError" class="text-sm text-negative bg-negative-soft rounded-lg p-3">{{ generateError }}</p>
        </div>

        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button class="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="closePreview">
            {{ generated ? "Close" : "Cancel" }}
          </button>
          <button
            v-if="!generated"
            :disabled="generating"
            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-60"
            @click="confirmGenerate"
          >
            <AppIcon name="check" :size="16" /> {{ generating ? "Generating…" : "Confirm & Generate" }}
          </button>
          <a
            v-else
            :href="pdfUrl"
            target="_blank"
            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90"
          >
            <AppIcon name="download" :size="16" /> Download PDF
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
