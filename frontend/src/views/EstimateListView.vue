<script setup>
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import { fetchEstimates, fetchCategoryNames, areaLabel } from "@/data/estimates.js"

// Computed display labels (docstatus + linked Farm Project), not stored
// status values — see estimate-boq-module-plan.md, "Lifecycle model, revised".
const STATUS_LABELS = ["Draft", "Approved", "Converted to Project", "Cancelled"]
import { formatCurrency, formatDate } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const estimates = ref([])
const categoryNames = ref([])

const query = ref("")
const statusFilter = ref("")
const categoryFilter = ref("")

onMounted(async () => {
  try {
    const [ests, cats] = await Promise.all([fetchEstimates(), fetchCategoryNames()])
    estimates.value = ests
    categoryNames.value = cats
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load estimates."
  } finally {
    loading.value = false
  }
})

const filtered = computed(() =>
  estimates.value.filter((e) => {
    const q = query.value.toLowerCase()
    const matchQ =
      !q ||
      e.name.toLowerCase().includes(q) ||
      (e.client_name || "").toLowerCase().includes(q) ||
      (e.customer || "").toLowerCase().includes(q) ||
      (e.category || "").toLowerCase().includes(q)
    const matchStatus = !statusFilter.value || e.statusLabel === statusFilter.value
    const matchCat = !categoryFilter.value || e.category === categoryFilter.value
    return matchQ && matchStatus && matchCat
  }),
)

const statusCounts = computed(() => {
  const map = { Draft: 0, Approved: 0, "Converted to Project": 0, Cancelled: 0 }
  for (const e of estimates.value) {
    if (map[e.statusLabel] !== undefined) map[e.statusLabel]++
  }
  return map
})

const PILL_ACTIVE = {
  Draft: "bg-info-soft text-info border-info/30",
  Approved: "bg-positive-soft text-positive border-positive/30",
  "Converted to Project": "bg-primary-soft text-primary border-primary/30",
  Cancelled: "bg-negative-soft text-negative border-negative/30",
}

function togglePill(s) {
  statusFilter.value = statusFilter.value === s ? "" : s
}
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <div>
        <h2 class="font-display text-2xl font-semibold text-foreground">Estimates</h2>
        <p class="text-sm text-muted mt-0.5">Project quotes and BOQs for clients & prospects.</p>
      </div>
      <router-link
        to="/estimates/new"
        class="sm:ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
      >
        <AppIcon name="plus" :size="17" /> New Estimate
      </router-link>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading estimates…</p>
    <p v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</p>

    <template v-else>
      <!-- Status summary pills -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in STATUS_LABELS"
          :key="s"
          @click="togglePill(s)"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
          :class="statusFilter === s ? PILL_ACTIVE[s] : 'bg-surface text-muted border-border hover:border-primary/30'"
        >
          <span class="font-semibold tabular-nums">{{ statusCounts[s] }}</span> {{ s }}
        </button>
      </div>

      <!-- Filters -->
      <div class="flex flex-col lg:flex-row lg:items-center gap-2">
        <p class="text-sm text-muted">{{ filtered.length }} estimate{{ filtered.length !== 1 ? "s" : "" }}</p>
        <div class="lg:ml-auto flex flex-wrap items-center gap-2">
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="16" /></span>
            <input
              v-model="query"
              type="search"
              placeholder="Search estimates…"
              class="w-full sm:w-60 pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div class="w-40"><FilterCombobox v-model="statusFilter" :options="STATUS_LABELS" placeholder="All statuses" /></div>
          <div class="w-48"><FilterCombobox v-model="categoryFilter" :options="categoryNames" placeholder="All categories" /></div>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-surface border border-border rounded-xl">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-border bg-surface-muted/40">
              <th class="font-medium text-muted px-5 py-3">Estimate</th>
              <th class="font-medium text-muted px-5 py-3">Client</th>
              <th class="font-medium text-muted px-5 py-3">Category</th>
              <th class="font-medium text-muted px-5 py-3">Area</th>
              <th class="font-medium text-muted px-5 py-3 text-right">Grand Total</th>
              <th class="font-medium text-muted px-5 py-3">Status</th>
              <th class="font-medium text-muted px-5 py-3">Last Updated</th>
              <th class="font-medium text-muted px-5 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="est in filtered"
              :key="est.name"
              class="hover:bg-surface-muted/30 cursor-pointer transition-colors"
              @click="router.push(`/estimates/${est.name}`)"
            >
              <td class="px-5 py-3.5">
                <p class="font-medium text-foreground">{{ est.name }}</p>
                <p v-if="est.amended_from" class="text-xs text-muted">Amended from {{ est.amended_from }}</p>
              </td>
              <td class="px-5 py-3.5 text-foreground">{{ est.customer || est.client_name || "—" }}</td>
              <td class="px-5 py-3.5">
                <span class="inline-block px-2.5 py-1 rounded-md bg-surface-muted text-xs font-medium text-muted">{{ est.category || "—" }}</span>
              </td>
              <td class="px-5 py-3.5 text-muted tabular-nums">{{ areaLabel(est) }}</td>
              <td class="px-5 py-3.5 text-right font-semibold text-foreground tabular-nums">{{ formatCurrency(est.grand_total) }}</td>
              <td class="px-5 py-3.5"><StatusBadge :status="est.statusLabel" /></td>
              <td class="px-5 py-3.5 text-muted text-xs">{{ formatDate(est.modified) }}</td>
              <td class="px-5 py-3.5"><AppIcon name="chevronRight" :size="17" class="text-muted" /></td>
            </tr>
          </tbody>
        </table>

        <div v-if="!filtered.length" class="py-16 text-center text-muted">No estimates match your filters.</div>
      </div>
    </template>
  </div>
</template>
