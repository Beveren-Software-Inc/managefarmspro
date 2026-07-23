<script setup>
import { computed } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import { formatCurrency } from "@/format.js"

const props = defineProps({
  title: String,
  icon: String,
  items: { type: Array, required: true }, // [{ description, qty, unit, price, total }]
})

const subtotal = computed(() => props.items.reduce((t, i) => t + (i.total || 0), 0))
</script>

<template>
  <div class="bg-surface border border-border rounded-xl overflow-hidden">
    <div class="flex items-center gap-2 px-5 py-3 border-b border-border bg-surface-muted/40">
      <span class="text-primary"><AppIcon :name="icon" :size="17" /></span>
      <h4 class="font-medium text-foreground">{{ title }}</h4>
      <span class="ml-auto text-sm font-semibold text-foreground tabular-nums">{{ formatCurrency(subtotal) }}</span>
    </div>
    <div v-if="items.length" class="overflow-x-auto">
      <table class="w-full text-sm min-w-[520px]">
        <thead>
          <tr class="text-left text-muted border-b border-border">
            <th class="font-normal px-5 py-2.5">Description</th>
            <th class="font-normal px-5 py-2.5 text-right">Qty</th>
            <th class="font-normal px-5 py-2.5">Unit</th>
            <th class="font-normal px-5 py-2.5 text-right">Unit Price</th>
            <th class="font-normal px-5 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="(item, i) in items" :key="i">
            <td class="px-5 py-2.5 text-foreground">{{ item.description }}</td>
            <td class="px-5 py-2.5 text-right text-muted tabular-nums">{{ item.qty }}</td>
            <td class="px-5 py-2.5 text-muted">{{ item.unit }}</td>
            <td class="px-5 py-2.5 text-right text-muted tabular-nums">{{ formatCurrency(item.price) }}</td>
            <td class="px-5 py-2.5 text-right font-medium text-foreground tabular-nums">{{ formatCurrency(item.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="px-5 py-4 text-sm text-muted">No {{ title.toLowerCase() }} items recorded.</p>
  </div>
</template>
