<script setup>
import { computed } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import { peekPrevious, popAndGetPrevious } from "@/navigationHistory.js"

const props = defineProps({
  // Canonical list route to fall back to when there's no real in-app
  // history to return to (direct URL load, refresh, new tab).
  fallback: { type: String, required: true },
  fallbackLabel: { type: String, default: "Back" },
  // "link" = icon + text (detail pages that used to say "Back to X").
  // "icon" = icon-only circular button (Estimate/Category Template editors).
  variant: { type: String, default: "link" },
})

const router = useRouter()
const prev = computed(() => peekPrevious())
const label = computed(() => {
  if (!prev.value?.title) return props.fallbackLabel
  return prev.value.id ? `Back to ${prev.value.title} ${prev.value.id}` : `Back to ${prev.value.title}`
})

function goBack() {
  const target = popAndGetPrevious()
  router.push(target ? target.path : props.fallback)
}
</script>

<template>
  <button
    v-if="variant === 'icon'"
    class="text-muted hover:text-foreground p-1 rounded-lg hover:bg-surface-muted transition-colors"
    :aria-label="label"
    @click="goBack"
  >
    <AppIcon name="arrowLeft" :size="20" />
  </button>
  <button v-else class="flex items-center gap-1.5 text-sm text-muted hover:text-foreground" @click="goBack">
    <AppIcon name="arrowLeft" :size="16" /> {{ label }}
  </button>
</template>
