<script setup>
defineProps({ screen: { type: String, default: "" } })
</script>

<template>
  <div class="text-center py-20 text-muted">
    <p class="font-display text-lg text-foreground">{{ screen }}</p>
    <p class="text-sm mt-1">Not built yet — coming in a later phase.</p>
  </div>
</template>
