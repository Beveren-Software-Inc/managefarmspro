<script setup>
import { computed } from "vue"
import { formatCurrency } from "@/format.js"

const props = defineProps({
  balance: { type: Number, required: true },
  budget: { type: Number, default: 0 },
  size: { type: String, default: "md" }, // sm | md | lg
})

// Health: negative = red, <20% of budget = warning, else positive
const health = computed(() => {
  if (props.balance < 0) return "negative"
  if (props.budget && props.balance < props.budget * 0.2) return "warning"
  return "positive"
})

const colorCls = computed(
  () =>
    ({
      negative: "bg-negative-soft text-negative",
      warning: "bg-warning-soft text-warning",
      positive: "bg-positive-soft text-positive",
    })[health.value],
)

const sizeCls = computed(
  () =>
    ({
      sm: "px-2 py-0.5 text-xs",
      md: "px-2.5 py-1 text-sm",
      lg: "px-3 py-1.5 text-base",
    })[props.size],
)
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full font-semibold tabular-nums"
    :class="[colorCls, sizeCls]"
  >
    {{ formatCurrency(balance) }}
  </span>
</template>
