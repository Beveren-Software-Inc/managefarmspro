<script setup>
import { ref, watch, onMounted } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import { fetchInvoiceHistory, fetchInvoicePdfUrls, INVOICE_PAGE_SIZE } from "@/data/invoices.js"
import { formatCurrency, formatDate } from "@/format.js"

const search = ref("")
const status = ref("")
const statusOptions = ["Overdue", "Paid", "Unpaid"]

const invoices = ref([])
const pdfUrls = ref({})
const loading = ref(true)
const loadingMore = ref(false)
const error = ref(null)
const hasMore = ref(true)

async function loadPage(reset) {
  const limitStart = reset ? 0 : invoices.value.length
  try {
    const rows = await fetchInvoiceHistory({ search: search.value, status: status.value, limitStart })
    const urls = await fetchInvoicePdfUrls(rows.map((r) => r.name))
    invoices.value = reset ? rows : [...invoices.value, ...rows]
    pdfUrls.value = { ...pdfUrls.value, ...urls }
    hasMore.value = rows.length === INVOICE_PAGE_SIZE
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load invoices."
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

let searchTimer = null
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadPage(true), 300)
})
watch(status, () => loadPage(true))
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h2 class="font-display text-2xl font-semibold text-foreground">Invoice History</h2>
        <p class="text-sm text-muted mt-1">Sales invoices generated from plot works.</p>
      </div>
      <router-link
        to="/invoices/generate"
        class="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover"
      >
        <AppIcon name="invoice" :size="17" /> Generate Invoice
      </router-link>
    </div>

    <div class="flex flex-col sm:flex-row sm:items-end gap-3">
      <label class="block flex-1 sm:max-w-xs">
        <span class="text-xs text-muted mb-1.5 block">Search</span>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="17" /></span>
          <input
            v-model="search"
            type="search"
            placeholder="Invoice, plot or customer…"
            class="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </label>
      <label class="block w-full sm:w-48">
        <span class="text-xs text-muted mb-1.5 block">Filter by Status</span>
        <FilterCombobox v-model="status" :options="statusOptions" placeholder="All statuses" />
      </label>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading invoices…</p>
    <p v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</p>
    <p v-else-if="!invoices.length" class="text-sm text-muted text-center py-16 bg-surface border border-border rounded-xl">
      No invoices match these filters.
    </p>

    <div v-else class="bg-surface border border-border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
            <th class="font-medium px-5 py-3">Invoice</th>
            <th class="font-medium px-5 py-3">Plot</th>
            <th class="font-medium px-5 py-3">Customer</th>
            <th class="font-medium px-5 py-3">Posting Date</th>
            <th class="font-medium px-5 py-3">Status</th>
            <th class="font-medium px-5 py-3 text-right">Grand Total</th>
            <th class="font-medium px-5 py-3 text-right">PDF</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="inv in invoices" :key="inv.name" class="hover:bg-surface-muted/60">
            <td class="px-5 py-3.5 font-medium text-foreground">{{ inv.name }}</td>
            <td class="px-5 py-3.5">
              <router-link :to="`/plots/${inv.plot}`" class="text-primary hover:underline">{{ inv.plot }}</router-link>
            </td>
            <td class="px-5 py-3.5 text-muted">{{ inv.customer }}</td>
            <td class="px-5 py-3.5 text-muted">{{ formatDate(inv.posting_date) }}</td>
            <td class="px-5 py-3.5"><StatusBadge :status="inv.status" /></td>
            <td class="px-5 py-3.5 text-right font-medium text-foreground tabular-nums">{{ formatCurrency(inv.grand_total) }}</td>
            <td class="px-5 py-3.5 text-right">
              <a
                v-if="pdfUrls[inv.name]"
                :href="pdfUrls[inv.name]"
                target="_blank"
                class="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <AppIcon name="download" :size="15" /> PDF
              </a>
              <span v-else class="text-muted">—</span>
            </td>
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
