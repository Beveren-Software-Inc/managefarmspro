<script setup>
import { ref, onMounted, onUnmounted } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import { session, initials, logout } from "@/session.js"

const open = ref(false)
const root = ref(null)

function toggle() {
  open.value = !open.value
}
function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) open.value = false
}
onMounted(() => document.addEventListener("click", onDocClick))
onUnmounted(() => document.removeEventListener("click", onDocClick))

function doLogout() {
  open.value = false
  logout()
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
        {{ initials(session.fullName) }}
      </div>
      <span class="hidden sm:inline text-sm font-medium text-foreground max-w-[9rem] truncate">{{ session.fullName }}</span>
      <AppIcon name="chevronDown" :size="14" class="hidden sm:inline text-muted shrink-0" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-60 rounded-xl bg-surface border border-border shadow-lg py-1.5 z-50"
    >
      <div class="px-3.5 py-2.5 border-b border-border">
        <p class="text-sm font-semibold text-foreground truncate">{{ session.fullName }}</p>
        <p class="text-xs text-muted truncate">{{ session.user }}</p>
      </div>
      <a
        href="/app"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2.5 px-3.5 py-2 text-sm text-foreground hover:bg-surface-muted transition-colors"
      >
        <AppIcon name="grid" :size="16" class="text-muted" />
        Open Desk
      </a>
      <button
        type="button"
        class="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-negative hover:bg-negative-soft transition-colors"
        @click="doLogout"
      >
        <AppIcon name="logout" :size="16" />
        Logout
      </button>
    </div>
  </div>
</template>
