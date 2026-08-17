<script setup>
import { ref, computed, watch, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import SiteVisitReportDialog from "@/components/SiteVisitReportDialog.vue"
import { fetchSiteVisits } from "@/data/site_visits.js"
import { formatDate } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const visits = ref([])
const showReportDialog = ref(false)

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const todayIso = isoDate(new Date())

const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selectedDate = ref(todayIso)
const monthName = computed(() => month.value.toLocaleDateString("en-IN", { month: "long", year: "numeric" }))
const firstWeekday = computed(() => (new Date(month.value.getFullYear(), month.value.getMonth(), 1).getDay() + 6) % 7)
const daysInMonth = computed(() => new Date(month.value.getFullYear(), month.value.getMonth() + 1, 0).getDate())
const days = computed(() =>
  Array.from({ length: firstWeekday.value + daysInMonth.value }, (_, i) => (i < firstWeekday.value ? null : i - firstWeekday.value + 1)),
)
function dateFor(day) {
  return `${month.value.getFullYear()}-${String(month.value.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}
function visitsFor(dateIso) {
  return visits.value.filter((v) => v.scheduled_date === dateIso && v.status !== "Cancelled")
}
function shiftMonth(amount) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + amount, 1)
}

const selectedVisits = computed(() => visitsFor(selectedDate.value))

// Was fetching every Site Visit ever created on every load, unbounded — the
// grid only ever shows days within the visible month, so scope the fetch the
// same way instead of pulling the whole table just to filter it client-side.
async function loadMonth() {
  loading.value = true
  error.value = null
  try {
    const from = dateFor(1)
    const to = dateFor(daysInMonth.value)
    visits.value = await fetchSiteVisits({ dateFrom: from, dateTo: to })
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load site visits."
  } finally {
    loading.value = false
  }
}
onMounted(loadMonth)
// Reset the selected day whenever the visible month changes — otherwise a
// stale selectedDate from a previous month would look inside `visits`, which
// is now scoped to the newly-loaded month and would never contain it,
// silently showing "no visits" for a date not even in view. Past dates
// can't be scheduled against, so never land on one: prefer today if it's in
// the visible month, the 1st if the month is entirely upcoming, or nothing
// selected if the whole month is already in the past.
watch(month, () => {
  const firstOfMonth = dateFor(1)
  const lastOfMonth = dateFor(daysInMonth.value)
  selectedDate.value = todayIso >= firstOfMonth && todayIso <= lastOfMonth ? todayIso : firstOfMonth < todayIso ? "" : firstOfMonth
  loadMonth()
})
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">Site Visits</p>
        <h1 class="font-display text-2xl font-semibold text-foreground">Visit Calendar</h1>
        <p class="text-sm text-muted mt-1">Booked dates are highlighted — pick a free date to schedule a new visit.</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-muted"
          @click="showReportDialog = true"
        >
          <AppIcon name="download" :size="17" /> Report
        </button>
        <button class="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover" @click="router.push('/site-visits/new')">
          <AppIcon name="plus" :size="17" /> New Site Visit
        </button>
      </div>
    </div>

    <SiteVisitReportDialog v-if="showReportDialog" @close="showReportDialog = false" />

    <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>
    <p v-else-if="loading" class="text-sm text-muted text-center py-16">Loading calendar…</p>

    <section v-else class="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div class="rounded-2xl border border-border bg-surface overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
          <div class="flex items-center gap-2">
            <button class="rounded-lg p-2 hover:bg-surface-muted" @click="shiftMonth(-1)"><AppIcon name="arrowLeft" :size="17" /></button>
            <button class="rounded-lg p-2 hover:bg-surface-muted" @click="shiftMonth(1)"><AppIcon name="chevronRight" :size="17" /></button>
            <h2 class="ml-2 font-semibold text-foreground">{{ monthName }}</h2>
          </div>
        </div>

        <div class="grid grid-cols-7 border-b border-border">
          <div v-for="label in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']" :key="label" class="p-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {{ label }}
          </div>
        </div>

        <div class="grid grid-cols-7">
          <div
            v-for="(day, index) in days"
            :key="index"
            class="min-h-28 border-b border-r border-border p-2"
            :class="[
              day && dateFor(day) < todayIso ? 'bg-surface-muted/40 cursor-not-allowed' : 'cursor-pointer',
              day && selectedDate === dateFor(day) ? 'bg-primary-soft/40' : '',
            ]"
            @click="day && dateFor(day) >= todayIso && (selectedDate = dateFor(day))"
          >
            <template v-if="day">
              <div class="flex items-center justify-between">
                <span
                  class="text-xs font-semibold"
                  :class="[
                    dateFor(day) === todayIso
                      ? 'flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground'
                      : dateFor(day) < todayIso
                        ? 'text-muted/50'
                        : 'text-muted',
                  ]"
                >
                  {{ day }}
                </span>
                <span v-if="visitsFor(dateFor(day)).length" class="text-[10px] font-semibold text-primary">{{ visitsFor(dateFor(day)).length }}</span>
              </div>
              <button
                v-for="v in visitsFor(dateFor(day)).slice(0, 3)"
                :key="v.name"
                class="mt-2 w-full rounded-lg bg-primary-soft px-2 py-1.5 text-left text-[10px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
                @click.stop="router.push(`/site-visits/${v.name}`)"
              >
                <span class="block truncate">{{ v.slot ? `${v.slot} · ` : "" }}{{ v.customer_name }}</span>
              </button>
              <p v-if="visitsFor(dateFor(day)).length > 3" class="mt-1 text-[10px] text-muted">+{{ visitsFor(dateFor(day)).length - 3 }} more</p>
            </template>
          </div>
        </div>
      </div>

      <aside class="rounded-2xl border border-border bg-surface p-5 h-fit">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Selected day</p>
        <h2 v-if="selectedDate" class="mt-2 text-xl font-semibold text-foreground">{{ formatDate(selectedDate) }}</h2>
        <h2 v-else class="mt-2 text-xl font-semibold text-muted">No day selected</h2>

        <div v-if="!selectedDate" class="mt-5 rounded-xl bg-background p-4 text-sm text-muted">
          This month is entirely in the past — pick a day in the current or an upcoming month to schedule a visit.
        </div>
        <div v-else-if="selectedVisits.length" class="mt-5 space-y-3">
          <button v-for="v in selectedVisits" :key="v.name" class="w-full rounded-xl bg-surface-muted p-3 text-left" @click="router.push(`/site-visits/${v.name}`)">
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold text-foreground">{{ v.slot || v.name }}</p>
              <StatusBadge :status="v.status" />
            </div>
            <p class="mt-1 text-sm text-foreground">{{ v.customer_name }}</p>
            <p class="text-xs text-muted">{{ v.site_location }}</p>
          </button>
        </div>
        <div v-else class="mt-5 rounded-xl bg-background p-4 text-sm text-muted">
          No visits scheduled for this date.
          <router-link :to="`/site-visits/new?date=${selectedDate}`" class="block mt-2 font-semibold text-primary hover:underline">Schedule one →</router-link>
        </div>
      </aside>
    </section>
  </div>
</template>
