<script setup>
import AppIcon from "@/components/AppIcon.vue"
import { session, initials } from "@/session.js"

defineProps({ mobileOpen: Boolean })
defineEmits(["close"])

const nav = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/owners", label: "Customers", icon: "users" },
  { to: "/plots", label: "Plots", icon: "plot" },
  { to: "/works", label: "Works", icon: "work" },
  { to: "/estimates", label: "Estimates", icon: "estimate" },
  { to: "/invoices/generate", label: "Generate Invoice", icon: "invoice" },
  { to: "/invoices", label: "Invoice History", icon: "file" },
]

const adminNav = [{ to: "/category-templates", label: "Category Templates", icon: "template" }]
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-primary text-primary-foreground transition-transform lg:translate-x-0"
    :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex items-center gap-3 px-5 h-16 border-b border-white/10">
      <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-foreground/10">
        <AppIcon name="sprout" :size="22" />
      </div>
      <div class="leading-tight">
        <p class="font-display text-lg font-semibold">ManageFarms<span class="text-accent">Pro</span></p>
        <p class="text-[11px] text-primary-foreground/60">Farm & Plot Operations</p>
      </div>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      <router-link
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        custom
        v-slot="{ href, navigate, isExactActive, isActive }"
      >
        <a
          :href="href"
          @click="(e) => { navigate(e); $emit('close') }"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
          :class="
            (item.to === '/' ? isExactActive : isActive)
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
          "
        >
          <AppIcon :name="item.icon" :size="19" />
          {{ item.label }}
        </a>
      </router-link>

      <div class="pt-3 mt-2 border-t border-white/10">
        <p class="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/40">Admin</p>
        <router-link
          v-for="item in adminNav"
          :key="item.to"
          :to="item.to"
          custom
          v-slot="{ href, navigate, isActive }"
        >
          <a
            :href="href"
            @click="(e) => { navigate(e); $emit('close') }"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
            :class="
              isActive
                ? 'bg-primary-foreground/15 text-primary-foreground'
                : 'text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground'
            "
          >
            <AppIcon :name="item.icon" :size="19" />
            {{ item.label }}
          </a>
        </router-link>
      </div>
    </nav>

    <div class="p-3">
      <router-link
        to="/works/new"
        @click="$emit('close')"
        class="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
      >
        <AppIcon name="plus" :size="18" />
        Log New Work
      </router-link>
    </div>

    <div class="px-5 py-4 border-t border-white/10 flex items-center gap-3">
      <div class="w-9 h-9 rounded-full bg-accent/80 flex items-center justify-center text-sm font-semibold">
        {{ initials(session.fullName) }}
      </div>
      <div class="text-xs leading-tight">
        <p class="font-medium">{{ session.fullName }}</p>
        <p class="text-primary-foreground/60">{{ session.user }}</p>
      </div>
    </div>
  </aside>
</template>
