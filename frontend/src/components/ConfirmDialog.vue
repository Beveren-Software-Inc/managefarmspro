<script setup>
import AppIcon from "@/components/AppIcon.vue"

defineProps({
  title: { type: String, default: "Are you sure?" },
  message: { type: String, required: true },
  confirmLabel: { type: String, default: "Continue" },
  cancelLabel: { type: String, default: "Cancel" },
})
const emit = defineEmits(["confirm", "cancel"])
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50" @click.self="emit('cancel')">
    <div class="bg-surface rounded-xl w-full max-w-sm shadow-2xl">
      <div class="p-6 space-y-3">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-warning-soft text-warning shrink-0">
            <AppIcon name="alert" :size="18" />
          </span>
          <h3 class="font-display text-lg font-semibold text-foreground">{{ title }}</h3>
        </div>
        <p class="text-sm text-muted leading-relaxed">{{ message }}</p>
        <slot />
      </div>
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <button class="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover" @click="emit('confirm')">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
