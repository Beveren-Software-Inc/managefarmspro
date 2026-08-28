<script setup>
import { computed } from "vue"
import AppIcon from "@/components/AppIcon.vue"

const props = defineProps({
  label: String,
  value: String,
  icon: String,
  trend: String,
  trendUp: { type: Boolean, default: true },
  accent: { type: String, default: "primary" }, // primary | accent | info | warning
})

const tint = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
}

// Long formatted values (currency with commas/decimals, big counts) were
// overflowing past the card edge at the fixed text-3xl size — scale down
// as the string gets longer instead of letting it break out. `truncate`
// below is the last-resort safety net, not the primary fix.
const valueSizeClass = computed(() => {
  const len = (props.value || "").length
  if (len > 12) return "text-lg sm:text-xl"
  if (len > 9) return "text-xl sm:text-2xl"
  return "text-2xl sm:text-3xl"
})
</script>

<template>
  <div class="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3 overflow-hidden">
    <div class="flex items-start justify-between">
      <span class="text-sm text-muted font-medium">{{ label }}</span>
      <span class="flex items-center justify-center w-9 h-9 rounded-lg shrink-0" :class="tint[accent]">
        <AppIcon :name="icon" :size="18" />
      </span>
    </div>
    <p class="font-display font-semibold text-foreground tabular-nums truncate" :class="valueSizeClass" :title="value">{{ value }}</p>
    <p v-if="trend" class="flex items-center gap-1 text-xs font-medium" :class="trendUp ? 'text-positive' : 'text-negative'">
      <AppIcon name="trending" :size="14" />
      {{ trend }}
    </p>
  </div>
</template>
