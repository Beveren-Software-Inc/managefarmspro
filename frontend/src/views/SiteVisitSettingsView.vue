<script setup>
import { ref, onMounted } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import { fetchSiteVisitSettings, saveSiteVisitSettings } from "@/data/site_visits.js"
import { formatCurrency } from "@/format.js"

const loading = ref(true)
const error = ref(null)
const settings = ref(null)

onMounted(async () => {
  try {
    settings.value = await fetchSiteVisitSettings()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load pricing settings."
  } finally {
    loading.value = false
  }
})

function addTier() {
  settings.value.pricing_tiers.push({
    tier_label: "",
    max_distance_km: 0,
    base_charge: 0,
    travel_food_included: 0,
    accommodation_included: 0,
  })
}
function removeTier(index) {
  settings.value.pricing_tiers.splice(index, 1)
}

const saving = ref(false)
const saved = ref(false)
async function save() {
  saving.value = true
  error.value = null
  try {
    settings.value = await saveSiteVisitSettings(settings.value)
    saved.value = true
    setTimeout(() => (saved.value = false), 1800)
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to save pricing settings."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="max-w-[1100px] mx-auto space-y-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary mb-2">Site Visits / Admin</p>
        <h1 class="font-display text-2xl font-semibold text-foreground">Site Visit Pricing</h1>
        <p class="text-sm text-muted mt-1">Distance-based tiers used to calculate every Site Visit's base charge.</p>
      </div>
      <button v-if="settings" :disabled="saving" class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50" @click="save">
        <AppIcon name="check" :size="16" /> {{ saving ? "Saving…" : saved ? "Saved" : "Save changes" }}
      </button>
    </div>

    <div v-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>
    <p v-else-if="loading" class="text-sm text-muted text-center py-16">Loading…</p>

    <div v-else class="space-y-4">
      <p class="text-xs text-muted bg-info-soft text-info rounded-lg px-3 py-2">
        Evaluated by Max Distance ascending — the first tier a visit's distance fits under wins. Leave Max Distance at 0 to mark a tier as unbounded (use this for the highest tier only).
      </p>

      <section v-for="(tier, index) in settings.pricing_tiers" :key="index" class="rounded-2xl border border-border bg-surface p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="grid gap-4 flex-1 md:grid-cols-[1fr_160px_160px]">
            <label class="text-sm font-medium text-foreground">
              Tier Label
              <input v-model="tier.tier_label" class="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
            </label>
            <label class="text-sm font-medium text-foreground">
              Max Distance (km)
              <input v-model.number="tier.max_distance_km" type="number" min="0" class="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
            </label>
            <label class="text-sm font-medium text-foreground">
              Base Charge
              <input v-model.number="tier.base_charge" type="number" min="0" class="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
            </label>
          </div>
          <button class="rounded-lg p-2 text-muted hover:bg-negative-soft hover:text-negative" @click="removeTier(index)"><AppIcon name="trash" :size="16" /></button>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-5 text-sm">
          <label class="flex items-center gap-2 text-foreground">
            <input v-model="tier.travel_food_included" type="checkbox" true-value="1" false-value="0" class="h-4 w-4 accent-primary" />
            Travel & food included in base charge
          </label>
          <label class="flex items-center gap-2 text-foreground">
            <input v-model="tier.accommodation_included" type="checkbox" true-value="1" false-value="0" class="h-4 w-4 accent-primary" />
            Accommodation included in base charge
          </label>
          <span class="ml-auto rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary text-xs">{{ formatCurrency(tier.base_charge) }}</span>
        </div>
      </section>

      <button class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted hover:border-primary/40 hover:text-primary" @click="addTier">
        <AppIcon name="plus" :size="16" /> Add Tier
      </button>
    </div>
  </div>
</template>
