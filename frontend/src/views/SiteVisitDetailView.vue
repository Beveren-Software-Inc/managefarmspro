<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import BackButton from "@/components/BackButton.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import {
  fetchSiteVisit,
  saveSiteVisitFields,
  updateSiteVisitStatus,
  fetchSiteVisitTimeline,
  uploadSiteVisitAttachment,
  removeSiteVisitAttachment,
  generateSiteVisitInvoice,
  fetchSiteVisitInvoiceSummary,
  downloadSiteVisitInvoicePdf,
} from "@/data/site_visits.js"
import { formatCurrency, formatDate } from "@/format.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const visit = ref(null)
const timeline = ref([])
const invoiceSummary = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [v, t] = await Promise.all([fetchSiteVisit(route.params.id), fetchSiteVisitTimeline(route.params.id)])
    visit.value = v
    timeline.value = t
    syncInspectionForm()
    invoiceSummary.value = v.sales_invoice ? await fetchSiteVisitInvoiceSummary(v.sales_invoice) : null
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this site visit."
  } finally {
    loading.value = false
  }
}
onMounted(load)

// --- Invoice ---
const generatingInvoice = ref(false)
async function generateInvoice() {
  generatingInvoice.value = true
  try {
    await generateSiteVisitInvoice(visit.value.name)
    await load()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to generate invoice."
  } finally {
    generatingInvoice.value = false
  }
}

const downloadingPdf = ref(false)
async function downloadInvoicePdf() {
  downloadingPdf.value = true
  try {
    const url = await downloadSiteVisitInvoicePdf(visit.value.name)
    window.open(url, "_blank")
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to generate the invoice PDF."
  } finally {
    downloadingPdf.value = false
  }
}

// --- Status actions ---
const statusBusy = ref(false)
const confirmCancel = ref(false)

async function markVisited() {
  statusBusy.value = true
  try {
    await updateSiteVisitStatus(visit.value.name, "Visited")
    await load()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to update status."
  } finally {
    statusBusy.value = false
  }
}
async function confirmCancelVisit() {
  confirmCancel.value = false
  statusBusy.value = true
  try {
    await updateSiteVisitStatus(visit.value.name, "Cancelled")
    await load()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to cancel this visit."
  } finally {
    statusBusy.value = false
  }
}

// --- Inspection ---
const inspection = ref({ visit_date: "", inspection_notes: "" })
const savingInspection = ref(false)
const inspectionSaved = ref(false)
function syncInspectionForm() {
  if (!visit.value) return
  inspection.value = {
    // Defaults to the scheduled date — still editable if the actual visit
    // happened on a different day.
    visit_date: visit.value.visit_date || visit.value.scheduled_date || "",
    inspection_notes: visit.value.inspection_notes || "",
  }
}
async function saveInspection() {
  savingInspection.value = true
  inspectionSaved.value = false
  try {
    await saveSiteVisitFields(visit.value.name, { ...inspection.value })
    inspectionSaved.value = true
    setTimeout(() => (inspectionSaved.value = false), 1800)
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to save inspection notes."
  } finally {
    savingInspection.value = false
  }
}

// --- Analysis status ---
const ANALYSIS_STATUSES = ["Not Started", "Draft", "Ready to Share", "Shared"]
async function setAnalysisStatus(value) {
  try {
    await saveSiteVisitFields(visit.value.name, { analysis_status: value })
    visit.value.analysis_status = value
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to update analysis status."
  }
}

// --- Attachments ---
const uploading = ref(false)
async function onFilesSelected(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ""
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      await uploadSiteVisitAttachment(visit.value.name, file, file.name)
    }
    await load()
  } catch (err) {
    error.value = err.messages?.[0] || err.message || "Failed to upload attachment."
  } finally {
    uploading.value = false
  }
}
async function removeAttachment(row) {
  try {
    await removeSiteVisitAttachment(visit.value.name, row.name)
    await load()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to remove attachment."
  }
}

const canMarkVisited = computed(() => visit.value?.status === "Scheduled")
// Only visits that haven't happened yet can be cancelled — once a visit is
// Visited (or later), cancelling would misrepresent something that already
// took place.
const canCancel = computed(() => visit.value?.status === "Scheduled")
</script>

<template>
  <div v-if="error && !visit" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>
  <p v-else-if="loading" class="text-sm text-muted text-center py-16">Loading site visit…</p>

  <div v-else class="max-w-[1400px] mx-auto space-y-5">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div class="flex items-start gap-3">
        <BackButton variant="icon" fallback="/site-visits" fallback-label="Back to Site Visits" />
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-1">Site Visits</p>
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="font-display text-2xl font-semibold text-foreground">{{ visit.name }}</h1>
            <StatusBadge :status="visit.status" />
          </div>
          <p class="mt-1 text-sm text-muted">{{ visit.site_location }}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          v-if="canMarkVisited"
          :disabled="statusBusy"
          class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          @click="markVisited"
        >
          <AppIcon name="checkCircle" :size="16" /> Mark Visited
        </button>
        <button
          v-if="canCancel"
          :disabled="statusBusy"
          class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 py-2 text-sm font-semibold text-negative hover:bg-negative-soft disabled:opacity-50"
          @click="confirmCancel = true"
        >
          <AppIcon name="x" :size="16" /> Cancel Visit
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-negative bg-negative-soft rounded-lg px-3 py-2">{{ error }}</p>

    <div class="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div class="space-y-5">
        <!-- Client & Site -->
        <section class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl border border-border bg-surface p-5">
            <div class="flex items-center gap-2 text-primary"><AppIcon name="users" :size="18" /><p class="text-xs font-semibold uppercase tracking-[0.14em]">Client</p></div>
            <p class="mt-4 font-semibold text-foreground">{{ visit.customer }}</p>
          </div>
          <div class="rounded-2xl border border-border bg-surface p-5">
            <div class="flex items-center gap-2 text-primary"><AppIcon name="map" :size="18" /><p class="text-xs font-semibold uppercase tracking-[0.14em]">Site</p></div>
            <p class="mt-4 font-semibold text-foreground">{{ visit.site_location }}</p>
            <p class="mt-1 text-sm text-muted">{{ visit.distance_km }} km · {{ visit.distance_tier }}</p>
          </div>
        </section>

        <!-- Inspection -->
        <section class="rounded-2xl border border-border bg-surface p-5">
          <div class="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 class="font-semibold text-foreground">Inspection</h2>
              <p class="mt-1 text-sm text-muted">Recorded once the team is on site.</p>
            </div>
            <span v-if="inspectionSaved" class="text-xs font-semibold text-positive flex items-center gap-1"><AppIcon name="check" :size="13" /> Saved</span>
          </div>
          <div class="space-y-4">
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Visit Date</span>
              <input v-model="inspection.visit_date" type="date" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Notes</span>
              <textarea
                v-model="inspection.inspection_notes"
                rows="6"
                placeholder="Observations, findings, recommendations…"
                class="w-full resize-none rounded-lg bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              ></textarea>
            </label>
          </div>
          <button
            :disabled="savingInspection"
            class="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            @click="saveInspection"
          >
            {{ savingInspection ? "Saving…" : "Save Inspection" }}
          </button>
        </section>

        <!-- Attachments -->
        <section class="rounded-2xl border border-border bg-surface p-5">
          <div class="flex items-center justify-between gap-3 mb-5">
            <div>
              <h2 class="font-semibold text-foreground">Attachments</h2>
              <p class="mt-1 text-sm text-muted">Site photos and supporting files.</p>
            </div>
            <label class="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-muted cursor-pointer">
              {{ uploading ? "Uploading…" : "Upload" }}
              <input type="file" multiple class="hidden" :disabled="uploading" @change="onFilesSelected" />
            </label>
          </div>
          <p v-if="!visit.attachments?.length" class="text-sm text-muted">No attachments yet.</p>
          <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="row in visit.attachments" :key="row.name" class="flex items-center gap-2 rounded-xl bg-background border border-border p-3">
              <AppIcon name="file" :size="16" class="text-muted shrink-0" />
              <a :href="row.attachment" target="_blank" class="flex-1 min-w-0 text-sm text-foreground truncate hover:text-primary hover:underline">{{ row.caption || row.attachment }}</a>
              <button class="text-muted hover:text-negative" @click="removeAttachment(row)"><AppIcon name="x" :size="15" /></button>
            </div>
          </div>
        </section>

        <!-- Timeline -->
        <section class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="font-semibold text-foreground">Activity Timeline</h2>
          <p v-if="!timeline.length" class="mt-3 text-sm text-muted">No activity recorded yet.</p>
          <div v-else class="mt-5 space-y-4">
            <div v-for="(event, index) in timeline" :key="index" class="flex gap-3">
              <div class="flex flex-col items-center">
                <span class="mt-1 h-3 w-3 rounded-full bg-primary ring-4 ring-primary-soft" />
                <span v-if="index < timeline.length - 1" class="mt-2 h-full w-px bg-border" />
              </div>
              <div class="pb-2">
                <p class="font-medium text-foreground" v-html="event.content" />
                <p class="text-xs text-muted">{{ formatDate(event.creation) }} · {{ event.owner }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="space-y-5">
        <section class="rounded-2xl border border-border bg-surface p-5">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Schedule</p>
          <div class="mt-4 flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><AppIcon name="calendar" :size="19" /></div>
            <div>
              <p class="font-semibold text-foreground">
                {{ visit.scheduled_date ? formatDate(visit.scheduled_date) : "Not scheduled" }}
                <span v-if="visit.slot" class="ml-1 text-xs font-semibold text-primary">· {{ visit.slot }}</span>
              </p>
              <p v-if="visit.preferred_date" class="text-sm text-muted">Preferred: {{ formatDate(visit.preferred_date) }}</p>
            </div>
          </div>
          <p v-if="visit.notes" class="mt-4 rounded-xl bg-background p-3 text-sm text-muted">{{ visit.notes }}</p>
        </section>

        <section class="rounded-2xl border border-border bg-surface p-5">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Financial Breakdown</p>
          <div class="mt-4 space-y-3 text-sm">
            <div class="flex justify-between"><span class="text-muted">Base Charge</span><span class="font-medium text-foreground">{{ formatCurrency(visit.base_charge) }}</span></div>
            <div v-if="visit.travel_expense" class="flex justify-between"><span class="text-muted">Travel Expense</span><span class="font-medium text-foreground">{{ formatCurrency(visit.travel_expense) }}</span></div>
            <div v-if="visit.food_expense" class="flex justify-between"><span class="text-muted">Food Expense</span><span class="font-medium text-foreground">{{ formatCurrency(visit.food_expense) }}</span></div>
            <div v-if="visit.accommodation_expense" class="flex justify-between"><span class="text-muted">Accommodation Expense</span><span class="font-medium text-foreground">{{ formatCurrency(visit.accommodation_expense) }}</span></div>
            <div class="flex justify-between border-t border-border pt-3"><span class="font-semibold text-foreground">Total</span><span class="font-semibold text-primary">{{ formatCurrency(visit.total_amount) }}</span></div>
          </div>

          <div v-if="!visit.sales_invoice" class="mt-4">
            <button
              :disabled="generatingInvoice"
              class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              @click="generateInvoice"
            >
              <AppIcon name="invoice" :size="15" /> {{ generatingInvoice ? "Generating…" : "Generate Invoice" }}
            </button>
          </div>

          <div v-else-if="invoiceSummary" class="mt-4 space-y-3 border-t border-border pt-4 text-sm">
            <div class="flex items-center justify-between">
              <span class="text-muted">Invoice</span>
              <span class="font-medium text-foreground">{{ invoiceSummary.name }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted">Payment Status</span>
              <StatusBadge :status="invoiceSummary.status" />
            </div>
            <div class="flex justify-between"><span class="text-muted">Paid</span><span class="font-medium text-positive">{{ formatCurrency(invoiceSummary.grand_total - invoiceSummary.outstanding_amount) }}</span></div>
            <div class="flex justify-between"><span class="text-muted">Outstanding</span><span class="font-semibold text-primary">{{ formatCurrency(invoiceSummary.outstanding_amount) }}</span></div>
            <button
              :disabled="downloadingPdf"
              class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-surface-muted disabled:opacity-50"
              @click="downloadInvoicePdf"
            >
              <AppIcon name="download" :size="15" /> {{ downloadingPdf ? "Generating…" : "Download Invoice PDF" }}
            </button>
            <p class="rounded-lg bg-info-soft px-3 py-2 text-xs text-info">Payments against this invoice are recorded in Desk, same as everywhere else in this app.</p>
          </div>
        </section>

        <section class="rounded-2xl border border-border bg-surface p-5">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Analysis</p>
          <select
            :value="visit.analysis_status"
            class="mt-4 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            @change="setAnalysisStatus($event.target.value)"
          >
            <option v-for="s in ANALYSIS_STATUSES" :key="s" :value="s">{{ s }}</option>
          </select>
          <p class="mt-3 text-xs text-muted">Full document generation/preview/share lands with the Analysis document phase.</p>
        </section>
      </aside>
    </div>

    <ConfirmDialog
      v-if="confirmCancel"
      title="Cancel this Site Visit?"
      message="This frees up the scheduled date for other visits. This can't be undone from here."
      confirm-label="Cancel Visit"
      @confirm="confirmCancelVisit"
      @cancel="confirmCancel = false"
    />
  </div>
</template>
