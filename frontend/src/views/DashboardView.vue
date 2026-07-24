<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"
import KpiCard from "@/components/KpiCard.vue"
import AreaChart from "@/components/AreaChart.vue"
import DonutChart from "@/components/DonutChart.vue"
import BalancePill from "@/components/BalancePill.vue"
import AppIcon from "@/components/AppIcon.vue"
import { formatCurrency } from "@/format.js"
import { fetchDashboardData } from "@/data/dashboard.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const stats = ref({
  plotCount: 0,
  workCount: 0,
  invoicedTotal: 0,
  invoiceStatus: [],
  worksTrend: [],
  lowBalancePlots: [],
})

onMounted(async () => {
  try {
    stats.value = await fetchDashboardData()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load dashboard data."
  } finally {
    loading.value = false
  }
})

const quickActions = [
  { label: "Generate Invoice", desc: "Collate works into a billable invoice", icon: "invoice", to: "/invoices/generate", primary: true },
  { label: "Log New Work", desc: "Record labor, equipment & material", icon: "plus", to: "/works/new" },
  { label: "Custom Reports", desc: "Roll-ups by plot, cluster & owner", icon: "file", to: "/works" },
]
</script>

<template>
  <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="space-y-6">
    <!-- KPI cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/plots')">
        <KpiCard label="Plots" :value="loading ? '—' : String(stats.plotCount)" icon="plot" accent="primary" />
      </button>
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/works')">
        <KpiCard label="Works Logged" :value="loading ? '—' : String(stats.workCount)" icon="work" accent="accent" />
      </button>
      <KpiCard label="Invoiced Amount" :value="loading ? '—' : formatCurrency(stats.invoicedTotal)" icon="wallet" accent="info" />
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <!-- Works trend -->
      <div class="xl:col-span-2 bg-surface border border-border rounded-xl p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-display text-lg font-semibold text-foreground">Daily Works Activity</h2>
            <p class="text-sm text-muted">Works recorded per day, last month</p>
          </div>
        </div>
        <p v-if="loading" class="text-sm text-muted py-16 text-center">Loading…</p>
        <p v-else-if="!stats.worksTrend.length" class="text-sm text-muted py-16 text-center">No works recorded yet.</p>
        <AreaChart v-else :data="stats.worksTrend" />
      </div>

      <!-- Invoice status -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <h2 class="font-display text-lg font-semibold text-foreground mb-1">Invoice Status</h2>
        <p class="text-sm text-muted mb-6">Billed amount by payment state</p>
        <p v-if="loading" class="text-sm text-muted text-center">Loading…</p>
        <DonutChart v-else :data="stats.invoiceStatus" />
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Quick actions -->
      <div class="lg:col-span-2 space-y-3">
        <h2 class="font-display text-lg font-semibold text-foreground">Quick Actions</h2>
        <div class="grid sm:grid-cols-3 gap-4">
          <button
            v-for="a in quickActions"
            :key="a.label"
            @click="router.push(a.to)"
            class="text-left rounded-xl p-5 border transition-all hover:-translate-y-0.5"
            :class="
              a.primary
                ? 'bg-primary text-primary-foreground border-primary hover:bg-primary-hover'
                : 'bg-surface border-border hover:border-primary/40'
            "
          >
            <span
              class="flex items-center justify-center w-10 h-10 rounded-lg mb-3"
              :class="a.primary ? 'bg-primary-foreground/15' : 'bg-primary-soft text-primary'"
            >
              <AppIcon :name="a.icon" :size="20" />
            </span>
            <p class="font-semibold" :class="a.primary ? 'text-primary-foreground' : 'text-foreground'">{{ a.label }}</p>
            <p class="text-xs mt-1" :class="a.primary ? 'text-primary-foreground/70' : 'text-muted'">{{ a.desc }}</p>
          </button>
        </div>
      </div>

      <!-- Low balance plots -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-negative-soft text-negative">
            <AppIcon name="alert" :size="17" />
          </span>
          <h2 class="font-display text-lg font-semibold text-foreground">Low Balance Plots</h2>
        </div>
        <p v-if="loading" class="text-sm text-muted text-center py-6">Loading…</p>
        <p v-else-if="!stats.lowBalancePlots.length" class="text-sm text-muted text-center py-6">
          No plots under the balance threshold.
        </p>
        <ul v-else class="divide-y divide-border">
          <li v-for="p in stats.lowBalancePlots" :key="p.plot_name" class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/plots/${p.plot_name}`" class="text-sm font-medium text-foreground truncate hover:text-primary hover:underline block">
                {{ p.plot_name }}
              </RouterLink>
              <p class="text-xs text-muted truncate">{{ p.customer_name }}</p>
            </div>
            <BalancePill :balance="p.maintenance_balance" :budget="p.monthly_maintenance_budget" size="sm" />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
