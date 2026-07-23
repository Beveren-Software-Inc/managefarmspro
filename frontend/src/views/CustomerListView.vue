<script setup>
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import { fetchCustomers } from "@/data/customers.js"
import { formatDate } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const customers = ref([])

onMounted(async () => {
  try {
    customers.value = await fetchCustomers()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load customers."
  } finally {
    loading.value = false
  }
})

function initials(name) {
  return (name || "").split(" ").map((w) => w[0]).slice(0, 2).join("")
}

const query = ref("")
const typeFilter = ref("")
const statusFilter = ref("")
const typeOptions = computed(() => [...new Set(customers.value.map((c) => c.customer_type).filter(Boolean))].sort())

const filtered = computed(() =>
  customers.value.filter((c) => {
    const q = query.value.toLowerCase()
    const matchQ =
      !q ||
      c.customer_name?.toLowerCase().includes(q) ||
      c.email_id?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q)
    const matchType = !typeFilter.value || c.customer_type === typeFilter.value
    const matchStatus = !statusFilter.value || (statusFilter.value === "Active" ? !c.disabled : !!c.disabled)
    return matchQ && matchType && matchStatus
  }),
)
</script>

<template>
  <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="space-y-5">
    <div class="sticky top-16 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur border-b border-border flex flex-col lg:flex-row lg:items-end gap-3">
      <p class="text-sm text-muted lg:pb-2.5">{{ loading ? "Loading…" : `${filtered.length} customers` }}</p>
      <div class="lg:ml-auto flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">Search</span>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="17" /></span>
            <input
              v-model="query"
              type="search"
              placeholder="Search customers…"
              class="w-full sm:w-56 pl-9 pr-3 py-2.5 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </label>
        <label class="block w-full sm:w-44">
          <span class="text-xs text-muted mb-1.5 block">Filter by Type</span>
          <FilterCombobox v-model="typeFilter" :options="typeOptions" placeholder="All types" />
        </label>
        <label class="block w-full sm:w-40">
          <span class="text-xs text-muted mb-1.5 block">Filter by Status</span>
          <FilterCombobox v-model="statusFilter" :options="['Active', 'Inactive']" placeholder="All statuses" />
        </label>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading customers…</p>
    <p v-else-if="!filtered.length" class="text-sm text-muted text-center py-16">No customers match these filters.</p>

    <template v-else>
      <!-- Table on desktop -->
      <div class="hidden md:block bg-surface border border-border rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
              <th class="font-medium px-5 py-3">Customer</th>
              <th class="font-medium px-5 py-3">Type</th>
              <th class="font-medium px-5 py-3">Contact</th>
              <th class="font-medium px-5 py-3">Plots</th>
              <th class="font-medium px-5 py-3">Since</th>
              <th class="font-medium px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="c in filtered"
              :key="c.name"
              class="hover:bg-surface-muted/60 cursor-pointer"
              @click="router.push(`/owners/${c.name}`)"
            >
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                    {{ initials(c.customer_name) }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-foreground truncate">{{ c.customer_name }}</p>
                    <p class="text-xs text-muted">{{ c.name }}</p>
                  </div>
                </div>
              </td>
              <td class="px-5 py-3.5 text-muted">{{ c.customer_type }}</td>
              <td class="px-5 py-3.5">
                <p class="text-foreground">{{ c.mobile_no || "—" }}</p>
                <p class="text-xs text-muted truncate max-w-48">{{ c.email_id || "—" }}</p>
              </td>
              <td class="px-5 py-3.5 text-foreground tabular-nums">{{ c.plot_count }}</td>
              <td class="px-5 py-3.5 text-muted">{{ formatDate(c.creation) }}</td>
              <td class="px-5 py-3.5"><StatusBadge :status="c.disabled ? 'Inactive' : 'Active'" /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cards on mobile -->
      <div class="md:hidden space-y-3">
        <button
          v-for="c in filtered"
          :key="c.name"
          class="w-full text-left bg-surface border border-border rounded-xl p-4"
          @click="router.push(`/owners/${c.name}`)"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-primary-soft text-primary flex items-center justify-center text-sm font-semibold">
              {{ initials(c.customer_name) }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-medium text-foreground truncate">{{ c.customer_name }}</p>
              <p class="text-xs text-muted">{{ c.customer_type }} · {{ c.plot_count }} plots</p>
            </div>
            <StatusBadge :status="c.disabled ? 'Inactive' : 'Active'" />
          </div>
        </button>
      </div>
    </template>
  </div>
</template>
