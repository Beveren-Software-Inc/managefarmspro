import { reactive } from "vue"

// Shared local-only state for an Estimate that hasn't been created yet.
// Setup's wizard writes here; Builder reads it when there's no backend
// record to load from (the "before Create" phase of the revised lifecycle
// model — nothing persisted until the user explicitly clicks Create).
export const estimateDraft = reactive({
  ready: false,
  category: null, // full Project Category doc, for reference (spacing/pit/supervision)
  client_name: "",
  customer: null,
  plot: null,
  location: "",
  area_value: null,
  area_unit: "Sqft",
  area_sqft: null,
  perimeter_ft: null,
  duration: "",
  line_items: [],
  cost_components: [],
})

export function setEstimateDraft(data) {
  Object.assign(estimateDraft, data, { ready: true })
}

export function clearEstimateDraft() {
  Object.assign(estimateDraft, {
    ready: false,
    category: null,
    client_name: "",
    customer: null,
    plot: null,
    location: "",
    area_value: null,
    area_unit: "Sqft",
    area_sqft: null,
    duration: "",
    line_items: [],
    cost_components: [],
  })
}
