<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"
import KpiCard from "@/components/KpiCard.vue"
import DonutChart from "@/components/DonutChart.vue"
import BalancePill from "@/components/BalancePill.vue"
import AppIcon from "@/components/AppIcon.vue"
import { formatCurrency, formatDate } from "@/format.js"
import { fetchDashboardData } from "@/data/dashboard.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const stats = ref({
  plotCount: 0,
  workCount: 0,
  invoicedTotal: 0,
  invoiceStatus: [],
  lowBalancePlots: [],
  estimateActiveCount: 0,
  estimatesAwaitingAction: [],
  farmProjectActiveCount: 0,
  farmProjectsAtRisk: [],
  siteVisitUpcomingCount: 0,
  siteVisitsUpcoming: [],
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

function daysSince(datetime) {
  if (!datetime) return ""
  const days = Math.floor((Date.now() - new Date(datetime).getTime()) / 86400000)
  return days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`
}

const quickActions = [
  { label: "Generate Invoice", desc: "Collate works into a billable invoice", icon: "invoice", to: "/invoices/generate", primary: true },
  { label: "Log New Work", desc: "Record labor, equipment & material", icon: "plus", to: "/works/new" },
  { label: "New Estimate", desc: "Start a client BOQ from a template", icon: "estimate", to: "/estimates/new" },
  { label: "Schedule Site Visit", desc: "Book a slot and calculate the charge", icon: "calendar", to: "/site-visits/new" },
  { label: "Custom Reports", desc: "Roll-ups by plot, cluster & owner", icon: "file", to: "/works" },
]
</script>

<template>
  <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="space-y-6">
    <!-- KPI cards -->
    <div class="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/plots')">
        <KpiCard label="Plots" :value="loading ? '—' : String(stats.plotCount)" icon="plot" accent="primary" />
      </button>
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/works')">
        <KpiCard label="Works Logged" :value="loading ? '—' : String(stats.workCount)" icon="work" accent="accent" />
      </button>
      <KpiCard label="Invoiced Amount" :value="loading ? '—' : formatCurrency(stats.invoicedTotal)" icon="wallet" accent="info" />
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/estimates')">
        <KpiCard label="Active Estimates" :value="loading ? '—' : String(stats.estimateActiveCount)" icon="estimate" accent="primary" />
      </button>
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/projects')">
        <KpiCard label="Active Projects" :value="loading ? '—' : String(stats.farmProjectActiveCount)" icon="layers" accent="accent" />
      </button>
      <button class="text-left w-full rounded-xl transition-transform hover:-translate-y-0.5" @click="router.push('/site-visits/calendar')">
        <KpiCard label="Upcoming Site Visits" :value="loading ? '—' : String(stats.siteVisitUpcomingCount)" icon="calendar" accent="info" />
      </button>
    </div>

    <!-- Quick actions -->
    <div class="space-y-3">
      <h2 class="font-display text-lg font-semibold text-foreground">Quick Actions</h2>
      <div class="grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
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

    <!-- At-a-glance cards: Invoice Status, Low Balance Plots, Estimates
         Awaiting Action, Projects Nearing/Over Budget, Upcoming Site Visits —
         one flowing grid (3 per row, wraps to 2 on the last row) rather than
         hand-split rows, so it stays balanced regardless of how many cards
         end up in this set. -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Invoice status -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <h2 class="font-display text-lg font-semibold text-foreground mb-1">Invoice Status</h2>
        <p class="text-sm text-muted mb-6">Billed amount by payment state</p>
        <p v-if="loading" class="text-sm text-muted text-center">Loading…</p>
        <DonutChart v-else :data="stats.invoiceStatus" />
      </div>

      <!-- Low balance plots -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-negative-soft text-negative">
            <AppIcon name="alert" :size="17" />
          </span>
          <h2 class="font-display text-lg font-semibold text-foreground">Low Balance Plots</h2>
          <RouterLink to="/low-balance-plots" class="ml-auto text-xs font-medium text-primary hover:underline">View all</RouterLink>
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

      <!-- Estimates awaiting action -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-warning-soft text-warning">
            <AppIcon name="estimate" :size="17" />
          </span>
          <h2 class="font-display text-lg font-semibold text-foreground">Estimates Awaiting Action</h2>
          <RouterLink to="/estimates" class="ml-auto text-xs font-medium text-primary hover:underline">View all</RouterLink>
        </div>
        <p v-if="loading" class="text-sm text-muted text-center py-6">Loading…</p>
        <p v-else-if="!stats.estimatesAwaitingAction.length" class="text-sm text-muted text-center py-6">
          Nothing stalled — all Approved estimates are recent or converted.
        </p>
        <ul v-else class="divide-y divide-border">
          <li v-for="e in stats.estimatesAwaitingAction" :key="e.name" class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/estimates/${e.name}`" class="text-sm font-medium text-foreground truncate hover:text-primary hover:underline block">
                {{ e.customer || e.client_name || e.name }}
              </RouterLink>
              <p class="text-xs text-muted truncate">{{ e.name }}</p>
            </div>
            <span class="shrink-0 text-xs font-semibold text-warning">{{ daysSince(e.approved_on) }}</span>
          </li>
        </ul>
      </div>

      <!-- Projects nearing/over budget -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-negative-soft text-negative">
            <AppIcon name="layers" :size="17" />
          </span>
          <h2 class="font-display text-lg font-semibold text-foreground">Projects Nearing/Over Budget</h2>
          <RouterLink to="/projects" class="ml-auto text-xs font-medium text-primary hover:underline">View all</RouterLink>
        </div>
        <p v-if="loading" class="text-sm text-muted text-center py-6">Loading…</p>
        <p v-else-if="!stats.farmProjectsAtRisk.length" class="text-sm text-muted text-center py-6">
          No active projects within 10% of their budget.
        </p>
        <ul v-else class="divide-y divide-border">
          <li v-for="p in stats.farmProjectsAtRisk" :key="p.name" class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/projects/${p.name}`" class="text-sm font-medium text-foreground truncate hover:text-primary hover:underline block">
                {{ p.name }}
              </RouterLink>
              <p class="text-xs text-muted truncate">{{ p.customer }}</p>
            </div>
            <BalancePill :balance="p.cost_balance" :budget="p.estimated_cost" size="sm" />
          </li>
        </ul>
      </div>

      <!-- Upcoming site visits -->
      <div class="bg-surface border border-border rounded-xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex items-center justify-center w-8 h-8 rounded-lg bg-info-soft text-info">
            <AppIcon name="calendar" :size="17" />
          </span>
          <h2 class="font-display text-lg font-semibold text-foreground">Upcoming Site Visits</h2>
          <RouterLink to="/site-visits/calendar" class="ml-auto text-xs font-medium text-primary hover:underline">View all</RouterLink>
        </div>
        <p v-if="loading" class="text-sm text-muted text-center py-6">Loading…</p>
        <p v-else-if="!stats.siteVisitsUpcoming.length" class="text-sm text-muted text-center py-6">
          Nothing scheduled in the next 7 days.
        </p>
        <ul v-else class="divide-y divide-border">
          <li v-for="v in stats.siteVisitsUpcoming" :key="v.name" class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <RouterLink :to="`/site-visits/${v.name}`" class="text-sm font-medium text-foreground truncate hover:text-primary hover:underline block">
                {{ v.customer_name }}
              </RouterLink>
              <p class="text-xs text-muted truncate">{{ v.site_location }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-xs font-semibold text-foreground">{{ formatDate(v.scheduled_date) }}</p>
              <p v-if="v.slot" class="text-xs text-muted">{{ v.slot }}</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
