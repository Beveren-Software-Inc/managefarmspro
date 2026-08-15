<script setup>
import { computed } from "vue"

const props = defineProps({
  status: { type: String, required: true },
})

const styleMap = {
  // Work statuses
  Submitted: "bg-positive-soft text-positive",
  Draft: "bg-info-soft text-info",
  Cancelled: "bg-negative-soft text-negative",
  // Invoice statuses
  Paid: "bg-positive-soft text-positive",
  Unpaid: "bg-warning-soft text-warning",
  "Partly Paid": "bg-warning-soft text-warning",
  Overdue: "bg-negative-soft text-negative",
  // Site Visit statuses
  Scheduled: "bg-info-soft text-info",
  Visited: "bg-warning-soft text-warning",
  // Plot statuses
  Active: "bg-positive-soft text-positive",
  Inactive: "bg-surface-muted text-muted",
  "Under Maintenance": "bg-warning-soft text-warning",
  "Under Development": "bg-info-soft text-info",
  // Farm Project statuses (Active shared with Plot above)
  Completed: "bg-positive-soft text-positive",
  // Farm Project Task statuses
  Open: "bg-surface-muted text-muted",
  "In Progress": "bg-info-soft text-info",
  Done: "bg-positive-soft text-positive",
  // Estimate statuses — computed display labels (docstatus + linked Farm
  // Project), not stored values. "Draft"/"Cancelled" above are shared with
  // Work's own statuses.
  "Not Created": "bg-surface-muted text-muted",
  Approved: "bg-positive-soft text-positive",
  "Converted to Project": "bg-primary-soft text-primary",
}

const cls = computed(() => styleMap[props.status] || "bg-surface-muted text-muted")
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
    :class="cls"
  >
    <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
    {{ status }}
  </span>
</template>
