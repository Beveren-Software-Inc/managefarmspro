<script setup>
import { ref, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import BalancePill from "@/components/BalancePill.vue"
import LineItemsTable from "@/components/LineItemsTable.vue"
import { fetchWork, workStatus, laborLines, equipmentLines, materialLines } from "@/data/works.js"
import { fetchPlotDetail, plotBalance } from "@/data/plots.js"
import { formatCurrency, formatDate } from "@/format.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const work = ref(null)
const plot = ref(null)

onMounted(async () => {
  try {
    work.value = await fetchWork(route.params.id)
    plot.value = await fetchPlotDetail(work.value.plot)
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this work."
  } finally {
    loading.value = false
  }
})

const labor = computed(() => (work.value ? laborLines(work.value) : []))
const equipment = computed(() => (work.value ? equipmentLines(work.value) : []))
const material = computed(() => (work.value ? materialLines(work.value) : []))

function categoryTotal(items) {
  return items.reduce((t, i) => t + (i.total || 0), 0)
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else-if="work" class="space-y-6">
    <button class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground" @click="router.push('/works')">
      <AppIcon name="arrowLeft" :size="16" /> Back to Works
    </button>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-start gap-4">
      <div>
        <div class="flex items-center gap-3 flex-wrap">
          <h2 class="font-display text-2xl font-semibold text-foreground">{{ work.work_type_name }}</h2>
          <StatusBadge :status="workStatus(work.docstatus)" />
        </div>
        <p class="text-sm text-muted mt-1">
          {{ work.name }} · {{ formatDate(work.work_date) }} ·
          <router-link :to="`/plots/${work.plot}`" class="text-primary hover:underline">{{ work.plot }}</router-link>
        </p>
      </div>
      <div class="sm:ml-auto text-left sm:text-right">
        <p class="text-xs text-muted">Total Cost</p>
        <p class="font-display text-2xl font-bold text-foreground tabular-nums">{{ formatCurrency(work.total_cost) }}</p>
      </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-4">
        <div v-if="work.description" class="bg-surface border border-border rounded-xl p-5">
          <h4 class="font-medium text-foreground mb-1">Description</h4>
          <p class="text-sm text-muted leading-relaxed">{{ work.description }}</p>
        </div>
        <LineItemsTable title="Labor" icon="users" :items="labor" />
        <LineItemsTable title="Equipment" icon="work" :items="equipment" />
        <LineItemsTable title="Material" icon="layers" :items="material" />
      </div>

      <!-- Context sidebar -->
      <div class="space-y-4">
        <div v-if="plot" class="bg-surface border border-border rounded-xl p-5">
          <h4 class="font-medium text-foreground mb-3">Plot Context</h4>
          <dl class="text-sm divide-y divide-border">
            <div class="flex justify-between py-2.5"><dt class="text-muted">Plot</dt><dd class="text-foreground">{{ plot.plot_name }}</dd></div>
            <div class="flex justify-between py-2.5"><dt class="text-muted">Customer</dt><dd class="text-foreground text-right">{{ plot.customer_name }}</dd></div>
            <div class="flex justify-between py-2.5"><dt class="text-muted">Monthly Budget</dt><dd class="text-foreground tabular-nums">{{ formatCurrency(plot.monthly_maintenance_budget) }}</dd></div>
            <div class="flex justify-between py-2.5 items-center"><dt class="text-muted">Maintenance Balance</dt><dd><BalancePill :balance="plotBalance(plot)" :budget="plot.monthly_maintenance_budget" size="sm" /></dd></div>
          </dl>
        </div>
        <div class="bg-primary text-primary-foreground rounded-xl p-5">
          <p class="text-sm text-primary-foreground/70">Work Total</p>
          <p class="font-display text-3xl font-bold mt-1 tabular-nums">{{ formatCurrency(work.total_cost) }}</p>
          <div class="mt-4 space-y-1.5 text-sm text-primary-foreground/80">
            <div class="flex justify-between"><span>Labor</span><span class="tabular-nums">{{ formatCurrency(categoryTotal(labor)) }}</span></div>
            <div class="flex justify-between"><span>Equipment</span><span class="tabular-nums">{{ formatCurrency(categoryTotal(equipment)) }}</span></div>
            <div class="flex justify-between"><span>Material</span><span class="tabular-nums">{{ formatCurrency(categoryTotal(material)) }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="text-center py-20 text-muted">Work not found.</div>
</template>
