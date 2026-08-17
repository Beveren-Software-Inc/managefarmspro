<script setup>
import { ref } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import { downloadUpcomingSiteVisitsPdf } from "@/data/site_visits.js"

const emit = defineEmits(["close"])

function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const today = new Date()
const todayIso = localIso(today)
const dateFrom = ref(todayIso)
const dateTo = ref(localIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)))

const downloading = ref(false)
const error = ref(null)

async function download() {
  downloading.value = true
  error.value = null
  try {
    const url = await downloadUpcomingSiteVisitsPdf(dateFrom.value, dateTo.value)
    window.open(url, "_blank")
    emit("close")
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to generate the report."
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50" @click.self="emit('close')">
    <div class="bg-surface rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-display text-lg font-semibold text-foreground">Download Site Visits Report</h3>
        <button class="rounded-lg p-1.5 text-muted hover:bg-surface-muted" @click="emit('close')"><AppIcon name="x" :size="17" /></button>
      </div>
      <p class="text-sm text-muted">PDF of Scheduled site visits between two dates.</p>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">From</span>
          <input v-model="dateFrom" type="date" :min="todayIso" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label class="block">
          <span class="text-xs text-muted mb-1.5 block">To</span>
          <input v-model="dateTo" type="date" :min="dateFrom || todayIso" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
      </div>

      <p v-if="error" class="text-xs text-negative">{{ error }}</p>

      <button
        :disabled="downloading || !dateFrom || !dateTo || dateTo < dateFrom"
        class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        @click="download"
      >
        <AppIcon name="download" :size="16" /> {{ downloading ? "Generating…" : "Download PDF" }}
      </button>
    </div>
  </div>
</template>
