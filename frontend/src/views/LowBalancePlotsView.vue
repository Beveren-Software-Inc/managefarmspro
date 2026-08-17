<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import BalancePill from "@/components/BalancePill.vue"
import { fetchLowBalancePlots, downloadLowBalancePlotsPdf } from "@/data/plots.js"
import { formatCurrency } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const rows = ref([])
const threshold = ref(500)

async function load() {
  loading.value = true
  error.value = null
  try {
    rows.value = await fetchLowBalancePlots(threshold.value)
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this report."
  } finally {
    loading.value = false
  }
}
onMounted(load)

const downloading = ref(false)
const downloadError = ref(null)
async function downloadPdf() {
  downloading.value = true
  downloadError.value = null
  try {
    const url = await downloadLowBalancePlotsPdf(threshold.value)
    window.open(url, "_blank")
  } catch (e) {
    downloadError.value = e.messages?.[0] || e.message || "Failed to generate the PDF."
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="font-display text-2xl font-semibold text-foreground">Low Balance Plots</h1>
        <p class="mt-1 text-sm text-muted">Plots with a monthly maintenance budget set whose balance has reached or dropped below the threshold below.</p>
      </div>
      <div class="flex items-end gap-3">
        <label class="block w-full sm:w-56">
          <span class="text-xs text-muted mb-1.5 block">Maintenance Balance Below</span>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">₹</span>
            <input
              v-model.number="threshold"
              type="number"
              step="0.01"
              class="w-full pl-7 pr-3 py-2.5 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              @change="load"
            />
          </div>
        </label>
        <button
          :disabled="downloading || loading || !rows.length"
          class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:opacity-50"
          @click="downloadPdf"
        >
          <AppIcon name="download" :size="16" /> {{ downloading ? "Generating…" : "Download PDF" }}
        </button>
      </div>
    </div>

    <p v-if="downloadError" class="text-sm text-negative bg-negative-soft rounded-lg px-3 py-2">{{ downloadError }}</p>
    <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>
    <p v-else-if="loading" class="text-sm text-muted text-center py-16">Loading…</p>
    <p v-else-if="!rows.length" class="text-sm text-muted text-center py-16 bg-surface border border-border rounded-xl">
      No plots under this balance threshold.
    </p>

    <div v-else class="bg-surface border border-border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
            <th class="font-medium px-5 py-3">Plot Name</th>
            <th class="font-medium px-5 py-3">Customer</th>
            <th class="font-medium px-5 py-3">Cluster</th>
            <th class="font-medium px-5 py-3">Status</th>
            <th class="font-medium px-5 py-3 text-right">Monthly Budget</th>
            <th class="font-medium px-5 py-3 text-right">Amount Spent</th>
            <th class="font-medium px-5 py-3 text-right">Balance</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="p in rows" :key="p.plot_name" class="hover:bg-surface-muted/60 cursor-pointer" @click="router.push(`/plots/${p.plot_name}`)">
            <td class="px-5 py-3.5 font-medium text-foreground">{{ p.plot_name }}</td>
            <td class="px-5 py-3.5 text-muted">{{ p.customer_name }}</td>
            <td class="px-5 py-3.5 text-muted">{{ p.cluster }}</td>
            <td class="px-5 py-3.5"><StatusBadge :status="p.plot_status" /></td>
            <td class="px-5 py-3.5 text-right text-muted tabular-nums">{{ formatCurrency(p.monthly_maintenance_budget) }}</td>
            <td class="px-5 py-3.5 text-right text-muted tabular-nums">{{ formatCurrency(p.total_amount_spent) }}</td>
            <td class="px-5 py-3.5 text-right"><BalancePill :balance="p.maintenance_balance" :budget="p.monthly_maintenance_budget" size="sm" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
