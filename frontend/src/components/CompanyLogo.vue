<script setup>
defineProps({
  size: { type: Number, default: 22 },
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="16" cy="18" r="11" fill="#d1487a" />
    <g fill="#ef82a8">
      <circle cx="11" cy="12" r="1.1" />
      <circle cx="16" cy="10.5" r="1.1" />
      <circle cx="21" cy="12" r="1.1" />
      <circle cx="9" cy="16" r="1.1" />
      <circle cx="14" cy="15" r="1.1" />
      <circle cx="19" cy="15" r="1.1" />
      <circle cx="23.5" cy="16" r="1.1" />
      <circle cx="8" cy="20" r="1.1" />
      <circle cx="13" cy="19.5" r="1.1" />
      <circle cx="18" cy="19.5" r="1.1" />
      <circle cx="23" cy="20" r="1.1" />
      <circle cx="10.5" cy="24" r="1.1" />
      <circle cx="16" cy="25" r="1.1" />
      <circle cx="21.5" cy="24" r="1.1" />
    </g>
    <path
      d="M16 8.5C14 6 11 5.5 9 6.5C10 8.5 11 10.5 13.5 11.5C14.5 10 15.5 9 16 8.5Z"
      fill="#2f5233"
    />
  </svg>
</template>
