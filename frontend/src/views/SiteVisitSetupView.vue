<script setup>
import { ref, computed, onMounted, watch } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import { fetchCustomers } from "@/data/customers.js"
import { createSiteVisit, previewBaseCharge, checkDateAvailability, fetchSiteVisitSlots } from "@/data/site_visits.js"
import { formatCurrency } from "@/format.js"

const route = useRoute()
const router = useRouter()

// --- Client (existing vs prospect) — same pattern as Estimate Setup ---
const clientMode = ref("customer")
const customers = ref([])
const customerId = ref("")
const customerOptions = computed(() => customers.value.map((c) => ({ value: c.name, label: c.customer_name })))
const selectedCustomer = computed(() => customers.value.find((c) => c.name === customerId.value) || null)

const prospectName = ref("")
const prospectType = ref("Individual")
const prospectEmail = ref("")
const prospectMobile = ref("")
const duplicate = ref(null)

watch(clientMode, () => (duplicate.value = null))

function useDuplicateAsExisting() {
  clientMode.value = "customer"
  customerId.value = duplicate.value.existingCustomer
  duplicate.value = null
}

const slotDefs = ref([]) // configured slot definitions, independent of any date

onMounted(async () => {
  ;[customers.value, slotDefs.value] = await Promise.all([fetchCustomers(), fetchSiteVisitSlots()])
})

// --- Site & schedule ---
const siteLocation = ref("")
const distanceKm = ref(null)
const notes = ref("")
const todayIso = new Date().toISOString().slice(0, 10)
const preferredDate = ref("")
const scheduledDate = ref(typeof route.query.date === "string" ? route.query.date : "")

// Preferred date auto-fills Scheduled Date (and its availability check runs
// via the existing watch below) — still freely editable afterward.
watch(preferredDate, () => {
  if (preferredDate.value) scheduledDate.value = preferredDate.value
})

// --- Live pricing preview — same get_pricing_tier the backend uses on save ---
const pricing = ref(null)
const pricingError = ref(null)
let pricingTimer = null
watch(distanceKm, () => {
  clearTimeout(pricingTimer)
  pricing.value = null
  pricingError.value = null
  if (!distanceKm.value || distanceKm.value <= 0) return
  pricingTimer = setTimeout(async () => {
    try {
      pricing.value = await previewBaseCharge(distanceKm.value)
    } catch (e) {
      pricingError.value = e.messages?.[0] || e.message || "Failed to calculate pricing."
    }
  }, 300)
})

const travelExpense = ref(0)
const foodExpense = ref(0)
const accommodationExpense = ref(0)

const totalAmount = computed(() => {
  const base = pricing.value?.base_charge || 0
  const travel = pricing.value?.travel_food_included ? 0 : Number(travelExpense.value || 0)
  const food = pricing.value?.travel_food_included ? 0 : Number(foodExpense.value || 0)
  const accommodation = pricing.value?.accommodation_included ? 0 : Number(accommodationExpense.value || 0)
  return base + travel + food + accommodation
})

// --- Slot availability — up to one visit per slot per date, not per whole
// day (client feedback: 2 visits/day is fine as long as they're different
// slots, left to the user's own judgement whether that's practical) ---
const slot = ref("")
const slotAvailability = ref([]) // [{slot_label, start_time, end_time, available, conflicting_visit}]
const checkingAvailability = ref(false)
let availabilityTimer = null
watch(
  scheduledDate,
  () => {
    clearTimeout(availabilityTimer)
    slotAvailability.value = []
    if (!scheduledDate.value) return
    checkingAvailability.value = true
    availabilityTimer = setTimeout(async () => {
      try {
        slotAvailability.value = await checkDateAvailability(scheduledDate.value)
        // Deselect a slot that just became unavailable (e.g. date edited
        // back to one already booked in the previously-chosen slot).
        const chosen = slotAvailability.value.find((s) => s.slot_label === slot.value)
        if (chosen && !chosen.available) slot.value = ""
      } finally {
        checkingAvailability.value = false
      }
    }, 300)
  },
  { immediate: true },
)

// Time fields come back over the wire as "HH:MM:SS" — trim to "HH:MM" for display.
function formatTime(t) {
  return typeof t === "string" ? t.slice(0, 5) : t
}
const slotOptions = computed(() =>
  slotDefs.value.map((def) => {
    const av = slotAvailability.value.find((s) => s.slot_label === def.slot_label)
    return { ...def, available: av ? av.available : null, conflicting_visit: av?.conflicting_visit }
  }),
)

const canSubmit = computed(() => {
  if (!siteLocation.value.trim() || !distanceKm.value || distanceKm.value <= 0 || !scheduledDate.value || !slot.value) return false
  if (scheduledDate.value < todayIso) return false
  const chosen = slotAvailability.value.find((s) => s.slot_label === slot.value)
  if (chosen && !chosen.available) return false
  if (clientMode.value === "customer" && !customerId.value) return false
  if (clientMode.value === "prospect" && !prospectName.value.trim()) return false
  return true
})

const saving = ref(false)
const saveError = ref(null)

async function submit() {
  saving.value = true
  saveError.value = null
  duplicate.value = null
  try {
    const payload = {
      site_location: siteLocation.value.trim(),
      distance_km: distanceKm.value,
      notes: notes.value || null,
      preferred_date: preferredDate.value || null,
      scheduled_date: scheduledDate.value,
      slot: slot.value,
      travel_expense: pricing.value?.travel_food_included ? 0 : travelExpense.value || 0,
      food_expense: pricing.value?.travel_food_included ? 0 : foodExpense.value || 0,
      accommodation_expense: pricing.value?.accommodation_included ? 0 : accommodationExpense.value || 0,
    }
    if (clientMode.value === "customer") {
      payload.customer = customerId.value
    } else {
      payload.customer_name = prospectName.value.trim()
      payload.customer_type = prospectType.value
      payload.email_id = prospectEmail.value || null
      payload.mobile_no = prospectMobile.value || null
    }

    const result = await createSiteVisit(payload)
    if (result.duplicate) {
      duplicate.value = result
      return
    }
    router.push(`/site-visits/${result.name}`)
  } catch (e) {
    saveError.value = e.messages?.[0] || e.message || "Failed to create site visit."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-[1200px] mx-auto">
    <div class="flex items-center gap-3 mb-6">
      <button class="rounded-lg p-2 text-muted hover:bg-surface-muted" @click="router.back()"><AppIcon name="arrowLeft" :size="18" /></button>
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-1">Site Visits</p>
        <h1 class="font-display text-2xl font-semibold text-foreground">New Site Visit</h1>
      </div>
    </div>

    <form class="grid gap-5 lg:grid-cols-[1fr_340px]" @submit.prevent="submit">
      <div class="space-y-5">
        <!-- Client -->
        <section class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="font-semibold text-foreground mb-1">Client</h2>
          <p class="text-xs text-muted mb-5">Link to an existing customer or enter a prospect's details.</p>

          <div class="flex gap-1 p-1 bg-surface-muted rounded-lg w-fit mb-5">
            <button type="button" @click="clientMode = 'customer'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all" :class="clientMode === 'customer' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'">
              <span class="flex items-center gap-1.5"><AppIcon name="users" :size="14" /> Existing Customer</span>
            </button>
            <button type="button" @click="clientMode = 'prospect'" class="px-4 py-1.5 rounded-md text-sm font-medium transition-all" :class="clientMode === 'prospect' ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground'">
              <span class="flex items-center gap-1.5"><AppIcon name="users" :size="14" /> Prospect</span>
            </button>
          </div>

          <div v-if="clientMode === 'customer'" class="space-y-4">
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Customer <span class="text-negative">*</span></span>
              <RecordPicker v-model="customerId" :options="customerOptions" placeholder="Select customer" />
            </label>
            <div v-if="selectedCustomer" class="flex items-center gap-3 p-3.5 rounded-xl bg-primary-soft border border-primary/15">
              <div class="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                {{ selectedCustomer.customer_name.charAt(0) }}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-foreground text-sm">{{ selectedCustomer.customer_name }}</p>
                <p class="text-xs text-muted truncate">{{ selectedCustomer.customer_type }} · {{ selectedCustomer.mobile_no || "No phone on file" }}</p>
              </div>
            </div>
          </div>

          <div v-else class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">
              <label class="block">
                <span class="text-sm text-muted mb-1.5 block">Client Name <span class="text-negative">*</span></span>
                <input v-model="prospectName" type="text" placeholder="e.g. Anjali Menon" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
              <label class="block">
                <span class="text-sm text-muted mb-1.5 block">Customer Type</span>
                <select v-model="prospectType" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option>Individual</option>
                  <option>Company</option>
                  <option>Partnership</option>
                </select>
              </label>
              <label class="block">
                <span class="text-sm text-muted mb-1.5 block">Email</span>
                <input v-model="prospectEmail" type="email" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
              <label class="block">
                <span class="text-sm text-muted mb-1.5 block">Mobile</span>
                <input v-model="prospectMobile" type="text" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </label>
            </div>

            <div v-if="duplicate" class="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-warning-soft border border-warning/20 text-xs text-warning leading-relaxed">
              <span class="flex items-start gap-2"><AppIcon name="alert" :size="14" class="flex-shrink-0 mt-0.5" />{{ duplicate.message }}</span>
              <button type="button" class="shrink-0 font-semibold underline" @click="useDuplicateAsExisting">Use existing</button>
            </div>
          </div>
        </section>

        <!-- Site & schedule -->
        <section class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="font-semibold text-foreground mb-1">Site & Schedule</h2>
          <p class="text-xs text-muted mb-5">Where the visit is and when it's booked.</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="text-sm text-muted mb-1.5 block">Site Location <span class="text-negative">*</span></span>
              <input v-model="siteLocation" type="text" placeholder="e.g. Plot 14, Yelahanka New Town" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Distance (km) <span class="text-negative">*</span></span>
              <input v-model.number="distanceKm" type="number" min="0" step="0.1" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-sm text-muted mb-1.5 block">Preferred Date</span>
              <input v-model="preferredDate" type="date" :min="todayIso" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block sm:col-span-2">
              <span class="text-sm text-muted mb-1.5 block">Scheduled Date <span class="text-negative">*</span></span>
              <input v-model="scheduledDate" type="date" :min="todayIso" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <div class="block sm:col-span-2">
              <span class="text-sm text-muted mb-1.5 block">Slot <span class="text-negative">*</span></span>
              <p v-if="!scheduledDate" class="text-xs text-muted">Pick a date first to see slot availability.</p>
              <p v-else-if="checkingAvailability" class="text-xs text-muted">Checking availability…</p>
              <div v-else class="grid gap-2 sm:grid-cols-2">
                <button
                  v-for="s in slotOptions"
                  :key="s.slot_label"
                  type="button"
                  :disabled="s.available === false"
                  class="rounded-xl border p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  :class="slot === s.slot_label ? 'border-primary bg-primary-soft/60 ring-2 ring-primary/10' : 'border-border hover:bg-surface-muted'"
                  @click="slot = s.slot_label"
                >
                  <p class="font-semibold text-foreground text-sm">{{ s.slot_label }}</p>
                  <p class="text-xs text-muted">{{ formatTime(s.start_time) }} – {{ formatTime(s.end_time) }}</p>
                  <p v-if="s.available === false" class="mt-1 text-xs text-negative flex items-center gap-1">
                    <AppIcon name="alert" :size="12" /> Booked by {{ s.conflicting_visit }}
                  </p>
                </button>
              </div>
            </div>
            <label class="block sm:col-span-2">
              <span class="text-sm text-muted mb-1.5 block">Notes</span>
              <textarea v-model="notes" rows="3" class="w-full resize-none rounded-lg bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Access instructions, preparation notes…"></textarea>
            </label>
          </div>
        </section>

        <!-- Expenses -->
        <section v-if="pricing" class="rounded-2xl border border-border bg-surface p-5">
          <h2 class="font-semibold text-foreground mb-1">Additional Expenses</h2>
          <p class="text-xs text-muted mb-5">Only applicable when not already bundled into the base charge for this tier.</p>
          <div class="grid gap-4 sm:grid-cols-3">
            <label v-if="!pricing.travel_food_included" class="block">
              <span class="text-sm text-muted mb-1.5 block">Travel Expense</span>
              <input v-model.number="travelExpense" type="number" min="0" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label v-if="!pricing.travel_food_included" class="block">
              <span class="text-sm text-muted mb-1.5 block">Food Expense</span>
              <input v-model.number="foodExpense" type="number" min="0" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label v-if="!pricing.accommodation_included" class="block">
              <span class="text-sm text-muted mb-1.5 block">Accommodation Expense</span>
              <input v-model.number="accommodationExpense" type="number" min="0" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <p v-if="pricing.travel_food_included && pricing.accommodation_included" class="text-xs text-muted sm:col-span-3">
              Travel, food & accommodation are all included in the base charge for this tier — no additional expenses to enter.
            </p>
          </div>
        </section>
      </div>

      <!-- Summary -->
      <aside class="h-fit rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-5">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Visit summary</p>
        <div class="mt-5 space-y-3 text-sm">
          <p v-if="!distanceKm" class="text-xs text-muted">Enter a distance to calculate the base charge.</p>
          <p v-else-if="pricingError" class="text-xs text-negative">{{ pricingError }}</p>
          <template v-else-if="pricing">
            <div class="flex justify-between gap-4"><span class="text-muted">Tier</span><span class="font-medium text-foreground">{{ pricing.distance_tier }}</span></div>
            <div class="flex justify-between gap-4"><span class="text-muted">Base Charge</span><span class="font-medium text-foreground">{{ formatCurrency(pricing.base_charge) }}</span></div>
            <div v-if="!pricing.travel_food_included" class="flex justify-between gap-4"><span class="text-muted">Travel + Food</span><span class="font-medium text-foreground">{{ formatCurrency(Number(travelExpense || 0) + Number(foodExpense || 0)) }}</span></div>
            <div v-if="!pricing.accommodation_included" class="flex justify-between gap-4"><span class="text-muted">Accommodation</span><span class="font-medium text-foreground">{{ formatCurrency(accommodationExpense) }}</span></div>
            <div class="flex justify-between gap-4 border-t border-border pt-3"><span class="font-semibold text-foreground">Total</span><span class="font-semibold text-primary">{{ formatCurrency(totalAmount) }}</span></div>
          </template>
          <p v-else class="text-xs text-muted">Calculating…</p>
        </div>

        <p v-if="saveError" class="mt-4 text-xs text-negative">{{ saveError }}</p>

        <button type="submit" :disabled="!canSubmit || saving" class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed">
          <AppIcon name="check" :size="17" />{{ saving ? "Creating…" : "Create Site Visit" }}
        </button>
        <button type="button" class="mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold text-muted hover:bg-surface-muted" @click="router.back()">Cancel</button>
      </aside>
    </form>
  </div>
</template>
