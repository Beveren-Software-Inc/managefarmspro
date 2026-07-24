<script setup>
import { useRoute } from "vue-router"
import { computed } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import CompanyLogo from "@/components/CompanyLogo.vue"

defineEmits(["toggle-menu"])
const route = useRoute()
const title = computed(() => route.meta.title || "ManageFarmsPro")
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center gap-3 h-16 px-4 sm:px-6 lg:px-8 bg-background/85 backdrop-blur border-b border-border"
  >
    <button
      class="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-muted text-foreground"
      aria-label="Open menu"
      @click="$emit('toggle-menu')"
    >
      <AppIcon name="menu" :size="22" />
    </button>

    <h1 class="font-display text-xl font-semibold text-foreground truncate min-w-0">{{ title }}</h1>

    <div class="ml-auto hidden sm:block w-px h-6 bg-border" />

    <div class="ml-auto sm:ml-0 flex items-center gap-2">
      <CompanyLogo :size="22" class="shrink-0" />
      <span class="hidden sm:inline text-sm font-medium text-muted whitespace-nowrap">Philosan Farm Management</span>
    </div>

    <div class="flex items-center gap-2 sm:gap-3">
      <button
        class="relative p-2 rounded-lg bg-surface border border-border hover:bg-surface-muted text-foreground"
        aria-label="Notifications"
      >
        <AppIcon name="bell" :size="19" />
        <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
      </button>
    </div>
  </header>
</template>
