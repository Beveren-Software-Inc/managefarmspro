<script setup>
import AppIcon from "@/components/AppIcon.vue"
import { session, initials, isSystemManager } from "@/session.js"

defineProps({ mobileOpen: Boolean })
defineEmits(["close"])

const dashboardItem = { to: "/", label: "Dashboard", icon: "dashboard" }

// Grouped by functional area. Category Templates stays inside Projects but
// is only included for System Manager — same role check already used to
// gate that page's own New/Clone/Edit actions (CategoryTemplateListView.vue,
// CategoryTemplateEditorView.vue), just also applied to its nav entry now.
const navGroups = [
  {
    label: "Clients",
    items: [
      { to: "/owners", label: "Customers", icon: "users" },
      { to: "/plots", label: "Plots", icon: "plot" },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { to: "/works", label: "Works", icon: "work" },
      { to: "/invoices/generate", label: "Generate Invoice", icon: "invoice" },
      { to: "/invoices", label: "Invoice History", icon: "file" },
      { to: "/low-balance-plots", label: "Low Balance Plots", icon: "alert" },
    ],
  },
  {
    label: "Site Visits",
    items: [
      { to: "/site-visits", label: "Site Visits", icon: "calendar" },
      { to: "/site-visits/calendar", label: "Visit Calendar", icon: "calendar" },
      ...(isSystemManager() ? [{ to: "/settings/site-visit-pricing", label: "Pricing", icon: "percent" }] : []),
    ],
  },
  {
    label: "Projects",
    items: [
      { to: "/estimates", label: "Estimates", icon: "estimate" },
      { to: "/projects", label: "Farm Projects", icon: "layers" },
      ...(isSystemManager() ? [{ to: "/category-templates", label: "Category Templates", icon: "template" }] : []),
    ],
  },
]
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-primary text-primary-foreground transition-transform lg:translate-x-0 shadow-[6px_0_28px_-6px_rgba(23,76,59,0.45)]"
    :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex items-center gap-3 px-5 h-16 shrink-0">
      <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-primary-foreground/10 text-accent">
        <AppIcon name="sprout" :size="21" />
      </div>
      <div class="leading-tight">
        <p class="font-display text-[19px] font-semibold tracking-tight">ManageFarms<span class="text-accent">Pro</span></p>
        <p class="text-[11px] text-primary-foreground/55">Farm & Plot Operations</p>
      </div>
    </div>

    <nav class="flex-1 px-3 py-1.5 overflow-y-auto">
      <!-- Dashboard - standalone, above the grouped sections -->
      <router-link :to="dashboardItem.to" custom v-slot="{ href, navigate, isExactActive }">
        <a
          :href="href"
          @click="(e) => { navigate(e); $emit('close') }"
          class="flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors"
          :class="
            isExactActive
              ? 'bg-primary-foreground/15 text-primary-foreground shadow-sm'
              : 'text-primary-foreground/65 hover:bg-primary-foreground/10 hover:text-primary-foreground'
          "
        >
          <AppIcon :name="dashboardItem.icon" :size="19" />
          {{ dashboardItem.label }}
        </a>
      </router-link>

      <div v-for="group in navGroups" :key="group.label">
        <div class="pt-3.5 pb-1 px-3">
          <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-accent/90">{{ group.label }}</p>
        </div>
        <router-link
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          custom
          v-slot="{ href, navigate, isActive }"
        >
          <a
            :href="href"
            @click="(e) => { navigate(e); $emit('close') }"
            class="flex items-center gap-3 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors"
            :class="
              isActive
                ? 'bg-primary-foreground/15 text-primary-foreground shadow-sm'
                : 'text-primary-foreground/65 hover:bg-primary-foreground/10 hover:text-primary-foreground'
            "
          >
            <AppIcon :name="item.icon" :size="19" />
            {{ item.label }}
          </a>
        </router-link>
      </div>
    </nav>

    <div class="px-3 pb-2 shrink-0">
      <router-link
        to="/works/new"
        @click="$emit('close')"
        class="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-bold hover:brightness-95 transition-all shadow-sm"
      >
        <AppIcon name="plus" :size="18" />
        Log New Work
      </router-link>
    </div>

    <div class="mx-3 mb-2.5 px-3 py-2.5 rounded-xl bg-primary-foreground/10 flex items-center gap-3 shrink-0">
      <div class="w-9 h-9 rounded-xl bg-primary-foreground/10 text-accent flex items-center justify-center text-sm font-bold ring-1 ring-primary-foreground/10">
        {{ initials(session.fullName) }}
      </div>
      <div class="text-xs leading-tight min-w-0">
        <p class="font-semibold truncate">{{ session.fullName }}</p>
        <p class="text-primary-foreground/55 truncate">{{ session.user }}</p>
      </div>
      <AppIcon name="chevronDown" :size="16" class="ml-auto text-primary-foreground/45" />
    </div>
  </aside>
</template>
