<script setup>
import { computed, ref } from "vue"

const props = defineProps({
  data: { type: Array, required: true }, // [{ date, count }]
})

const W = 640
const H = 220
const padX = 12
const padTop = 16
const padBottom = 28

const max = computed(() => Math.max(1, ...props.data.map((d) => d.count)) * 1.15)
const stepX = computed(() => (W - padX * 2) / Math.max(1, props.data.length - 1))

function x(i) {
  return padX + i * stepX.value
}
function y(v) {
  const usable = H - padTop - padBottom
  return padTop + usable - (v / max.value) * usable
}

const linePath = computed(() =>
  props.data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.count).toFixed(1)}`).join(" "),
)
const areaPath = computed(
  () =>
    `${linePath.value} L ${x(props.data.length - 1).toFixed(1)} ${H - padBottom} L ${x(0).toFixed(1)} ${H - padBottom} Z`,
)

const hover = ref(null)

// Thin out x-axis labels so they don't collide when there are many points.
const labelStep = computed(() => Math.max(1, Math.ceil(props.data.length / 8)))
function showLabel(i) {
  return i % labelStep.value === 0 || i === props.data.length - 1
}
</script>

<template>
  <div class="w-full">
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full h-56" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.28" />
          <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <!-- gridlines -->
      <line
        v-for="g in 4"
        :key="g"
        :x1="padX"
        :x2="W - padX"
        :y1="padTop + ((H - padTop - padBottom) / 4) * g"
        :y2="padTop + ((H - padTop - padBottom) / 4) * g"
        stroke="var(--color-border)"
        stroke-width="1"
      />

      <path :d="areaPath" fill="url(#areaFill)" />
      <path :d="linePath" fill="none" stroke="var(--color-primary)" stroke-width="2.5" stroke-linejoin="round" />

      <g v-for="(d, i) in data" :key="i">
        <circle
          :cx="x(i)"
          :cy="y(d.count)"
          :r="hover === i ? 5 : 3.5"
          fill="var(--color-surface)"
          stroke="var(--color-primary)"
          stroke-width="2.5"
        />
        <rect
          :x="x(i) - stepX / 2"
          y="0"
          :width="stepX"
          :height="H"
          fill="transparent"
          @mouseenter="hover = i"
          @mouseleave="hover = null"
        />
        <text
          v-if="showLabel(i)"
          :x="x(i)"
          :y="H - 8"
          text-anchor="middle"
          class="fill-muted"
          style="font-size: 11px"
        >
          {{ d.date }}
        </text>
        <g v-if="hover === i">
          <rect :x="x(i) - 18" :y="y(d.count) - 30" width="36" height="20" rx="5" fill="var(--color-foreground)" />
          <text
            :x="x(i)"
            :y="y(d.count) - 16"
            text-anchor="middle"
            fill="var(--color-primary-foreground)"
            style="font-size: 11px; font-weight: 600"
          >
            {{ d.count }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>
