<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import BackButton from "@/components/BackButton.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import TabNav from "@/components/TabNav.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import DonutChart from "@/components/DonutChart.vue"
import { fetchFarmProjectDetail, farmProjectBalance, updateFarmProjectStatus, saveFarmProjectTasks } from "@/data/farm_projects.js"
import { fetchPlotDetail } from "@/data/plots.js"
import { fetchWorks, workStatus } from "@/data/works.js"
import { formatCurrency, formatDate } from "@/format.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const project = ref(null)
const plot = ref(null)
const works = ref([])
const tasks = ref([])

async function load() {
  try {
    project.value = await fetchFarmProjectDetail(route.params.id)
    tasks.value = project.value.tasks || []
    const [plotDoc, workRows] = await Promise.all([
      project.value.plot ? fetchPlotDetail(project.value.plot) : Promise.resolve(null),
      fetchWorks({ farmProject: project.value.name }),
    ])
    plot.value = plotDoc
    works.value = workRows
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this Farm Project."
  } finally {
    loading.value = false
  }
}
onMounted(load)

const tab = ref("details")
const tabs = computed(() => [
  { key: "details", label: "Details" },
  { key: "works", label: `Work Entries (${works.value.length})` },
  { key: "tasks", label: `Milestones (${tasks.value.length})` },
])

const progressPct = computed(() =>
  project.value?.estimated_cost ? Math.min(100, Math.round((project.value.actual_cost / project.value.estimated_cost) * 100)) : 0,
)

const showCompleteConfirm = ref(false)
const savingStatus = ref(false)
async function markCompleted() {
  savingStatus.value = true
  try {
    project.value = await updateFarmProjectStatus(project.value.name, "Completed")
    showCompleteConfirm.value = false
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to update status."
  } finally {
    savingStatus.value = false
  }
}

const savingTasks = ref(false)
async function persistTasks() {
  savingTasks.value = true
  try {
    const updated = await saveFarmProjectTasks(project.value.name, tasks.value)
    tasks.value = updated.tasks || []
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to save milestones."
  } finally {
    savingTasks.value = false
  }
}

const taskTitle = ref("")
const taskDueDate = ref("")
function addTask() {
  if (!taskTitle.value.trim()) return
  tasks.value = [...tasks.value, { title: taskTitle.value.trim(), status: "Open", due_date: taskDueDate.value || null }]
  taskTitle.value = ""
  taskDueDate.value = ""
  persistTasks()
}
const TASK_FLOW = ["Open", "In Progress", "Done"]
function cycleTask(idx) {
  const task = tasks.value[idx]
  task.status = TASK_FLOW[(TASK_FLOW.indexOf(task.status) + 1) % TASK_FLOW.length]
  persistTasks()
}
function removeTask(idx) {
  tasks.value = tasks.value.filter((_, i) => i !== idx)
  persistTasks()
}
const completedTaskCount = computed(() => tasks.value.filter((t) => t.status === "Done").length)
const taskProgressPct = computed(() => (tasks.value.length ? Math.round((completedTaskCount.value / tasks.value.length) * 100) : 0))

// Same 3 status colors as the milestone circle/StatusBadge — counts, not currency.
const milestoneChartData = computed(() => {
  const counts = { Open: 0, "In Progress": 0, Done: 0 }
  for (const t of tasks.value) counts[t.status] = (counts[t.status] || 0) + 1
  return [
    { label: "Open", value: counts.Open, color: "var(--color-muted)" },
    { label: "In Progress", value: counts["In Progress"], color: "var(--color-warning)" },
    { label: "Done", value: counts.Done, color: "var(--color-positive)" },
  ].filter((s) => s.value > 0)
})

// Deliberately a fixed 2-color scheme (red spent / dark green remaining),
// not the 3-tier rule the Actual Cost bar uses — client asked for this donut
// specifically to read unambiguously at a glance. Over budget adds a
// distinct "Over Budget" slice for the overage instead of just clipping
// "Spent" at the estimated total, so the overrun is visible.
const budgetChartData = computed(() => {
  if (!project.value) return []
  const estimated = project.value.estimated_cost || 0
  const actual = project.value.actual_cost || 0
  const balance = farmProjectBalance(project.value)
  if (balance < 0) {
    return [
      { label: "Spent (within budget)", value: estimated, color: "var(--color-negative)" },
      { label: "Over Budget", value: -balance, color: "var(--color-negative)" },
    ]
  }
  return [
    { label: "Spent", value: actual, color: "var(--color-negative)" },
    { label: "Remaining", value: balance, color: "var(--color-positive)" },
  ]
})
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else-if="project" class="space-y-6">
    <BackButton fallback="/projects" fallback-label="Back to Farm Projects" />

    <div class="flex flex-col sm:flex-row sm:items-center gap-4">
      <div>
        <div class="flex items-center gap-3 flex-wrap">
          <p class="text-xs font-mono text-muted">{{ project.name }}</p>
          <StatusBadge :status="project.status" />
        </div>
        <h2 class="mt-1 font-display text-2xl font-semibold text-foreground">{{ project.category || "Farm Project" }}</h2>
        <p class="text-sm text-muted mt-1">
          <router-link :to="`/owners/${project.customer}`" class="text-primary hover:underline">{{ project.customer }}</router-link>
          <template v-if="plot"> · <router-link :to="`/plots/${plot.name}`" class="text-primary hover:underline">{{ plot.plot_name }}</router-link></template>
        </p>
      </div>
      <button
        v-if="project.status === 'Active'"
        class="sm:ml-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover"
        @click="showCompleteConfirm = true"
      >
        <AppIcon name="check" :size="16" /> Mark Completed
      </button>
      <div v-else class="sm:ml-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-positive-soft text-positive text-sm font-semibold">
        <AppIcon name="check" :size="16" /> Project Completed
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-surface border border-border rounded-xl p-5">
        <p class="text-xs text-muted">Estimated cost</p>
        <p class="mt-2 font-display text-2xl font-semibold text-foreground tabular-nums">{{ formatCurrency(project.estimated_cost) }}</p>
        <p class="mt-1 text-xs text-muted">from approved estimate</p>
      </div>
      <div class="bg-surface border border-border rounded-xl p-5">
        <p class="text-xs text-muted">Actual cost</p>
        <p class="mt-2 font-display text-2xl font-semibold text-foreground tabular-nums">{{ formatCurrency(project.actual_cost) }}</p>
        <div class="mt-3 h-2 rounded-full bg-surface-muted overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="farmProjectBalance(project) < 0 ? 'bg-negative' : progressPct > 80 ? 'bg-warning' : 'bg-primary'"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
        <p class="mt-1 text-xs text-muted">{{ progressPct }}% of estimated cost used</p>
      </div>
      <div class="rounded-xl p-5 border" :class="farmProjectBalance(project) < 0 ? 'bg-negative-soft border-negative/30' : 'bg-positive-soft border-positive/30'">
        <p class="text-xs" :class="farmProjectBalance(project) < 0 ? 'text-negative' : 'text-positive'">Cost balance</p>
        <p class="mt-2 font-display text-2xl font-semibold tabular-nums" :class="farmProjectBalance(project) < 0 ? 'text-negative' : 'text-positive'">
          {{ formatCurrency(farmProjectBalance(project)) }}
        </p>
        <p class="mt-1 text-xs" :class="farmProjectBalance(project) < 0 ? 'text-negative/80' : 'text-positive/80'">
          {{ farmProjectBalance(project) < 0 ? "Over estimated cost" : "Available to complete work" }}
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-medium text-foreground mb-1">Budget Status</h3>
        <p class="text-xs text-muted mb-4">Estimated vs. actual spend</p>
        <DonutChart :data="budgetChartData" center-top-label="Estimated" :center-value="formatCurrency(project.estimated_cost)" empty-text="No budget set." />
      </div>
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-medium text-foreground mb-1">Milestones Completion</h3>
        <p class="text-xs text-muted mb-4">{{ completedTaskCount }} of {{ tasks.length }} complete</p>
        <DonutChart
          :data="milestoneChartData"
          format="count"
          center-top-label="Complete"
          :center-value="`${taskProgressPct}%`"
          empty-text="No milestones yet."
        />
      </div>
    </div>

    <TabNav v-model="tab" :tabs="tabs" />

    <div v-if="tab === 'details'" class="grid md:grid-cols-2 gap-4">
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-medium text-foreground mb-3">Project Details</h3>
        <dl class="text-sm divide-y divide-border">
          <div class="flex justify-between py-2.5"><dt class="text-muted">Customer</dt><dd class="text-foreground">{{ project.customer }}</dd></div>
          <div class="flex justify-between py-2.5"><dt class="text-muted">Plot</dt><dd class="text-foreground text-right">{{ plot?.plot_name || project.plot || "—" }}</dd></div>
          <div class="flex justify-between py-2.5"><dt class="text-muted">Category</dt><dd class="text-foreground">{{ project.category || "—" }}</dd></div>
          <div class="flex justify-between py-2.5 items-center"><dt class="text-muted">Status</dt><dd><StatusBadge :status="project.status" /></dd></div>
        </dl>
      </div>
      <div class="bg-surface border border-border rounded-xl p-5">
        <h3 class="font-medium text-foreground mb-3">Linked Records</h3>
        <div class="space-y-3">
          <router-link :to="`/owners/${project.customer}`" class="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-muted hover:bg-primary-soft transition-colors">
            <span class="flex items-center gap-2"><AppIcon name="users" :size="17" class="text-primary" /><span class="text-sm font-medium text-foreground">Customer profile</span></span>
            <AppIcon name="chevronRight" :size="15" class="text-muted" />
          </router-link>
          <router-link v-if="plot" :to="`/plots/${plot.name}`" class="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-muted hover:bg-primary-soft transition-colors">
            <span class="flex items-center gap-2"><AppIcon name="plot" :size="17" class="text-primary" /><span class="text-sm font-medium text-foreground">Plot record</span></span>
            <AppIcon name="chevronRight" :size="15" class="text-muted" />
          </router-link>
          <router-link :to="`/estimates/${project.estimate}/output`" class="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-muted hover:bg-primary-soft transition-colors">
            <span class="flex items-center gap-2"><AppIcon name="estimate" :size="17" class="text-primary" /><span class="text-sm font-medium text-foreground">Approved estimate · {{ project.estimate }}</span></span>
            <AppIcon name="chevronRight" :size="15" class="text-muted" />
          </router-link>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'works'">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-medium text-foreground">Work entries</h3>
          <p class="text-xs text-muted mt-1">Actual work logged against this project's plot.</p>
        </div>
        <router-link
          :to="{ path: '/works/new', query: { plot: project.plot, farm_project: project.name } }"
          class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted"
        >
          <AppIcon name="plus" :size="15" /> Log Work
        </router-link>
      </div>
      <div v-if="works.length" class="bg-surface border border-border rounded-xl overflow-hidden">
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
            <tr v-for="w in works" :key="w.name" class="hover:bg-surface-muted/60 cursor-pointer" @click="router.push(`/works/${w.name}`)">
              <td class="px-5 py-3.5">
                <p class="font-medium text-foreground">{{ w.work_type_name }}</p>
                <p class="text-xs text-muted">{{ w.name }}</p>
              </td>
              <td class="px-5 py-3.5 text-muted">{{ formatDate(w.work_date) }}</td>
              <td class="px-5 py-3.5"><StatusBadge :status="workStatus(w.docstatus)" /></td>
              <td class="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">{{ formatCurrency(w.total_cost) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="text-center py-16 text-muted bg-surface border border-border rounded-xl">No work entries logged yet.</div>
    </div>

    <div v-else class="bg-surface border border-border rounded-xl p-5 sm:p-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="font-medium text-foreground">Project milestones</h3>
          <p class="text-xs text-muted mt-1">{{ completedTaskCount }} of {{ tasks.length }} milestones complete · {{ taskProgressPct }}%</p>
        </div>
        <div class="w-full lg:w-72">
          <div class="h-2 rounded-full bg-surface-muted overflow-hidden">
            <div class="h-full rounded-full bg-positive transition-all" :style="{ width: `${taskProgressPct}%` }" />
          </div>
        </div>
      </div>

      <div class="mt-5 flex flex-col gap-2">
        <div v-for="(task, idx) in tasks" :key="task.name || idx" class="flex items-center gap-3 rounded-lg border border-border px-3 py-3">
          <button
            class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
            :class="
              task.status === 'Done'
                ? 'border-positive bg-positive text-positive-foreground'
                : task.status === 'In Progress'
                  ? 'border-warning bg-warning text-transparent'
                  : 'border-border text-transparent hover:border-primary'
            "
            :disabled="savingTasks"
            :title="`${task.status} — click to advance`"
            @click="cycleTask(idx)"
          >
            <AppIcon name="check" :size="12" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-sm" :class="task.status === 'Done' ? 'line-through text-muted' : 'font-medium text-foreground'">{{ task.title }}</p>
            <p v-if="task.due_date" class="text-[11px] text-muted mt-1">Due {{ formatDate(task.due_date) }}</p>
          </div>
          <StatusBadge :status="task.status" />
          <button class="p-1.5 text-muted hover:text-negative" title="Delete task" :disabled="savingTasks" @click="removeTask(idx)">
            <AppIcon name="trash" :size="15" />
          </button>
        </div>
        <p v-if="!tasks.length" class="text-sm text-muted text-center py-6">No milestones yet.</p>
      </div>

      <form class="mt-5 flex flex-col sm:flex-row gap-2" @submit.prevent="addTask">
        <input v-model="taskTitle" placeholder="Add a milestone…" class="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/25" />
        <input v-model="taskDueDate" type="date" class="px-3 py-2 rounded-lg border border-border bg-background text-sm text-muted focus:outline-none focus:ring-2 focus:ring-primary/25" />
        <button type="submit" :disabled="savingTasks" class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-50">
          <AppIcon name="plus" :size="15" /> Add
        </button>
      </form>
    </div>

    <ConfirmDialog
      v-if="showCompleteConfirm"
      title="Mark project completed?"
      message="This will close the project and preserve its final budget balance for reporting."
      confirm-label="Mark Completed"
      @confirm="markCompleted"
      @cancel="showCompleteConfirm = false"
    />
  </div>

  <div v-else class="text-center py-20 text-muted">Farm Project not found.</div>
</template>
