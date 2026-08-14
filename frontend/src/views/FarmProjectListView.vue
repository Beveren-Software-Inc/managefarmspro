<script setup>
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import { fetchFarmProjects, farmProjectBalance } from "@/data/farm_projects.js"
import { fetchPlots } from "@/data/plots.js"
import { formatCurrency } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const projects = ref([])
const plotByName = ref({})

onMounted(async () => {
  try {
    const [projectRows, plotRows] = await Promise.all([fetchFarmProjects(), fetchPlots()])
    projects.value = projectRows
    plotByName.value = Object.fromEntries(plotRows.map((p) => [p.name, p.plot_name]))
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load Farm Projects."
  } finally {
    loading.value = false
  }
})

function plotLabel(project) {
  return plotByName.value[project.plot] || project.plot || "—"
}

const query = ref("")
const statusFilter = ref("All")

const activeCount = computed(() => projects.value.filter((p) => p.status === "Active").length)
const completedCount = computed(() => projects.value.filter((p) => p.status === "Completed").length)
const committedBudget = computed(() => projects.value.reduce((sum, p) => sum + (p.estimated_cost || 0), 0))

const filtered = computed(() =>
  projects.value.filter((p) => {
    const q = query.value.toLowerCase()
    const haystack = `${p.name} ${p.customer || ""} ${plotLabel(p)} ${p.category || ""}`.toLowerCase()
    const matchQ = !q || haystack.includes(q)
    const matchStatus = statusFilter.value === "All" || p.status === statusFilter.value
    return matchQ && matchStatus
  }),
)

function progressPct(project) {
  if (!project.estimated_cost) return 0
  return Math.min(100, Math.round((project.actual_cost / project.estimated_cost) * 100))
}
</script>

<template>
  <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="space-y-5">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="font-display text-2xl font-semibold text-foreground">Farm Projects</h1>
        <p class="mt-1 text-sm text-muted">Track funded farm work from estimate approval through completion.</p>
      </div>
      <router-link
        to="/estimates/new"
        class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
      >
        <AppIcon name="plus" :size="17" /> New Estimate
      </router-link>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button class="text-left bg-surface border border-border rounded-xl p-4 hover:border-primary/40 transition-colors" @click="statusFilter = 'All'">
        <p class="text-xs text-muted">All projects</p>
        <p class="mt-1 text-2xl font-display font-semibold text-foreground">{{ projects.length }}</p>
      </button>
      <button class="text-left bg-surface border border-border rounded-xl p-4 hover:border-primary/40 transition-colors" @click="statusFilter = 'Active'">
        <p class="text-xs text-muted">Active</p>
        <p class="mt-1 text-2xl font-display font-semibold text-primary">{{ activeCount }}</p>
      </button>
      <button class="text-left bg-surface border border-border rounded-xl p-4 hover:border-primary/40 transition-colors" @click="statusFilter = 'Completed'">
        <p class="text-xs text-muted">Completed</p>
        <p class="mt-1 text-2xl font-display font-semibold text-positive">{{ completedCount }}</p>
      </button>
      <div class="bg-primary text-primary-foreground rounded-xl p-4">
        <p class="text-xs text-primary-foreground/70">Committed budget</p>
        <p class="mt-1 text-xl font-display font-semibold">{{ formatCurrency(committedBudget) }}</p>
      </div>
    </div>

    <div class="bg-surface border border-border rounded-xl overflow-hidden">
      <div class="px-4 py-4 sm:px-5 border-b border-border flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="relative w-full md:max-w-sm">
          <AppIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            v-model="query"
            type="search"
            placeholder="Search projects, customers, plots…"
            class="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <div class="flex items-center gap-1 p-1 rounded-lg bg-surface-muted w-fit">
          <button
            v-for="filter in ['All', 'Active', 'Completed']"
            :key="filter"
            class="px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
            :class="statusFilter === filter ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'"
            @click="statusFilter = filter"
          >
            {{ filter }}
          </button>
        </div>
      </div>

      <p v-if="loading" class="text-sm text-muted text-center py-16">Loading Farm Projects…</p>

      <template v-else>
        <div class="hidden lg:grid grid-cols-[1.1fr_1.1fr_0.8fr_1.15fr_0.8fr_32px] gap-4 px-5 py-3 bg-surface-muted text-[10px] uppercase tracking-wider font-semibold text-muted">
          <span>Project</span><span>Customer / Plot</span><span>Status</span><span>Budget usage</span><span>Balance</span><span />
        </div>
        <div v-if="filtered.length" class="divide-y divide-border">
          <router-link
            v-for="project in filtered"
            :key="project.name"
            :to="`/projects/${project.name}`"
            class="group grid lg:grid-cols-[1.1fr_1.1fr_0.8fr_1.15fr_0.8fr_32px] gap-3 lg:gap-4 items-center px-4 sm:px-5 py-4 hover:bg-surface-muted/60 transition-colors"
          >
            <div class="min-w-0">
              <p class="text-[11px] font-mono text-muted">{{ project.name }}</p>
              <p class="mt-0.5 font-medium text-sm text-foreground truncate">{{ project.category || "Farm Project" }}</p>
            </div>
            <div class="min-w-0">
              <p class="text-xs font-medium text-foreground truncate">{{ project.customer }}</p>
              <p class="text-[11px] text-muted truncate">{{ plotLabel(project) }}</p>
            </div>
            <div><StatusBadge :status="project.status" /></div>
            <div class="min-w-0">
              <div class="flex items-center justify-between text-[11px] mb-1">
                <span class="text-muted">{{ formatCurrency(project.actual_cost) }}</span>
                <span class="font-medium text-foreground">{{ progressPct(project) }}%</span>
              </div>
              <div class="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                <div class="h-full rounded-full bg-primary" :style="{ width: `${progressPct(project)}%` }" />
              </div>
              <p class="mt-1 text-[10px] text-muted">of {{ formatCurrency(project.estimated_cost) }}</p>
            </div>
            <div>
              <p class="font-medium text-sm" :class="farmProjectBalance(project) >= 0 ? 'text-positive' : 'text-negative'">
                {{ formatCurrency(farmProjectBalance(project)) }}
              </p>
              <p class="text-[10px] text-muted">remaining</p>
            </div>
            <AppIcon name="chevronRight" :size="17" class="text-muted group-hover:text-primary transition-colors" />
          </router-link>
        </div>
        <div v-else class="px-6 py-16 text-center">
          <AppIcon name="search" :size="28" class="mx-auto text-muted" />
          <p class="mt-3 text-sm font-medium text-foreground">No Farm Projects found</p>
          <p class="mt-1 text-xs text-muted">Try changing your search or status filter.</p>
        </div>
      </template>
    </div>
  </div>
</template>
