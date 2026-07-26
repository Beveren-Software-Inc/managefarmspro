<script setup>
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import { fetchCategoryTemplates, spacingLabel, pitSizeLabel, supervisionLabel, CATEGORY_ICONS } from "@/data/category_templates.js"

const router = useRouter()

const loading = ref(true)
const error = ref(null)
const templates = ref([])
const query = ref("")

onMounted(async () => {
  try {
    templates.value = await fetchCategoryTemplates()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load category templates."
  } finally {
    loading.value = false
  }
})

const filtered = computed(() =>
  templates.value.filter((t) => !query.value || t.category_name.toLowerCase().includes(query.value.toLowerCase())),
)
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-start gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-muted text-xs font-semibold text-muted">
            <AppIcon name="lock" :size="12" /> Admin
          </span>
        </div>
        <h2 class="font-display text-2xl font-semibold text-foreground">Category Templates</h2>
        <p class="text-sm text-muted mt-0.5">Master templates for all 14 project categories. Applied when creating a new estimate.</p>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-muted text-center py-16">Loading templates…</p>
    <p v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</p>

    <template v-else>
      <!-- Search -->
      <div class="flex items-center gap-2">
        <p class="text-sm text-muted">{{ filtered.length }} templates</p>
        <div class="ml-auto relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><AppIcon name="search" :size="16" /></span>
          <input
            v-model="query"
            type="search"
            placeholder="Search templates…"
            class="w-56 pl-9 pr-3 py-2 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <!-- Template grid -->
      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <button
          v-for="t in filtered"
          :key="t.name"
          @click="router.push(`/category-templates/${t.name}`)"
          class="text-left bg-surface border border-border rounded-xl p-5 hover:border-primary/40 hover:-translate-y-0.5 transition-all group"
        >
          <div class="flex items-start gap-3 mb-4">
            <div class="w-10 h-10 rounded-lg bg-primary-soft flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors text-primary">
              <AppIcon :name="CATEGORY_ICONS[t.category_name] || 'leaf'" :size="20" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-foreground">{{ t.category_name }}</p>
              <p class="text-xs text-muted mt-0.5 truncate">{{ t.description || "No description yet" }}</p>
            </div>
            <AppIcon name="chevronRight" :size="16" class="text-muted flex-shrink-0 mt-1" />
          </div>

          <div class="space-y-1.5 text-xs text-muted mb-4">
            <div class="flex items-center gap-1.5">
              <AppIcon name="filter" :size="12" />
              <span>Spacing: {{ spacingLabel(t) }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <AppIcon name="layers" :size="12" />
              <span>Pit: {{ pitSizeLabel(t) }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <AppIcon name="percent" :size="12" />
              <span>Supervision: {{ supervisionLabel(t) }}</span>
            </div>
          </div>

          <div class="pt-3 border-t border-border flex items-center justify-between">
            <span class="text-xs text-muted">{{ t.itemCount }} line items · {{ t.activityCount }} activities</span>
          </div>
        </button>
      </div>

      <div v-if="!filtered.length" class="py-16 text-center text-muted bg-surface border border-border rounded-xl">
        No templates match your search.
      </div>
    </template>
  </div>
</template>
