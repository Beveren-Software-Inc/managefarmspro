<script setup>
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import BalancePill from "@/components/BalancePill.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import AddPlotDialog from "@/components/AddPlotDialog.vue"
import { fetchPlots, plotBalance } from "@/data/plots.js"
import { formatCurrency } from "@/format.js"
import { isSystemManager } from "@/session.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const plots = ref([])

onMounted(async () => {
  try {
    plots.value = await fetchPlots()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load plots."
  } finally {
    loading.value = false
  }
})

const query = ref("")
const clusterFilter = ref("")
const customerFilter = ref("")

const clusterOptions = computed(() => [...new Set(plots.value.map((p) => p.cluster).filter(Boolean))].sort())
const customerOptions = computed(() => [...new Set(plots.value.map((p) => p.customer_name).filter(Boolean))].sort())

const filtered = computed(() =>
  plots.value.filter((p) => {
    const q = query.value.toLowerCase()
    const matchQ =
      !q ||
      p.plot_name?.toLowerCase().includes(q) ||
      p.plot_location?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q)
    const matchCluster = !clusterFilter.value || p.cluster === clusterFilter.value
    const matchCustomer = !customerFilter.value || p.customer_name === customerFilter.value
    return matchQ && matchCluster && matchCustomer
  }),
)

// Plot's own doctype permissions restrict create to System Manager
// (plot.json) — same precedent as Category Templates.
const canAddPlot = isSystemManager()
const showAddPlot = ref(false)

function onPlotCreated(created) {
  showAddPlot.value = false
  router.push(`/plots/${created.name}`)
}
</script>

<template>
  <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="space-y-5">
    <div
      class="sticky top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur border-b border-border flex flex-col lg:flex-row lg:items-end gap-3"
    >
      <p class="text-sm text-muted lg:pb-2.5">{{ loading ? "Loading…" : `${filtered.length} plots` }}</p>
      <div class="lg:ml-auto flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">Search</span>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="17" /></span>
            <input
              v-model="query"
              type="search"
              placeholder="Plot name or location…"
              class="w-full sm:w-56 pl-9 pr-3 py-2.5 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </label>
        <label class="block w-full sm:w-48">
          <span class="text-xs text-muted mb-1.5 block">Filter by Cluster</span>
          <FilterCombobox v-model="clusterFilter" :options="clusterOptions" placeholder="All clusters" />
        </label>
        <label class="block w-full sm:w-48">
          <span class="text-xs text-muted mb-1.5 block">Filter by Owner</span>
          <FilterCombobox v-model="customerFilter" :options="customerOptions" placeholder="All owners" />
        </label>
        <router-link
          to="/low-balance-plots"
          class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
        >
          <AppIcon name="alert" :size="17" /> Low Balance Plots
        </router-link>
        <button
          v-if="canAddPlot"
          class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
          @click="showAddPlot = true"
        >
          <AppIcon name="plus" :size="17" /> Add Plot
        </button>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading plots…</p>
    <p v-else-if="!filtered.length" class="text-sm text-muted text-center py-16">No plots match these filters.</p>

    <div v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      <button
        v-for="p in filtered"
        :key="p.name"
        class="text-left bg-surface border border-border rounded-xl p-5 hover:border-primary/40 hover:-translate-y-0.5 transition-all"
        @click="router.push(`/plots/${p.name}`)"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="min-w-0">
            <p class="font-semibold text-foreground truncate">{{ p.plot_name }}</p>
            <span class="inline-block mt-1 px-2 py-0.5 rounded-md bg-surface-muted text-xs font-medium text-muted">{{ p.cluster }}</span>
          </div>
          <StatusBadge :status="p.plot_status" />
        </div>

        <div v-if="p.plot_location" class="flex items-center gap-1.5 text-xs text-muted mb-4">
          <AppIcon name="location" :size="14" />
          <span class="truncate">{{ p.plot_location }}</span>
        </div>

        <div class="rounded-lg bg-surface-muted/60 p-3 mb-3">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs text-muted">Maintenance Balance</span>
            <BalancePill :balance="plotBalance(p)" :budget="p.monthly_maintenance_budget" size="sm" />
          </div>
          <div class="h-1.5 rounded-full bg-border overflow-hidden">
            <div
              class="h-full rounded-full"
              :class="plotBalance(p) < 0 ? 'bg-negative' : plotBalance(p) < p.monthly_maintenance_budget * 0.2 ? 'bg-warning' : 'bg-positive'"
              :style="{ width: Math.min(100, (p.total_amount_spent / (p.monthly_maintenance_budget || 1)) * 100) + '%' }"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 text-xs">
          <div><span class="text-muted">Budget</span><p class="text-foreground font-medium tabular-nums">{{ formatCurrency(p.monthly_maintenance_budget) }}</p></div>
          <div><span class="text-muted">Spent</span><p class="text-foreground font-medium tabular-nums">{{ formatCurrency(p.total_amount_spent) }}</p></div>
        </div>
        <p class="text-xs text-muted mt-3 truncate">{{ p.customer_name }}</p>
      </button>
    </div>

    <AddPlotDialog v-if="showAddPlot" @close="showAddPlot = false" @created="onPlotCreated" />
  </div>
</template>
