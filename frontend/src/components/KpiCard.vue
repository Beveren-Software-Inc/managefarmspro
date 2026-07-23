<script setup>
import AppIcon from "@/components/AppIcon.vue"

defineProps({
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
</script>

<template>
  <div class="bg-surface border border-border rounded-xl p-5 flex flex-col gap-3">
    <div class="flex items-start justify-between">
      <span class="text-sm text-muted font-medium">{{ label }}</span>
      <span class="flex items-center justify-center w-9 h-9 rounded-lg" :class="tint[accent]">
        <AppIcon :name="icon" :size="18" />
      </span>
    </div>
    <p class="font-display text-2xl sm:text-3xl font-semibold text-foreground tabular-nums">{{ value }}</p>
    <p v-if="trend" class="flex items-center gap-1 text-xs font-medium" :class="trendUp ? 'text-positive' : 'text-negative'">
      <AppIcon name="trending" :size="14" />
      {{ trend }}
    </p>
  </div>
</template>
