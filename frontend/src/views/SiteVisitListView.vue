<script setup>
import { ref, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import { fetchSiteVisits, fetchSiteVisitStatusCounts, SITE_VISIT_STATUSES, SITE_VISIT_PAGE_SIZE } from "@/data/site_visits.js"
import { formatCurrency, formatDate } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const loadingMore = ref(false)
const error = ref(null)
const visits = ref([])
const hasMore = ref(false)
// Counts are true totals per status (own COUNT queries) — deliberately not
// derived from `visits`, since that's now only ever a page at a time.
const counts = ref({})

async function loadPage(reset) {
  const limitStart = reset ? 0 : visits.value.length
  const rows = await fetchSiteVisits({ search: query.value, status: status.value, limitStart })
  visits.value = reset ? rows : [...visits.value, ...rows]
  hasMore.value = rows.length === SITE_VISIT_PAGE_SIZE
}

async function load() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([loadPage(true), refreshCounts()])
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load site visits."
  } finally {
    loading.value = false
  }
}
async function loadMore() {
  loadingMore.value = true
  try {
    await loadPage(false)
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load more site visits."
  } finally {
    loadingMore.value = false
  }
}
async function refreshCounts() {
  counts.value = await fetchSiteVisitStatusCounts()
}

const query = ref("")
const status = ref("")
const filters = ["All", ...SITE_VISIT_STATUSES]

onMounted(load)

let searchTimer = null
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 250)
}
function selectFilter(item) {
  status.value = item === "All" ? "" : item
  load()
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">Site Visits</p>
        <h1 class="font-display text-2xl font-semibold text-foreground">Site Visits</h1>
        <p class="text-sm text-muted mt-1">Schedule, inspect, and track every farm visit.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-muted"
          @click="router.push('/site-visits/calendar')"
        >
          <AppIcon name="calendar" :size="17" /> Calendar
        </button>
        <button
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          @click="router.push('/site-visits/new')"
        >
          <AppIcon name="plus" :size="17" /> New Site Visit
        </button>
      </div>
    </div>

    <section class="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <div v-for="item in filters" :key="item" class="rounded-2xl border border-border bg-surface px-4 py-4">
        <p class="text-xs text-muted">{{ item }} visits</p>
        <p class="mt-1 text-2xl font-semibold text-foreground">{{ loading ? "—" : counts[item] }}</p>
      </div>
    </section>

    <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

    <section v-else class="rounded-2xl border border-border bg-surface overflow-hidden">
      <div class="flex flex-col gap-3 p-4 border-b border-border md:flex-row md:items-center">
        <div class="relative flex-1">
          <AppIcon name="search" :size="17" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            v-model="query"
            type="search"
            class="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Search visits, clients, sites…"
            @input="onSearchInput"
          />
        </div>
        <div class="flex items-center gap-2 overflow-x-auto">
          <button
            v-for="item in filters"
            :key="item"
            class="rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap"
            :class="(status === '' && item === 'All') || status === item ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-muted hover:text-foreground'"
            @click="selectFilter(item)"
          >
            {{ item }} <span class="opacity-60">{{ counts[item] }}</span>
          </button>
        </div>
      </div>

      <p v-if="loading" class="text-sm text-muted text-center py-16">Loading site visits…</p>
      <div v-else class="divide-y divide-border">
        <button
          v-for="visit in visits"
          :key="visit.name"
          class="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-surface-muted/60 md:flex-row md:items-center"
          @click="router.push(`/site-visits/${visit.name}`)"
        >
          <div class="flex items-start gap-3 md:w-[28%]">
            <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <AppIcon name="calendar" :size="19" />
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-foreground truncate">{{ visit.name }}</p>
              <p class="mt-0.5 text-xs text-muted truncate">{{ visit.customer_name }}</p>
            </div>
          </div>

          <div class="grid flex-1 grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div>
              <p class="text-[11px] uppercase tracking-wide text-muted">Scheduled</p>
              <p class="mt-1 font-medium text-foreground">{{ visit.scheduled_date ? formatDate(visit.scheduled_date) : "—" }}</p>
              <p v-if="visit.slot" class="text-xs text-muted">{{ visit.slot }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-wide text-muted">Site</p>
              <p class="mt-1 font-medium text-foreground truncate">{{ visit.site_location }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-wide text-muted">Tier</p>
              <p class="mt-1 font-medium text-foreground">{{ visit.distance_tier || "—" }}</p>
              <p class="text-xs text-muted">{{ formatCurrency(visit.total_amount) }}</p>
            </div>
            <div class="flex items-center justify-between gap-2 md:justify-end">
              <StatusBadge :status="visit.status" />
              <AppIcon name="chevronRight" :size="17" class="text-muted" />
            </div>
          </div>
        </button>

        <div v-if="!visits.length" class="p-12 text-center">
          <AppIcon name="search" :size="28" class="mx-auto text-muted" />
          <p class="mt-3 font-semibold text-foreground">No site visits found</p>
          <p class="mt-1 text-sm text-muted">Try adjusting your search or filters.</p>
        </div>
        <div v-else-if="hasMore" class="p-4 text-center border-t border-border">
          <button
            :disabled="loadingMore"
            class="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:opacity-50"
            @click="loadMore"
          >
            {{ loadingMore ? "Loading…" : "Load More" }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
