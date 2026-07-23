<script setup>
import { ref } from "vue"
import AppSidebar from "@/components/AppSidebar.vue"
import AppTopbar from "@/components/AppTopbar.vue"

const mobileOpen = ref(false)
</script>

<template>
  <div class="min-h-screen flex bg-background text-foreground">
    <!-- Mobile overlay -->
    <div
      v-if="mobileOpen"
      class="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
      @click="mobileOpen = false"
    />

    <AppSidebar :mobile-open="mobileOpen" @close="mobileOpen = false" />

    <div class="flex-1 flex flex-col min-w-0 lg:pl-64">
      <AppTopbar @toggle-menu="mobileOpen = !mobileOpen" />
      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
