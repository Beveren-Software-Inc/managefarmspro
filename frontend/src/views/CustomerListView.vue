<script setup>
import { ref, reactive, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import { fetchCustomers, createCustomer } from "@/data/customers.js"
import { formatDate } from "@/format.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const customers = ref([])

onMounted(async () => {
  try {
    customers.value = await fetchCustomers()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load clients."
  } finally {
    loading.value = false
  }
})

const showAddCustomer = ref(false)
const creatingCustomer = ref(false)
const createError = ref(null)

// A short, common list, not an exhaustive ISO country list — this app's
// customer base is India-first (Territory defaults to India, currency ₹),
// +91 is the default, others selectable when needed.
const COUNTRY_CODES = ["+91", "+1", "+44", "+61", "+65", "+971", "+974", "+966", "+27", "+94"]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function blankCustomer() {
  return {
    customer_name: "",
    customer_type: "Company",
    phone_code: "+91",
    phone_number: "",
    customer_email: "",
    customer_since: todayISO(),
    is_active: true,
    is_internal_customer: false,
    partners: [],
  }
}
const newCustomer = reactive(blankCustomer())

function openAddCustomer() {
  Object.assign(newCustomer, blankCustomer())
  createError.value = null
  showAddCustomer.value = true
}

function addPartnerRow() {
  newCustomer.partners.push({ partner_name: "", phone_code: "+91", phone_number: "", email: "" })
}
function removePartnerRow(idx) {
  newCustomer.partners.splice(idx, 1)
}

async function submitNewCustomer() {
  if (!newCustomer.customer_name.trim()) return
  creatingCustomer.value = true
  createError.value = null
  try {
    const created = await createCustomer({
      ...newCustomer,
      customer_phone: newCustomer.phone_number.trim() ? `${newCustomer.phone_code}-${newCustomer.phone_number.trim()}` : "",
      partners: newCustomer.partners.map((p) => ({
        partner_name: p.partner_name,
        email: p.email,
        phone_number: p.phone_number.trim() ? `${p.phone_code}-${p.phone_number.trim()}` : "",
      })),
    })
    showAddCustomer.value = false
    router.push(`/owners/${created.name}`)
  } catch (e) {
    createError.value = e.messages?.[0] || e.message || "Failed to create this client."
  } finally {
    creatingCustomer.value = false
  }
}

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
      <p class="text-sm text-muted lg:pb-2.5">{{ loading ? "Loading…" : `${filtered.length} clients` }}</p>
      <div class="lg:ml-auto flex flex-wrap items-end gap-3">
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">Search</span>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="17" /></span>
            <input
              v-model="query"
              type="search"
              placeholder="Search clients…"
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
        <button
          class="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors"
          @click="openAddCustomer"
        >
          <AppIcon name="plus" :size="17" /> Add Client
        </button>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading clients…</p>
    <p v-else-if="!filtered.length" class="text-sm text-muted text-center py-16">No clients match these filters.</p>

    <template v-else>
      <!-- Table on desktop -->
      <div class="hidden md:block bg-surface border border-border rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-border bg-surface-muted/50">
              <th class="font-medium px-5 py-3">Client</th>
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

    <div v-if="showAddCustomer" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50" @click.self="showAddCustomer = false">
      <div class="bg-surface rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="p-6 space-y-4">
          <div class="flex items-center gap-2.5">
            <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-soft text-primary shrink-0">
              <AppIcon name="users" :size="18" />
            </span>
            <h3 class="font-display text-lg font-semibold text-foreground">Add Client</h3>
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <label class="block sm:col-span-2">
              <span class="text-xs text-muted mb-1 block">Client Name *</span>
              <input v-model="newCustomer.customer_name" type="text" placeholder="e.g. Aashish Kumar" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Client Phone</span>
              <div class="flex gap-1.5">
                <select v-model="newCustomer.phone_code" class="w-20 px-2 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option v-for="code in COUNTRY_CODES" :key="code">{{ code }}</option>
                </select>
                <input v-model="newCustomer.phone_number" type="text" placeholder="9876543210" class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Client Email</span>
              <input v-model="newCustomer.customer_email" type="email" placeholder="name@example.com" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Client Type *</span>
              <select v-model="newCustomer.customer_type" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option>Company</option>
                <option>Individual</option>
                <option>Partnership</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Client Since</span>
              <input v-model="newCustomer.customer_since" type="date" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="flex items-center gap-2 text-sm text-foreground cursor-pointer sm:col-span-2">
              <input type="checkbox" v-model="newCustomer.is_active" class="rounded border-border" />
              Is Active?
            </label>
          </div>

          <div class="pt-1 border-t border-border">
            <label class="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer pt-3">
              <input type="checkbox" v-model="newCustomer.is_internal_customer" class="rounded border-border" />
              Is Internal Client
            </label>
          </div>

          <!-- Desk only shows the Partners tab when Type = Partnership (client script: "conditionally show or hide the Partners tab") -->
          <div v-if="newCustomer.customer_type === 'Partnership'" class="pt-1 border-t border-border space-y-2">
            <div class="flex items-center justify-between pt-3">
              <p class="text-sm font-medium text-foreground">Partners</p>
              <button type="button" class="text-xs font-medium text-primary hover:underline" @click="addPartnerRow">+ Add Partner</button>
            </div>
            <div v-for="(p, idx) in newCustomer.partners" :key="idx" class="grid grid-cols-[1fr_auto_1fr_1fr_auto] gap-2 items-center">
              <input v-model="p.partner_name" type="text" placeholder="Partner name" class="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <select v-model="p.phone_code" class="w-20 px-2 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option v-for="code in COUNTRY_CODES" :key="code">{{ code }}</option>
              </select>
              <input v-model="p.phone_number" type="text" placeholder="9876543210" class="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input v-model="p.email" type="email" placeholder="Email" class="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button type="button" class="p-2 text-muted hover:text-negative" @click="removePartnerRow(idx)"><AppIcon name="x" :size="15" /></button>
            </div>
            <p v-if="!newCustomer.partners.length" class="text-xs text-muted">No partners added.</p>
          </div>

          <p v-if="createError" class="text-sm text-negative bg-negative-soft rounded-lg p-3">{{ createError }}</p>
        </div>
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button class="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="showAddCustomer = false">Cancel</button>
          <button
            class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-60"
            :disabled="creatingCustomer || !newCustomer.customer_name.trim()"
            @click="submitNewCustomer"
          >
            {{ creatingCustomer ? "Creating…" : "Create Client" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
