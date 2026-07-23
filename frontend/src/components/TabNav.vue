<script setup>
defineProps({
  tabs: { type: Array, required: true }, // [{ key, label }]
  modelValue: String,
})
defineEmits(["update:modelValue"])
</script>

<template>
  <div class="flex gap-1 border-b border-border overflow-x-auto">
    <button
      v-for="t in tabs"
      :key="t.key"
      @click="$emit('update:modelValue', t.key)"
      class="relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
      :class="modelValue === t.key ? 'text-primary' : 'text-muted hover:text-foreground'"
    >
      {{ t.label }}
      <span
        v-if="modelValue === t.key"
        class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
      />
    </button>
  </div>
</template>
