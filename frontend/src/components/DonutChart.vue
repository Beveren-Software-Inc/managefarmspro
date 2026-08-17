<script setup>
import { computed } from "vue"
import { formatCurrency } from "@/format.js"

const props = defineProps({
  data: { type: Array, required: true }, // [{ label, value, color }]
  // "currency" (default, unchanged existing behavior) or "count" — controls
  // how the center total and each legend row's value are formatted, for
  // charts whose values are plain counts (e.g. milestones) rather than money.
  format: { type: String, default: "currency" },
  centerTopLabel: { type: String, default: "Total" },
  // Overrides what's shown in the center below centerTopLabel — for cases
  // like "67%" that aren't just the formatted sum of the slice values.
  centerValue: { type: String, default: null },
  emptyText: { type: String, default: "No invoiced amounts yet." },
})

function formatValue(v) {
  return props.format === "count" ? String(v) : formatCurrency(v)
}

const total = computed(() => props.data.reduce((t, d) => t + d.value, 0))
const radius = 60
const stroke = 22
const circumference = 2 * Math.PI * radius

const segments = computed(() => {
  if (!total.value) return []
  let offset = 0
  return props.data.map((d) => {
    const fraction = d.value / total.value
    const seg = {
      ...d,
      dash: fraction * circumference,
      gap: circumference - fraction * circumference,
      offset: -offset * circumference,
      pct: Math.round(fraction * 100),
    }
    offset += fraction
    return seg
  })
})
</script>

<template>
  <div class="flex flex-col items-center gap-6">
    <div class="relative shrink-0">
      <svg width="160" height="160" viewBox="0 0 160 160" class="-rotate-90">
        <circle cx="80" cy="80" :r="radius" fill="none" stroke="var(--color-surface-muted)" :stroke-width="stroke" />
        <circle
          v-for="(s, i) in segments"
          :key="i"
          cx="80"
          cy="80"
          :r="radius"
          fill="none"
          :stroke="s.color"
          :stroke-width="stroke"
          :stroke-dasharray="`${s.dash} ${s.gap}`"
          :stroke-dashoffset="s.offset"
          stroke-linecap="butt"
        />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <span class="text-xs text-muted">{{ centerTopLabel }}</span>
        <span class="font-display text-sm font-semibold text-foreground leading-tight break-words">{{ centerValue ?? formatValue(total) }}</span>
      </div>
    </div>

    <ul v-if="segments.length" class="flex-1 w-full space-y-3 min-w-0">
      <li v-for="(s, i) in segments" :key="i" class="flex items-center gap-2.5">
        <span class="w-3 h-3 rounded-sm shrink-0" :style="{ background: s.color }" />
        <span class="text-sm text-foreground font-medium">{{ s.label }}</span>
        <span class="text-xs text-muted tabular-nums">{{ s.pct }}%</span>
        <span class="ml-auto text-right text-sm font-semibold text-foreground tabular-nums">
          {{ formatValue(s.value) }}
        </span>
      </li>
    </ul>
    <p v-else class="text-sm text-muted">{{ emptyText }}</p>
  </div>
</template>
