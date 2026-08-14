<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import BalancePill from "@/components/BalancePill.vue"
import TabNav from "@/components/TabNav.vue"
import AddPlotDialog from "@/components/AddPlotDialog.vue"
import { fetchCustomer } from "@/data/customers.js"
import { fetchPlotsForCustomer, plotBalance } from "@/data/plots.js"
import { fetchInvoicesForCustomer, fetchInvoicePdfUrls } from "@/data/invoices.js"
import { fetchEstimatesForCustomer, areaLabel } from "@/data/estimates.js"
import { formatCurrency, formatDate } from "@/format.js"
import { isSystemManager } from "@/session.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const customer = ref(null)
const plots = ref([])
const invoices = ref([])
const estimates = ref([])
const pdfUrls = ref({})

onMounted(async () => {
  try {
    ;[customer.value, plots.value, invoices.value, estimates.value] = await Promise.all([
      fetchCustomer(route.params.id),
      fetchPlotsForCustomer(route.params.id),
      fetchInvoicesForCustomer(route.params.id),
      fetchEstimatesForCustomer(route.params.id),
    ])
    pdfUrls.value = await fetchInvoicePdfUrls(invoices.value.map((i) => i.name))
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this customer."
  } finally {
    loading.value = false
  }
})

function initials(name) {
  return (name || "").split(" ").map((w) => w[0]).slice(0, 2).join("")
}

const tab = ref("basic")
const tabs = computed(() => [
  { key: "basic", label: "Basic Info" },
  { key: "plots", label: `Plots (${plots.value.length})` },
  { key: "invoices", label: `Invoices (${invoices.value.length})` },
  { key: "estimates", label: `Estimates (${estimates.value.length})` },
])

const totalBudget = computed(() => plots.value.reduce((t, p) => t + (p.monthly_maintenance_budget || 0), 0))
const totalBalance = computed(() => plots.value.reduce((t, p) => t + plotBalance(p), 0))

// Plot's own doctype permissions restrict create to System Manager (plot.json).
const canAddPlot = isSystemManager()
const showAddPlot = ref(false)

function onPlotCreated(created) {
  showAddPlot.value = false
  router.push(`/plots/${created.name}`)
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else-if="customer" class="space-y-6">
    <div
      :class="
        tab === 'invoices'
          ? 'sticky top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-6 pb-4 bg-background border-b border-border space-y-6'
          : 'space-y-6'
      "
    >
      <button class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground" @click="router.push('/owners')">
        <AppIcon name="arrowLeft" :size="16" /> Back to Customers
      </button>

      <!-- Header -->
      <div class="bg-surface border border-border rounded-xl p-6">
        <div class="flex flex-col sm:flex-row sm:items-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-semibold font-display shrink-0">
            {{ initials(customer.customer_name) }}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-3 flex-wrap">
              <h2 class="font-display text-2xl font-semibold text-foreground">{{ customer.customer_name }}</h2>
              <StatusBadge :status="customer.disabled ? 'Inactive' : 'Active'" />
            </div>
            <p class="text-sm text-muted mt-1">{{ customer.customer_type }} · {{ customer.name }} · Customer since {{ formatDate(customer.creation) }}</p>
          </div>
          <div class="sm:ml-auto grid grid-cols-2 gap-4 sm:text-right">
            <div>
              <p class="text-xs text-muted">Total Monthly Budget</p>
              <p class="font-display text-lg font-semibold text-foreground">{{ formatCurrency(totalBudget) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Total Balance</p>
              <BalancePill :balance="totalBalance" :budget="totalBudget" size="md" />
            </div>
          </div>
        </div>
      </div>

      <TabNav v-model="tab" :tabs="tabs" />
    </div>

    <!-- Basic Info -->
    <div v-if="tab === 'basic'" class="grid sm:grid-cols-2 gap-4">
      <div class="bg-surface border border-border rounded-xl p-5 space-y-4">
        <h3 class="font-medium text-foreground">Contact Details</h3>
        <div class="flex items-center gap-3 text-sm">
          <span class="text-muted"><AppIcon name="phone" :size="18" /></span>
          <span class="text-foreground">{{ customer.mobile_no || "Not on file" }}</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <span class="text-muted"><AppIcon name="mail" :size="18" /></span>
          <span class="text-foreground">{{ customer.email_id || "Not on file" }}</span>
        </div>
      </div>
      <div class="bg-surface border border-border rounded-xl p-5 space-y-3">
        <h3 class="font-medium text-foreground">Account</h3>
        <dl class="text-sm divide-y divide-border">
          <div class="flex justify-between py-2"><dt class="text-muted">Customer Type</dt><dd class="text-foreground">{{ customer.customer_type }}</dd></div>
          <div class="flex justify-between py-2"><dt class="text-muted">Customer Since</dt><dd class="text-foreground">{{ formatDate(customer.creation) }}</dd></div>
          <div class="flex justify-between py-2"><dt class="text-muted">Linked Plots</dt><dd class="text-foreground">{{ plots.length }}</dd></div>
          <div class="flex justify-between py-2 items-center"><dt class="text-muted">Status</dt><dd><StatusBadge :status="customer.disabled ? 'Inactive' : 'Active'" /></dd></div>
        </dl>
      </div>
    </div>

    <!-- Plots -->
    <div v-else-if="tab === 'plots'" class="space-y-3">
      <div v-if="canAddPlot" class="flex justify-end">
        <button
          class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
          @click="showAddPlot = true"
        >
          <AppIcon name="plus" :size="17" /> Add Plot
        </button>
      </div>
      <p v-if="!plots.length" class="text-center py-16 text-muted bg-surface border border-border rounded-xl">
        No plots linked to this customer.
      </p>
      <button
        v-for="p in plots"
        :key="p.name"
        class="w-full text-left bg-surface border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/40"
        @click="router.push(`/plots/${p.name}`)"
      >
        <div class="w-10 h-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
          <AppIcon name="plot" :size="19" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-foreground truncate">{{ p.plot_name }}</p>
          <p class="text-xs text-muted">{{ p.cluster }} · {{ p.area }} {{ p.units }} <span v-if="p.plot_location">· {{ p.plot_location }}</span></p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-muted mb-1">Balance</p>
          <BalancePill :balance="plotBalance(p)" :budget="p.monthly_maintenance_budget" size="sm" />
        </div>
        <span class="text-muted"><AppIcon name="chevronRight" :size="18" /></span>
      </button>
    </div>

    <!-- Invoices -->
    <div v-else-if="tab === 'invoices'">
      <p v-if="!invoices.length" class="text-center py-16 text-muted bg-surface border border-border rounded-xl">
        No invoices generated for this customer yet.
      </p>
      <div v-else class="bg-surface border border-border rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
              <th class="font-medium px-5 py-3">Invoice</th>
              <th class="font-medium px-5 py-3">Plot</th>
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
    </div>
    <!-- Estimates -->
    <div v-else-if="tab === 'estimates'" class="space-y-3">
      <p v-if="!estimates.length" class="text-center py-16 text-muted bg-surface border border-border rounded-xl">
        No estimates linked to this customer yet.
      </p>
      <button
        v-for="e in estimates"
        :key="e.name"
        class="w-full text-left bg-surface border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/40"
        @click="router.push(`/estimates/${e.name}`)"
      >
        <div class="w-10 h-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center shrink-0">
          <AppIcon name="file" :size="19" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-foreground truncate">{{ e.name }}</p>
          <p class="text-xs text-muted">{{ e.category }} · {{ areaLabel(e) }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-xs text-muted mb-1">Grand Total</p>
          <p class="font-medium text-foreground tabular-nums">{{ formatCurrency(e.grand_total) }}</p>
        </div>
        <StatusBadge :status="e.statusLabel" />
        <span class="text-muted"><AppIcon name="chevronRight" :size="18" /></span>
      </button>
    </div>

    <AddPlotDialog
      v-if="showAddPlot"
      :preset-customer="customer.name"
      :preset-customer-label="customer.customer_name"
      @close="showAddPlot = false"
      @created="onPlotCreated"
    />
  </div>

  <div v-else class="text-center py-20 text-muted">Customer not found.</div>
</template>
