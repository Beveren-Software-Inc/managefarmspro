<script setup>
import { ref, watch, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import { fetchWorks, workStatus, WORK_STATUSES, WORK_PAGE_SIZE, thisWeekRange, thisMonthRange } from "@/data/works.js"
import { formatCurrency, formatDate } from "@/format.js"

const router = useRouter()

const search = ref("")
const status = ref("")
const fromDate = ref("")
const toDate = ref("")

const works = ref([])
const loading = ref(true)
const loadingMore = ref(false)
const error = ref(null)
const hasMore = ref(true)

async function loadPage(reset) {
  const limitStart = reset ? 0 : works.value.length
  try {
    const rows = await fetchWorks({
      search: search.value,
      status: status.value,
      from: fromDate.value,
      to: toDate.value,
      limitStart,
    })
    works.value = reset ? rows : [...works.value, ...rows]
    hasMore.value = rows.length === WORK_PAGE_SIZE
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load works."
  }
}

onMounted(async () => {
  await loadPage(true)
  loading.value = false
})

async function loadMore() {
  loadingMore.value = true
  await loadPage(false)
  loadingMore.value = false
}

function applyPreset(range) {
  fromDate.value = range.from
  toDate.value = range.to
}

let searchTimer = null
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadPage(true), 300)
})
watch([status, fromDate, toDate], () => loadPage(true))
</script>

<template>
  <div class="space-y-5">
    <div class="sticky top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur border-b border-border space-y-3">
      <div class="flex items-center gap-3">
        <p class="text-sm text-muted">{{ loading ? "Loading…" : `${works.length}${hasMore ? "+" : ""} work records` }}</p>
        <button
          class="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover"
          @click="router.push('/works/new')"
        >
          <AppIcon name="plus" :size="17" /> New Work
        </button>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">Search</span>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="17" /></span>
            <input
              v-model="search"
              type="search"
              placeholder="Search works or plots…"
              class="w-full sm:w-56 pl-9 pr-3 py-2.5 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </label>
        <label class="block w-full sm:w-40">
          <span class="text-xs text-muted mb-1.5 block">Filter by Status</span>
          <FilterCombobox v-model="status" :options="WORK_STATUSES" placeholder="All statuses" />
        </label>
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">From Date</span>
          <input v-model="fromDate" type="date" class="py-2.5 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">To Date</span>
          <input v-model="toDate" type="date" class="py-2.5 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <div class="flex items-center gap-2">
          <button class="px-3 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="applyPreset(thisWeekRange())">This Week</button>
          <button class="px-3 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="applyPreset(thisMonthRange())">This Month</button>
          <button
            v-if="fromDate || toDate"
            class="px-2 py-2.5 text-muted hover:text-foreground"
            aria-label="Clear date range"
            @click="fromDate = ''; toDate = ''"
          >
            <AppIcon name="x" :size="16" />
          </button>
        </div>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading works…</p>
    <p v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</p>
    <p v-else-if="!works.length" class="text-sm text-muted text-center py-16 bg-surface border border-border rounded-xl">
      No works match these filters.
    </p>

    <div v-else class="bg-surface border border-border rounded-xl overflow-hidden overflow-x-auto">
      <table class="w-full text-sm min-w-[640px]">
        <thead>
          <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
            <th class="font-medium px-5 py-3">Work</th>
            <th class="font-medium px-5 py-3">Plot</th>
            <th class="font-medium px-5 py-3">Date</th>
            <th class="font-medium px-5 py-3">Status</th>
            <th class="font-medium px-5 py-3 text-right">Total Cost</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="w in works" :key="w.name" class="hover:bg-surface-muted/60 cursor-pointer" @click="router.push(`/works/${w.name}`)">
            <td class="px-5 py-3.5">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                  <AppIcon name="work" :size="17" />
                </div>
                <div>
                  <p class="font-medium text-foreground">{{ w.work_type_name }}</p>
                  <p class="text-xs text-muted">{{ w.name }}</p>
                </div>
              </div>
            </td>
            <td class="px-5 py-3.5 text-muted">
              <router-link :to="`/plots/${w.plot}`" class="text-primary hover:underline" @click.stop>{{ w.plot }}</router-link>
            </td>
            <td class="px-5 py-3.5 text-muted">{{ formatDate(w.work_date) }}</td>
            <td class="px-5 py-3.5"><StatusBadge :status="workStatus(w.docstatus)" /></td>
            <td class="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">{{ formatCurrency(w.total_cost) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && hasMore" class="text-center">
      <button
        :disabled="loadingMore"
        class="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted disabled:opacity-60"
        @click="loadMore"
      >
        {{ loadingMore ? "Loading…" : "Load More" }}
      </button>
    </div>
  </div>
</template>
