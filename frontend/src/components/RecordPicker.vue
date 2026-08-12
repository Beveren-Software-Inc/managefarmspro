<script setup>
import { ref, computed } from "vue"
import AppIcon from "@/components/AppIcon.vue"

// Like FilterCombobox, but for picking a real record (Item, Work Item, …)
// where the display label differs from the stored value — options are
// [{ value, label }], and selecting one emits the whole option object so
// the caller can read extra fields (e.g. stock_uom) off it too.
const props = defineProps({
  modelValue: { type: String, default: "" },
  options: { type: Array, default: () => [] }, // [{ value, label, ...extra }]
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(["update:modelValue", "select"])

const open = ref(false)
const search = ref("")

const selectedLabel = computed(() => props.options.find((o) => o.value === props.modelValue)?.label || "")

const filteredOptions = computed(() => {
  const q = search.value.toLowerCase()
  return props.options.filter((o) => o.label.toLowerCase().includes(q))
})

function onFocus() {
  if (props.disabled) return
  search.value = ""
  open.value = true
}
function onInput(e) {
  if (props.disabled) return
  search.value = e.target.value
  open.value = true
}
function onBlur() {
  open.value = false
}
function select(option) {
  emit("update:modelValue", option.value)
  emit("select", option)
  search.value = ""
  open.value = false
}
function clear() {
  emit("update:modelValue", "")
  emit("select", null)
  search.value = ""
}
</script>

<template>
  <div class="relative">
    <input
      type="text"
      :value="open ? search : selectedLabel"
      :placeholder="placeholder"
      :disabled="disabled"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
      class="w-full pl-3 pr-16 py-2.5 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
    />
    <button
      v-if="modelValue"
      type="button"
      @mousedown.prevent="clear"
      class="absolute right-7 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
      aria-label="Clear"
    >
      <AppIcon name="x" :size="14" />
    </button>
    <span class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
      <AppIcon name="chevronDown" :size="15" />
    </span>

    <ul
      v-if="open && filteredOptions.length"
      class="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-border bg-surface shadow-lg py-1"
    >
      <li
        v-for="o in filteredOptions"
        :key="o.value"
        @mousedown.prevent="select(o)"
        class="px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-muted"
        :class="o.value === modelValue ? 'text-primary font-medium' : 'text-foreground'"
      >
        {{ o.label }}
      </li>
    </ul>
    <p
      v-else-if="open && !filteredOptions.length"
      class="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg py-2 px-3 text-sm text-muted"
    >
      No matches.
    </p>
  </div>
</template>
