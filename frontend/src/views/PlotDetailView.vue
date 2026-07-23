<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import BalancePill from "@/components/BalancePill.vue"
import TabNav from "@/components/TabNav.vue"
import { fetchPlotDetail, plotBalance } from "@/data/plots.js"
import { formatCurrency, formatDate } from "@/format.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const plot = ref(null)

onMounted(async () => {
  try {
    plot.value = await fetchPlotDetail(route.params.id)
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this plot."
  } finally {
    loading.value = false
  }
})

const plotWorks = computed(() => plot.value?.work_details || [])

const tab = ref("details")
const tabs = computed(() => [
  { key: "details", label: "Details" },
  { key: "works", label: `Works (${plotWorks.value.length})` },
])

const spentPct = computed(() =>
  plot.value?.monthly_maintenance_budget
    ? Math.min(100, Math.round((plot.value.total_amount_spent / plot.value.monthly_maintenance_budget) * 100))
    : 0,
)
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else-if="plot" class="space-y-6">
    <div
      :class="
        tab === 'works'
          ? 'sticky top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-6 pb-4 bg-background border-b border-border space-y-6'
          : 'space-y-6'
      "
    >
      <button class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground" @click="router.push('/plots')">
        <AppIcon name="arrowLeft" :size="16" /> Back to Plots
      </button>

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <div class="flex items-center gap-3 flex-wrap">
            <h2 class="font-display text-2xl font-semibold text-foreground">{{ plot.plot_name }}</h2>
            <StatusBadge :status="plot.plot_status" />
          </div>
          <p class="text-sm text-muted mt-1">
            {{ plot.cluster }} · {{ plot.area }} {{ plot.units }} ·
            <router-link :to="`/owners/${plot.customer_name}`" class="text-primary hover:underline">{{ plot.customer_name }}</router-link>
          </p>
        </div>
        <button
          class="sm:ml-auto flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover"
          @click="router.push('/works/new')"
        >
          <AppIcon name="plus" :size="17" /> Log Work
        </button>
      </div>

      <!-- Spending summary (most important number) -->
      <div class="grid sm:grid-cols-3 gap-4">
        <div
          class="sm:col-span-1 rounded-xl p-5 border"
          :class="plotBalance(plot) < 0 ? 'bg-negative-soft border-negative/30' : 'bg-positive-soft border-positive/30'"
        >
          <p class="text-sm font-medium" :class="plotBalance(plot) < 0 ? 'text-negative' : 'text-positive'">
            Maintenance Balance
          </p>
          <p class="font-display text-3xl font-bold mt-1" :class="plotBalance(plot) < 0 ? 'text-negative' : 'text-positive'">
            {{ formatCurrency(plotBalance(plot)) }}
          </p>
          <p class="text-xs mt-2" :class="plotBalance(plot) < 0 ? 'text-negative/80' : 'text-positive/80'">
            {{ plotBalance(plot) < 0 ? "Over budget this month" : "Remaining this month" }}
          </p>
        </div>
        <div class="sm:col-span-2 bg-surface border border-border rounded-xl p-5">
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p class="text-xs text-muted">Monthly Budget</p>
              <p class="font-display text-xl font-semibold text-foreground tabular-nums">{{ formatCurrency(plot.monthly_maintenance_budget) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Total Amount Spent</p>
              <p class="font-display text-xl font-semibold text-foreground tabular-nums">{{ formatCurrency(plot.total_amount_spent) }}</p>
            </div>
          </div>
          <div class="flex items-center justify-between text-xs text-muted mb-1.5">
            <span>Budget used</span><span>{{ spentPct }}%</span>
          </div>
          <div class="h-2.5 rounded-full bg-surface-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="plotBalance(plot) < 0 ? 'bg-negative' : spentPct > 80 ? 'bg-warning' : 'bg-positive'"
              :style="{ width: spentPct + '%' }"
            />
          </div>
        </div>
      </div>

      <TabNav v-model="tab" :tabs="tabs" />
    </div>

    <!-- Details tab -->
    <div v-if="tab === 'details'" class="grid sm:grid-cols-2 gap-4">
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-medium text-foreground mb-3">Plot Information</h3>
        <dl class="text-sm divide-y divide-border">
          <div class="flex justify-between py-2.5"><dt class="text-muted">Plot ID</dt><dd class="text-foreground">{{ plot.name }}</dd></div>
          <div class="flex justify-between py-2.5"><dt class="text-muted">Cluster</dt><dd class="text-foreground">{{ plot.cluster }}</dd></div>
          <div class="flex justify-between py-2.5"><dt class="text-muted">Area</dt><dd class="text-foreground">{{ plot.area }} {{ plot.units }}</dd></div>
          <div v-if="plot.plot_location" class="flex justify-between py-2.5"><dt class="text-muted">Location</dt><dd class="text-foreground text-right">{{ plot.plot_location }}</dd></div>
          <div class="flex justify-between py-2.5 items-center"><dt class="text-muted">Status</dt><dd><StatusBadge :status="plot.plot_status" /></dd></div>
        </dl>
      </div>
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-medium text-foreground mb-3">Budget Settings</h3>
        <dl class="text-sm divide-y divide-border">
          <div class="flex justify-between py-2.5"><dt class="text-muted">Monthly Maintenance Budget</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(plot.monthly_maintenance_budget) }}</dd></div>
          <div class="flex justify-between py-2.5"><dt class="text-muted">Supervision Charge</dt><dd class="text-foreground">{{ plot.supervision_charge }}%</dd></div>
          <div class="flex justify-between py-2.5"><dt class="text-muted">This Month Spent</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(plot.total_amount_spent) }}</dd></div>
          <div class="flex justify-between py-2.5 items-center"><dt class="text-muted">Maintenance Balance</dt><dd><BalancePill :balance="plotBalance(plot)" :budget="plot.monthly_maintenance_budget" size="sm" /></dd></div>
        </dl>
      </div>
    </div>

    <!-- Works tab -->
    <div v-else>
      <div v-if="plotWorks.length" class="bg-surface border border-border rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
              <th class="font-medium px-5 py-3">Work</th>
              <th class="font-medium px-5 py-3">Date</th>
              <th class="font-medium px-5 py-3">Status</th>
              <th class="font-medium px-5 py-3 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="w in plotWorks" :key="w.work_id" class="hover:bg-surface-muted/60 cursor-pointer" @click="router.push(`/works/${w.work_id}`)">
              <td class="px-5 py-3.5">
                <p class="font-medium text-foreground">{{ w.work_name }}</p>
                <p class="text-xs text-muted">{{ w.work_id }}</p>
              </td>
              <td class="px-5 py-3.5 text-muted">{{ formatDate(w.work_date) }}</td>
              <td class="px-5 py-3.5"><StatusBadge :status="w.status" /></td>
              <td class="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">{{ formatCurrency(w.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="text-center py-16 text-muted bg-surface border border-border rounded-xl">
        No works logged for this plot yet.
      </div>
    </div>
  </div>

  <div v-else class="text-center py-20 text-muted">Plot not found.</div>
</template>
