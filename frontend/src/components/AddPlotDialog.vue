<script setup>
import { ref, reactive, computed, watch, onMounted } from "vue"
import AppIcon from "@/components/AppIcon.vue"
import RecordPicker from "@/components/RecordPicker.vue"
import { fetchClusters, fetchPlotLocations, createPlot } from "@/data/plots.js"
import { fetchCustomers } from "@/data/customers.js"

// presetCustomer: used from Customer Detail's Plots tab — Customer is fixed
// to the record you're already on (shown read-only, not re-fetched/pickable)
// instead of the standalone Plots-list flow's open Customer picker.
const props = defineProps({
  presetCustomer: { type: String, default: "" },
  presetCustomerLabel: { type: String, default: "" },
})
const emit = defineEmits(["close", "created"])

const clusterList = ref([])
const plotLocationList = ref([])
const customerList = ref([])

const clusterOptionsForAdd = computed(() => clusterList.value.map((c) => ({ value: c.name, label: c.cluster_name || c.name })))
const plotLocationOptionsForAdd = computed(() => plotLocationList.value.map((l) => ({ value: l.name, label: l.name })))
const customerOptionsForAdd = computed(() => customerList.value.map((c) => ({ value: c.name, label: c.customer_name })))

const creatingPlot = ref(false)
const createError = ref(null)

function blankPlot() {
  return {
    plot_number: "",
    plot_name: "",
    plot_name_touched: false,
    cluster: "",
    customer_name: props.presetCustomer || "",
    area: "",
    units: "Cent",
    plot_status: "Active",
    plot_location: "",
    preferred_plot_name: "",
    monthly_maintenance_budget: 0,
    supervision_charge: 0,
  }
}
const newPlot = reactive(blankPlot())

const customerLabel = computed(
  () => props.presetCustomerLabel || customerOptionsForAdd.value.find((c) => c.value === newPlot.customer_name)?.label || "",
)

// Mirrors Desk's own "Auto populate plot name" client script:
// PLOT_{plot_number}_{customer_name with spaces -> underscores}. Only
// auto-fills while the user hasn't typed a Plot Name themselves.
watch([() => newPlot.plot_number, () => newPlot.customer_name], () => {
  if (newPlot.plot_name_touched) return
  const formatted = (customerLabel.value || "Customer_Name").replace(/\s+/g, "_")
  newPlot.plot_name = newPlot.plot_number ? `PLOT_${newPlot.plot_number}_${formatted}` : `PLOT_${formatted}`
})

onMounted(async () => {
  clusterList.value = await fetchClusters()
  plotLocationList.value = await fetchPlotLocations()
  if (!props.presetCustomer) customerList.value = await fetchCustomers()
})

async function submit() {
  if (!newPlot.plot_name.trim() || !newPlot.cluster || !newPlot.customer_name || !newPlot.area) return
  creatingPlot.value = true
  createError.value = null
  try {
    const created = await createPlot(newPlot)
    emit("created", created)
  } catch (e) {
    createError.value = e.messages?.[0] || e.message || "Failed to create this plot."
  } finally {
    creatingPlot.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50" @click.self="emit('close')">
    <div class="bg-surface rounded-xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
      <div class="p-6 space-y-5">
        <div class="flex items-center gap-2.5">
          <span class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-soft text-primary shrink-0">
            <AppIcon name="plot" :size="18" />
          </span>
          <h3 class="font-display text-lg font-semibold text-foreground">Add Plot</h3>
        </div>

        <div>
          <p class="text-sm font-semibold text-foreground mb-3">Plot Details</p>
          <div class="grid sm:grid-cols-3 gap-3">
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Customer *</span>
              <RecordPicker v-if="!presetCustomer" v-model="newPlot.customer_name" :options="customerOptionsForAdd" placeholder="Select customer" />
              <p v-else class="w-full px-3 py-2 rounded-lg bg-surface-muted border border-border text-sm text-foreground">{{ presetCustomerLabel }}</p>
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Plot Number</span>
              <input v-model="newPlot.plot_number" type="text" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Plot Name *</span>
              <input
                v-model="newPlot.plot_name"
                type="text"
                placeholder="Auto-filled from Customer + Plot Number"
                class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                @input="newPlot.plot_name_touched = true"
              />
            </label>

            <label class="block">
              <span class="text-xs text-muted mb-1 block">Cluster *</span>
              <RecordPicker v-model="newPlot.cluster" :options="clusterOptionsForAdd" placeholder="Select cluster" />
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Area *</span>
              <input v-model.number="newPlot.area" type="number" min="0" step="0.01" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Unit(s)</span>
              <select v-model="newPlot.units" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option>Sq.Ft</option>
                <option>Cent</option>
                <option>Acre</option>
              </select>
            </label>

            <label class="block">
              <span class="text-xs text-muted mb-1 block">Plot Location</span>
              <RecordPicker v-model="newPlot.plot_location" :options="plotLocationOptionsForAdd" placeholder="Select location" />
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Plot Status</span>
              <select v-model="newPlot.plot_status" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option>Active</option>
                <option>Inactive</option>
                <option>Under Maintenance</option>
                <option>Under Development</option>
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Preferred Plot Name</span>
              <input v-model="newPlot.preferred_plot_name" type="text" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </label>
          </div>
        </div>

        <div class="pt-1 border-t border-border">
          <p class="text-sm font-semibold text-foreground mb-3 pt-3">Budget Settings</p>
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Monthly Maintenance Budget</span>
              <div class="relative">
                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">₹</span>
                <input v-model.number="newPlot.monthly_maintenance_budget" type="number" min="0" step="0.01" class="w-full pl-7 pr-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </label>
            <label class="block">
              <span class="text-xs text-muted mb-1 block">Supervision Charges *</span>
              <input v-model.number="newPlot.supervision_charge" type="number" min="0" max="100" step="0.01" class="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <p class="text-xs text-muted mt-1">Supervision charge in %</p>
            </label>
          </div>
        </div>

        <p v-if="createError" class="text-sm text-negative bg-negative-soft rounded-lg p-3">{{ createError }}</p>
      </div>
      <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
        <button class="px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-surface-muted" @click="emit('close')">Cancel</button>
        <button
          class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover disabled:opacity-60"
          :disabled="creatingPlot || !newPlot.plot_name.trim() || !newPlot.cluster || !newPlot.customer_name || !newPlot.area"
          @click="submit"
        >
          {{ creatingPlot ? "Creating…" : "Create Plot" }}
        </button>
      </div>
    </div>
  </div>
</template>
