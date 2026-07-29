<script setup>
import { ref, reactive, computed, onMounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import FilterCombobox from "@/components/FilterCombobox.vue"
import ConfirmDialog from "@/components/ConfirmDialog.vue"
import { formatCurrency } from "@/format.js"
import {
  fetchCategoryTemplate,
  updateCategoryTemplate,
  fetchActivities,
  fetchAllItemOptions,
  LINE_TYPES,
  LINE_TYPE_ITEM_GROUPS,
  CONSUMPTION_BASES,
} from "@/data/category_templates.js"
import { isSystemManager } from "@/session.js"

const route = useRoute()
const router = useRouter()

// Client-side-only gate — hides the mutating actions (Add/Remove/Save) from
// users who'd fail the save server-side anyway (Project Category is still
// System Manager-only, see project_category.json). Viewing templates stays
// open to everyone; only the write actions are gated.
const canEdit = isSystemManager()

const loading = ref(true)
const error = ref(null)
const tmpl = reactive({ items: [], activities: [] })
const itemOptions = ref([])
const activityOptions = ref([])

// Snapshot of the last-saved state — dirty-checking and Cancel both compare/revert against this.
const pristine = ref(null)
function snapshotPristine() {
  pristine.value = JSON.parse(JSON.stringify(tmpl))
}
const isDirty = computed(() => pristine.value && JSON.stringify(tmpl) !== JSON.stringify(pristine.value))

function cancelEdits() {
  if (!pristine.value) return
  Object.assign(tmpl, JSON.parse(JSON.stringify(pristine.value)))
}

onMounted(async () => {
  try {
    const [doc, items, activities] = await Promise.all([
      fetchCategoryTemplate(route.params.id),
      fetchAllItemOptions(),
      fetchActivities(),
    ])
    Object.assign(tmpl, doc)
    itemOptions.value = items
    activityOptions.value = activities
    snapshotPristine()
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this template."
  } finally {
    loading.value = false
  }
})

function itemOption(code) {
  return itemOptions.value.find((o) => o.value === code) || null
}
// Same Item-Group filtering the Estimate Builder's Add Line flow already
// uses (LINE_TYPE_ITEM_GROUPS) — a Type pick here should narrow the Item
// dropdown the same way, not show all 399 items regardless of Type.
function itemOptionsForType(lineType) {
  const groups = LINE_TYPE_ITEM_GROUPS[lineType] || []
  return itemOptions.value.filter((o) => groups.includes(o.item_group))
}
function activityOption(code) {
  return activityOptions.value.find((o) => o.value === code) || null
}

const TYPE_COLORS = {
  Material: "bg-warning-soft text-warning",
  Labour: "bg-info-soft text-info",
  Machinery: "bg-positive-soft text-positive",
  Manual: "bg-surface-muted text-muted",
  Overhead: "bg-accent-soft text-accent",
}

// ---- Standard Items ----
const showAddItem = ref(false)
const newItem = reactive({ item: "", line_type: "Material", description: "", consumption_basis: "Per Plant", consumption_rate: null, is_manual: false })

function addItem() {
  if (!newItem.is_manual && !newItem.item) return
  const opt = itemOption(newItem.item)
  tmpl.items.push({
    item: newItem.is_manual ? null : newItem.item,
    line_type: newItem.line_type,
    description: newItem.description || (opt ? "" : ""),
    consumption_basis: newItem.consumption_basis,
    consumption_rate: newItem.consumption_rate,
    uom: opt?.stock_uom || "",
    is_manual: newItem.is_manual ? 1 : 0,
  })
  Object.assign(newItem, { item: "", line_type: "Material", description: "", consumption_basis: "Per Plant", consumption_rate: null, is_manual: false })
  showAddItem.value = false
}
function removeItem(i) {
  tmpl.items.splice(i, 1)
}
function onItemPick(row, code) {
  const opt = itemOption(code)
  row.item = code
  row.uom = opt?.stock_uom || row.uom
}

// ---- Standard Activities ----
const showAddActivity = ref(false)
const newActivity = reactive({ activity: "", standard_output_override: null, item: "", consumption_basis: "Per Plant", consumption_rate: null })
function addActivity() {
  if (!newActivity.activity) return
  tmpl.activities.push({
    activity: newActivity.activity,
    standard_output_override: newActivity.standard_output_override,
    item: newActivity.item || null,
    consumption_basis: newActivity.consumption_basis,
    consumption_rate: newActivity.consumption_rate,
  })
  Object.assign(newActivity, { activity: "", standard_output_override: null, item: "", consumption_basis: "Per Plant", consumption_rate: null })
  showAddActivity.value = false
}
function removeActivity(i) {
  tmpl.activities.splice(i, 1)
}

// ---- Save ----
const saving = ref(false)
const saved = ref(false)
const saveError = ref(null)
const showSaveConfirm = ref(false)

function confirmSave() {
  saveError.value = null
  showSaveConfirm.value = true
}

async function doSave() {
  showSaveConfirm.value = false
  saving.value = true
  saveError.value = null
  try {
    await updateCategoryTemplate(tmpl.name, {
      description: tmpl.description,
      default_row_spacing: tmpl.default_row_spacing,
      default_plant_spacing: tmpl.default_plant_spacing,
      default_pit_size: tmpl.default_pit_size,
      default_supervision_type: tmpl.default_supervision_type,
      default_supervision_value: tmpl.default_supervision_value,
      items: tmpl.items,
      activities: tmpl.activities,
    })
    snapshotPristine()
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  } catch (e) {
    saveError.value = e.messages?.[0] || e.message || "Failed to save this template."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="max-w-4xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <button class="text-muted hover:text-foreground p-1 rounded-lg hover:bg-surface-muted transition-colors" @click="router.push('/category-templates')">
        <AppIcon name="arrowLeft" :size="20" />
      </button>
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-0.5">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-muted text-[11px] font-semibold text-muted">
            <AppIcon name="lock" :size="11" /> Admin
          </span>
          <span v-if="!canEdit" class="text-[11px] text-muted">View only</span>
          <span class="text-xs text-muted">{{ tmpl.name }}</span>
        </div>
        <h2 class="font-display text-2xl font-semibold text-foreground">{{ tmpl.category_name }}</h2>
      </div>
      <template v-if="canEdit">
        <button
          v-if="isDirty"
          @click="cancelEdits"
          :disabled="saving"
          class="px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          @click="confirmSave"
          :disabled="!isDirty || saving"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :class="saved ? 'bg-positive text-white' : 'bg-primary text-primary-foreground hover:bg-primary-hover'"
        >
          <AppIcon :name="saved ? 'check' : 'edit'" :size="16" />
          {{ saving ? "Saving…" : saved ? "Saved" : "Save Template" }}
        </button>
      </template>
    </div>

    <p v-if="saveError" class="text-sm text-negative bg-negative-soft rounded-lg p-3">{{ saveError }}</p>

    <!-- Defaults card -->
    <div class="bg-surface border border-border rounded-xl p-5">
      <h3 class="font-medium text-foreground mb-4">Default Settings</h3>
      <label class="block mb-4">
        <span class="text-sm text-muted mb-1.5 block">Description</span>
        <textarea v-model="tmpl.description" rows="2" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"></textarea>
      </label>
      <div class="grid sm:grid-cols-3 gap-4">
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Row Spacing (ft)</span>
          <input v-model.number="tmpl.default_row_spacing" type="number" step="0.1" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Plant Spacing (ft)</span>
          <input v-model.number="tmpl.default_plant_spacing" type="number" step="0.1" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Pit / Bed Size</span>
          <input v-model="tmpl.default_pit_size" type="text" class="w-full py-2.5 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Default Supervision</span>
          <FilterCombobox v-model="tmpl.default_supervision_type" :options="['Fixed', 'Percent']" />
        </label>
        <label class="block">
          <span class="text-sm text-muted mb-1.5 block">Supervision Value</span>
          <div class="relative">
            <span v-if="tmpl.default_supervision_type === 'Fixed'" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">₹</span>
            <input
              v-model.number="tmpl.default_supervision_value"
              type="number"
              class="w-full py-2.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              :class="[tmpl.default_supervision_type === 'Fixed' ? 'pl-7' : 'pl-3', tmpl.default_supervision_type === 'Percent' ? 'pr-7' : 'pr-3']"
            />
            <span v-if="tmpl.default_supervision_type === 'Percent'" class="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">%</span>
          </div>
        </label>
      </div>
    </div>

    <!-- Template line items -->
    <div class="bg-surface border border-border rounded-xl">
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-muted/40">
        <div class="flex items-center gap-2">
          <AppIcon name="layers" :size="16" class="text-primary" />
          <h3 class="font-medium text-foreground">Standard Items</h3>
          <span class="text-xs text-muted">({{ tmpl.items.length }})</span>
        </div>
        <button
          v-if="canEdit"
          @click="showAddItem = !showAddItem"
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-primary-soft px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <AppIcon name="plus" :size="14" /> Add Item
        </button>
      </div>

      <!-- Add item form -->
      <div v-if="showAddItem" class="px-5 py-4 border-b border-border bg-primary-soft/30 space-y-3">
        <label class="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" v-model="newItem.is_manual" class="rounded border-border" /> Manual placeholder line (no linked Item)
        </label>
        <div class="grid sm:grid-cols-3 gap-3">
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Type</span>
            <FilterCombobox v-model="newItem.line_type" :options="LINE_TYPES" @update:modelValue="newItem.item = ''" />
          </label>
          <label v-if="!newItem.is_manual" class="block">
            <span class="text-xs text-muted mb-1 block">Item</span>
            <RecordPicker v-model="newItem.item" :options="itemOptionsForType(newItem.line_type)" placeholder="Select item" />
          </label>
          <label class="block" :class="newItem.is_manual ? 'sm:col-span-2' : ''">
            <span class="text-xs text-muted mb-1 block">Description</span>
            <input v-model="newItem.description" type="text" placeholder="e.g. Design and Layout" class="w-full py-2 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
        </div>
        <div v-if="!newItem.is_manual" class="grid sm:grid-cols-3 gap-3 items-end">
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Consumption Basis</span>
            <FilterCombobox v-model="newItem.consumption_basis" :options="CONSUMPTION_BASES" />
          </label>
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Consumption Rate</span>
            <input v-model.number="newItem.consumption_rate" type="number" step="0.001" placeholder="e.g. 5 (kg per pit)" class="w-full py-2 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
          <div class="flex gap-2">
            <button @click="addItem" class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors">
              <AppIcon name="check" :size="15" /> Add
            </button>
            <button @click="showAddItem = false" class="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors">Cancel</button>
          </div>
        </div>
        <div v-else class="flex gap-2">
          <button @click="addItem" class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors">
            <AppIcon name="check" :size="15" /> Add
          </button>
          <button @click="showAddItem = false" class="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors">Cancel</button>
        </div>
      </div>

      <!-- Items table -->
      <div v-if="tmpl.items.length">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-border">
              <th class="font-normal text-muted px-5 py-2.5">Item</th>
              <th class="font-normal text-muted px-5 py-2.5">Type</th>
              <th class="font-normal text-muted px-5 py-2.5">Basis</th>
              <th class="font-normal text-muted px-5 py-2.5 text-right">Rate</th>
              <th class="font-normal text-muted px-5 py-2.5">UOM</th>
              <th class="font-normal px-5 py-2.5 text-right">
                <span class="text-muted text-[11px] font-semibold">Item Price</span>
              </th>
              <th class="font-normal px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="(row, i) in tmpl.items" :key="i" class="hover:bg-surface-muted/20 group">
              <td class="px-5 py-2.5 font-medium text-foreground">
                <RecordPicker v-if="!row.is_manual" :model-value="row.item" :options="itemOptionsForType(row.line_type)" placeholder="Select item" @update:modelValue="(v) => onItemPick(row, v)" />
                <input v-else v-model="row.description" type="text" placeholder="Manual line description" class="w-full text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 -mx-1" />
              </td>
              <td class="px-5 py-2.5">
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" :class="TYPE_COLORS[row.line_type] || 'bg-surface-muted text-muted'">
                  {{ row.line_type || "—" }}
                </span>
              </td>
              <td class="px-5 py-2.5 text-muted">
                <span v-if="row.is_manual" class="text-xs">Manual</span>
                <FilterCombobox v-else v-model="row.consumption_basis" :options="CONSUMPTION_BASES" />
              </td>
              <td class="px-5 py-2.5 text-right tabular-nums">
                <input v-if="!row.is_manual" v-model.number="row.consumption_rate" type="number" step="0.001" class="w-20 text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 text-right tabular-nums" />
                <span v-else class="text-muted text-xs">—</span>
              </td>
              <td class="px-5 py-2.5 text-muted">{{ row.uom || "—" }}</td>
              <td class="px-5 py-2.5 text-right text-muted tabular-nums">
                {{ row.item ? formatCurrency(itemOption(row.item)?.unit_price) : "—" }}
              </td>
              <td class="px-3 py-2.5">
                <button v-if="canEdit" @click="removeItem(i)" class="opacity-0 group-hover:opacity-100 text-muted hover:text-negative transition-all p-0.5 rounded" aria-label="Remove item">
                  <AppIcon name="trash" :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-4 text-sm text-muted">No standard items yet.</p>
    </div>

    <!-- Activities -->
    <div class="bg-surface border border-border rounded-xl overflow-hidden">
      <div class="flex items-center justify-between p-5 pb-4">
        <div class="flex items-center gap-2">
          <AppIcon name="check" :size="16" class="text-primary" />
          <h3 class="font-medium text-foreground">Standard Activities</h3>
          <span class="text-xs text-muted">({{ tmpl.activities.length }})</span>
        </div>
        <button
          v-if="canEdit"
          @click="showAddActivity = !showAddActivity"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors"
        >
          <AppIcon name="plus" :size="14" /> Add Activity
        </button>
      </div>

      <!-- Add activity form -->
      <div v-if="showAddActivity" class="mx-5 mb-4 px-5 py-4 rounded-xl bg-primary-soft/30 space-y-3">
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Activity</span>
            <RecordPicker v-model="newActivity.activity" :options="activityOptions" placeholder="Select activity" />
          </label>
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Standard Output Override</span>
            <input v-model.number="newActivity.standard_output_override" type="number" placeholder="Leave blank to use Activity default" class="w-full py-2 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
        </div>
        <div class="grid sm:grid-cols-3 gap-3 items-end">
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Item (Daily Wage)</span>
            <RecordPicker v-model="newActivity.item" :options="itemOptionsForType('Labour')" placeholder="Select labour item" />
          </label>
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Consumption Basis</span>
            <FilterCombobox v-model="newActivity.consumption_basis" :options="CONSUMPTION_BASES" />
          </label>
          <label class="block">
            <span class="text-xs text-muted mb-1 block">Consumption Rate</span>
            <input
              v-model.number="newActivity.consumption_rate"
              type="number"
              step="0.001"
              placeholder="e.g. 1 — counts the area/plants once, not a per-unit multiplier"
              class="w-full py-2 px-3 rounded-lg bg-surface border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>
        <div class="flex gap-2">
          <button
            @click="addActivity"
            :disabled="!newActivity.activity"
            class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <AppIcon name="check" :size="15" /> Add
          </button>
          <button @click="showAddActivity = false" class="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted transition-colors">Cancel</button>
        </div>
      </div>

      <!-- Activities table -->
      <div v-if="tmpl.activities.length">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-border">
              <th class="font-normal text-muted px-5 py-2.5">Activity</th>
              <th class="font-normal text-muted px-5 py-2.5 text-right">Output Override</th>
              <th class="font-normal text-muted px-5 py-2.5">Item</th>
              <th class="font-normal text-muted px-5 py-2.5">Basis</th>
              <th class="font-normal text-muted px-5 py-2.5 text-right">Rate</th>
              <th class="font-normal px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="(row, i) in tmpl.activities" :key="i" class="hover:bg-surface-muted/20 group">
              <td class="px-5 py-2.5 font-medium text-foreground">
                <RecordPicker :model-value="row.activity" :options="activityOptions" placeholder="Select activity" @update:modelValue="(v) => (row.activity = v)" />
              </td>
              <td class="px-5 py-2.5 text-right tabular-nums">
                <input v-model.number="row.standard_output_override" type="number" placeholder="default" class="w-24 text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 text-right tabular-nums" />
              </td>
              <td class="px-5 py-2.5">
                <RecordPicker :model-value="row.item" :options="itemOptionsForType('Labour')" placeholder="Select item" @update:modelValue="(v) => (row.item = v)" />
              </td>
              <td class="px-5 py-2.5 text-muted">
                <FilterCombobox v-model="row.consumption_basis" :options="CONSUMPTION_BASES" />
              </td>
              <td class="px-5 py-2.5 text-right tabular-nums">
                <input
                  v-model.number="row.consumption_rate"
                  type="number"
                  step="0.001"
                  title="Counts the area/plants once, not a per-unit multiplier — e.g. 1, not 1000"
                  class="w-20 text-sm bg-transparent border-0 focus:outline-none focus:bg-surface rounded px-1 text-right tabular-nums"
                />
              </td>
              <td class="px-3 py-2.5">
                <button v-if="canEdit" @click="removeActivity(i)" class="opacity-0 group-hover:opacity-100 text-muted hover:text-negative transition-all p-0.5 rounded" aria-label="Remove activity">
                  <AppIcon name="trash" :size="14" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="px-5 py-4 text-sm text-muted">No standard activities yet.</p>
    </div>

    <ConfirmDialog
      v-if="showSaveConfirm"
      title="Save this template?"
      message="This updates the standard items and activities used by every new Estimate that applies this category template. Existing Estimates already created from it are not affected."
      confirm-label="Save"
      cancel-label="Go Back"
      @confirm="doSave"
      @cancel="showSaveConfirm = false"
    />
  </div>
</template>
