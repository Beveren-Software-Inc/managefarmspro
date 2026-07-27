<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import AppIcon from "@/components/AppIcon.vue"
import StatusBadge from "@/components/StatusBadge.vue"
import { fetchEstimateWithProject, estimateStatusLabel, areaLabel, downloadEstimatePdf } from "@/data/estimates.js"
import { formatCurrency, formatDate } from "@/format.js"

const route = useRoute()
const router = useRouter()

const loading = ref(true)
const error = ref(null)
const doc = ref(null)
const linkedProject = ref(null)

onMounted(async () => {
  try {
    const { doc: d, linkedProject: project } = await fetchEstimateWithProject(route.params.id)
    doc.value = d
    linkedProject.value = project
  } catch (e) {
    error.value = e.messages?.[0] || e.message || "Failed to load this estimate."
  } finally {
    loading.value = false
  }
})

const statusLabel = computed(() => estimateStatusLabel(doc.value?.docstatus, !!linkedProject.value))

// Read-only preview — every number here is already persisted on the doc
// (line amounts, per-component amounts, and all four rollup totals), so
// this groups for display only and never recomputes the costing sequence
// itself. Single source of truth stays the doc Builder already saved.
const sections = computed(() => {
  if (!doc.value) return []
  const bySection = {}
  const order = []
  for (const li of doc.value.line_items || []) {
    const key = li.section || "General"
    if (!bySection[key]) {
      bySection[key] = { name: key, discount: 0, lines: [] }
      order.push(key)
    }
    bySection[key].lines.push(li)
  }
  for (const sd of doc.value.section_discounts || []) {
    if (!bySection[sd.section]) {
      bySection[sd.section] = { name: sd.section, discount: 0, lines: [] }
      order.push(sd.section)
    }
    bySection[sd.section].discount = sd.discount_percent || 0
  }
  return order.map((k) => bySection[k])
})
function sectionGross(s) {
  return s.lines.reduce((t, l) => t + (l.amount || 0), 0)
}
function sectionDiscountAmount(s) {
  return Math.round((sectionGross(s) * (s.discount || 0)) / 100)
}
function sectionSubtotal(s) {
  return sectionGross(s) - sectionDiscountAmount(s)
}

const internalTotal = computed(() => (doc.value?.line_items || []).reduce((t, l) => t + (l.quantity || 0) * (l.internal_rate || 0), 0))
const marginValue = computed(() => (doc.value?.cost_subtotal || 0) - internalTotal.value)
const marginPct = computed(() => (doc.value?.cost_subtotal ? Math.round((marginValue.value / doc.value.cost_subtotal) * 100) : 0))

// amountInWords — client-side, for this on-screen preview only. The real
// generated PDF (estimate_output.py) uses Frappe's own money_in_words()
// server-side instead, same as the existing invoice pipeline.
const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
function twoDigit(n) {
  if (n < 20) return ones[n]
  return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "")
}
function amountInWords(num) {
  num = Math.round(num || 0)
  if (num === 0) return "Zero Rupees Only"
  let result = ""
  const crore = Math.floor(num / 10000000)
  num %= 10000000
  const lakh = Math.floor(num / 100000)
  num %= 100000
  const thousand = Math.floor(num / 1000)
  num %= 1000
  const hundred = Math.floor(num / 100)
  num %= 100
  if (crore) result += twoDigit(crore) + " Crore "
  if (lakh) result += twoDigit(lakh) + " Lakh "
  if (thousand) result += twoDigit(thousand) + " Thousand "
  if (hundred) result += ones[hundred] + " Hundred "
  if (num) result += (result ? "and " : "") + twoDigit(num) + " "
  return result.trim() + " Rupees Only"
}

// "Estimate", not "Quotation" — matches Philosan's own client-facing
// terminology (their real sample document is titled "Estimate"), not a term
// they've never used.
const activeDoc = ref("estimate") // 'estimate' | 'client-boq' | 'internal'
const DOCS = [
  { key: "estimate", label: "Client Estimate", icon: "file", desc: "Short summary on letterhead. Client-facing.", file: "estimate" },
  { key: "client-boq", label: "Client BOQ", icon: "layers", desc: "Grouped line-item detail. No internal cost.", file: "boq" },
  { key: "internal", label: "Internal Costing Sheet", icon: "lock", desc: "Full detail + internal costs. Internal only.", file: "internal-costing" },
]

const today = formatDate(new Date().toISOString().slice(0, 10))
const refNo = computed(() => doc.value?.name || "")

// Print still uses the browser's own dialog — genuinely useful on its own
// merits (physical printing, on-screen print preview), not just a PDF
// workaround anymore now that real generation exists below. Browsers seed
// the dialog's suggested filename from document.title, so setting it right
// before print (and restoring on 'afterprint') keeps that path consistent
// with the real download's naming too.
let originalTitle = ""
function restoreTitle() {
  if (originalTitle) document.title = originalTitle
}
onMounted(() => window.addEventListener("afterprint", restoreTitle))
onUnmounted(() => window.removeEventListener("afterprint", restoreTitle))

function printDoc() {
  const active = DOCS.find((d) => d.key === activeDoc.value)
  originalTitle = document.title
  document.title = `${doc.value.name}-${active.file}`
  window.print()
}

// Real server-side generation (plan.md Phase 6): shared costing context +
// Jinja template + get_pdf, same pattern as the working invoice pipeline.
// Opens the generated file in a new tab, same as GenerateInvoiceView's own
// Download PDF.
const downloading = ref(false)
const downloadError = ref(null)
async function downloadPdf() {
  downloading.value = true
  downloadError.value = null
  try {
    const url = await downloadEstimatePdf(doc.value.name, activeDoc.value)
    window.open(url, "_blank")
  } catch (e) {
    downloadError.value = e.messages?.[0] || e.message || "Failed to generate this PDF."
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <p v-if="loading" class="text-center py-20 text-muted">Loading…</p>
  <div v-else-if="error" class="text-center py-16 text-negative bg-negative-soft rounded-xl">{{ error }}</div>

  <div v-else class="max-w-5xl mx-auto space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3 no-print">
      <button class="text-muted hover:text-foreground p-1 rounded-lg hover:bg-surface-muted transition-colors" @click="router.push(`/estimates/${doc.name}`)">
        <AppIcon name="arrowLeft" :size="20" />
      </button>
      <div>
        <h2 class="font-display text-2xl font-semibold text-foreground">Documents — {{ doc.name }}</h2>
        <p class="text-sm text-muted mt-0.5">Preview output documents generated from this estimate.</p>
      </div>
    </div>

    <!-- Doc type tabs -->
    <div class="grid sm:grid-cols-3 gap-3 no-print">
      <button
        v-for="d in DOCS"
        :key="d.key"
        @click="activeDoc = d.key"
        class="flex items-start gap-3 p-4 rounded-xl border text-left transition-all"
        :class="
          activeDoc === d.key
            ? d.key === 'internal'
              ? 'border-negative/40 bg-negative-soft/40'
              : 'border-primary bg-primary-soft'
            : 'border-border bg-surface hover:border-primary/30'
        "
      >
        <div
          class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          :class="activeDoc === d.key ? (d.key === 'internal' ? 'bg-negative/10 text-negative' : 'bg-primary text-primary-foreground') : 'bg-surface-muted text-muted'"
        >
          <AppIcon :name="d.icon" :size="18" />
        </div>
        <div>
          <p class="font-semibold text-foreground text-sm">{{ d.label }}</p>
          <p class="text-xs text-muted mt-0.5">{{ d.desc }}</p>
        </div>
      </button>
    </div>

    <!-- Internal warning banner -->
    <div v-if="activeDoc === 'internal'" class="flex items-center gap-3 px-4 py-3 rounded-xl bg-negative-soft border border-negative/30 text-negative text-sm no-print">
      <AppIcon name="lock" :size="18" class="flex-shrink-0" />
      <span class="font-medium">Internal use only — do not share with clients. This document shows actual costs and profit margins.</span>
    </div>

    <p v-if="downloadError" class="text-sm text-negative bg-negative-soft rounded-lg p-3 no-print">{{ downloadError }}</p>

    <!-- Preview area -->
    <div class="bg-surface border border-border rounded-xl overflow-hidden preview-frame">
      <!-- Preview toolbar -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-muted/30 no-print">
        <span class="text-sm font-medium text-foreground">Preview: {{ DOCS.find((d) => d.key === activeDoc)?.label }}</span>
        <div class="flex items-center gap-2">
          <button @click="printDoc" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-surface-muted transition-colors">
            <AppIcon name="printer" :size="14" /> Print
          </button>
          <button
            @click="downloadPdf"
            :disabled="downloading"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
          >
            <AppIcon name="download" :size="14" /> {{ downloading ? "Generating…" : "Download PDF" }}
          </button>
        </div>
      </div>

      <!-- Print-style document -->
      <div class="p-8 max-w-3xl mx-auto print-area">
        <!-- ============ CLIENT ESTIMATE ============ -->
        <div v-if="activeDoc === 'estimate'" class="space-y-6">
          <div class="flex items-start justify-between pb-5 border-b-2 border-primary">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
                <AppIcon name="sprout" :size="24" class="text-primary-foreground" />
              </div>
              <div>
                <p class="font-display text-lg font-bold text-foreground">Philosan Farm Management LLP</p>
                <p class="text-xs text-muted">VP 8/698A, Kolakkattu, House, Edappal, Kerala, India</p>
                <p class="text-xs text-muted">+91 7441117052 · shihabkv22008@gmail.com</p>
              </div>
            </div>
            <div class="text-right text-sm">
              <p class="font-semibold text-foreground text-lg">ESTIMATE</p>
              <p class="text-muted">Ref: {{ refNo }}</p>
              <p class="text-muted">Date: {{ today }}</p>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">To</p>
              <p class="font-semibold text-foreground">{{ doc.customer || doc.client_name || "—" }}</p>
              <p class="text-muted">{{ doc.location || "—" }}</p>
            </div>
            <div class="space-y-1">
              <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">Project</p>
              <div class="flex justify-between"><span class="text-muted">Category</span><span class="text-foreground">{{ doc.category || "—" }}</span></div>
              <div class="flex justify-between"><span class="text-muted">Area</span><span class="text-foreground">{{ areaLabel(doc) }}</span></div>
              <div class="flex justify-between"><span class="text-muted">Duration</span><span class="text-foreground">{{ doc.duration || "—" }}</span></div>
            </div>
          </div>

          <div class="border border-border rounded-lg overflow-x-auto text-sm">
            <table class="w-full">
              <thead>
                <tr class="bg-primary text-primary-foreground">
                  <th class="text-left font-semibold px-4 py-2.5">Description</th>
                  <th class="text-right font-semibold px-4 py-2.5">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="section in sections" :key="section.name">
                  <td class="px-4 py-2.5 text-foreground">{{ section.name }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums text-foreground font-medium">{{ formatCurrency(sectionSubtotal(section)) }}</td>
                </tr>
                <tr v-for="comp in doc.cost_components" :key="comp.name" class="text-muted">
                  <td class="px-4 py-2.5">{{ comp.component_name }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(comp.amount) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-border font-semibold">
                  <td class="px-4 py-2.5 text-foreground">Sub-Total</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(doc.subtotal_before_tax) }}</td>
                </tr>
                <tr class="text-muted">
                  <td class="px-4 py-2.5">GST ({{ doc.tax_percent }}%)</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(doc.grand_total - doc.subtotal_before_tax) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="rounded-xl bg-primary text-primary-foreground px-5 py-4">
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-lg">Grand Total</span>
              <span class="font-display text-2xl font-bold tabular-nums">{{ formatCurrency(doc.grand_total) }}</span>
            </div>
            <p class="text-xs text-primary-foreground/70 italic">{{ amountInWords(doc.grand_total) }}</p>
          </div>

          <div class="text-xs text-muted space-y-1">
            <p class="font-semibold text-foreground text-sm mb-2">Terms & Conditions</p>
            <p>1. This estimate is valid for 30 days from the date of issue.</p>
            <p>2. Payment terms: 50% advance, 40% at mid-stage, 10% on completion.</p>
            <p>3. Prices are subject to change based on site conditions observed during execution.</p>
            <p>4. GST at {{ doc.tax_percent }}% is applicable on all supplies and services.</p>
          </div>

          <div class="grid grid-cols-2 gap-8 mt-8 pt-6 border-t border-border text-sm">
            <div>
              <p class="text-muted mb-8">For Philosan Farm Management LLP</p>
              <div class="border-t border-foreground/30 pt-1.5">
                <p class="text-muted text-xs">Authorised Signatory</p>
              </div>
            </div>
            <div>
              <p class="text-muted mb-8">Accepted by Client</p>
              <div class="border-t border-foreground/30 pt-1.5">
                <p class="text-muted text-xs">{{ doc.customer || doc.client_name || "—" }} · Date: __________</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ============ CLIENT BOQ ============ -->
        <div v-if="activeDoc === 'client-boq'" class="space-y-5">
          <div class="flex items-start justify-between pb-4 border-b-2 border-primary">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <AppIcon name="sprout" :size="20" class="text-primary-foreground" />
              </div>
              <div>
                <p class="font-display text-lg font-bold text-foreground">Philosan Farm Management LLP</p>
                <p class="text-xs text-muted">Bill of Quantities</p>
              </div>
            </div>
            <div class="text-right text-sm">
              <p class="font-semibold text-foreground">{{ doc.name }}</p>
              <p class="text-muted text-xs">{{ doc.customer || doc.client_name }}</p>
              <p class="text-muted text-xs">{{ today }}</p>
            </div>
          </div>

          <div v-for="section in sections" :key="section.name" class="space-y-2">
            <div class="flex items-center justify-between bg-surface-muted/60 rounded-lg px-4 py-2 section-header">
              <h4 class="font-semibold text-foreground text-sm">{{ section.name }}</h4>
              <span class="text-sm font-semibold tabular-nums text-foreground">{{ formatCurrency(sectionSubtotal(section)) }}</span>
            </div>
            <div class="border border-border rounded-lg overflow-x-auto text-sm">
              <table class="w-full">
                <thead>
                  <tr class="bg-surface-muted/40 border-b border-border text-left">
                    <th class="font-medium text-muted px-4 py-2">Description</th>
                    <th class="font-medium text-muted px-4 py-2 text-right">Qty</th>
                    <th class="font-medium text-muted px-4 py-2">Unit</th>
                    <th class="font-medium text-muted px-4 py-2 text-right">Rate</th>
                    <th class="font-medium text-muted px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(line, li) in section.lines" :key="li">
                    <td class="px-4 py-2.5 text-foreground">{{ line.description }}</td>
                    <td class="px-4 py-2.5 text-right text-muted tabular-nums">{{ line.quantity }}</td>
                    <td class="px-4 py-2.5 text-muted">{{ line.uom }}</td>
                    <td class="px-4 py-2.5 text-right text-muted tabular-nums">{{ formatCurrency(line.rate) }}</td>
                    <td class="px-4 py-2.5 text-right font-medium tabular-nums">{{ formatCurrency(line.amount) }}</td>
                  </tr>
                </tbody>
                <tfoot v-if="section.discount > 0">
                  <tr class="border-t border-border text-warning text-xs">
                    <td class="px-4 py-2" colspan="4">Section discount ({{ section.discount }}%)</td>
                    <td class="px-4 py-2 text-right tabular-nums">−{{ formatCurrency(sectionDiscountAmount(section)) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div class="border border-border rounded-lg overflow-x-auto text-sm">
            <table class="w-full">
              <tbody class="divide-y divide-border">
                <tr class="font-semibold bg-surface-muted/30">
                  <td class="px-4 py-2.5" colspan="4">Cost Subtotal</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(doc.cost_subtotal) }}</td>
                </tr>
                <tr v-for="comp in doc.cost_components" :key="comp.name" class="text-muted">
                  <td class="px-4 py-2.5" colspan="4">{{ comp.component_name }}</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(comp.amount) }}</td>
                </tr>
                <tr class="text-muted">
                  <td class="px-4 py-2.5" colspan="4">GST ({{ doc.tax_percent }}%)</td>
                  <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(doc.grand_total - doc.subtotal_before_tax) }}</td>
                </tr>
                <tr class="font-bold bg-primary/5 border-t-2 border-border">
                  <td class="px-4 py-3 text-foreground" colspan="4">Grand Total</td>
                  <td class="px-4 py-3 text-right tabular-nums text-primary font-display text-lg">{{ formatCurrency(doc.grand_total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ============ INTERNAL COSTING SHEET ============ -->
        <div v-if="activeDoc === 'internal'" class="space-y-5">
          <div class="flex items-start justify-between pb-4 border-b-2 border-negative">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <div class="w-8 h-8 rounded-lg bg-negative/10 flex items-center justify-center">
                  <AppIcon name="lock" :size="16" class="text-negative" />
                </div>
                <span class="font-display text-lg font-bold text-foreground">Internal Costing Sheet</span>
              </div>
              <p class="text-xs text-negative font-medium">CONFIDENTIAL — NOT FOR CLIENT DISTRIBUTION</p>
            </div>
            <div class="text-right text-sm">
              <p class="font-semibold text-foreground">{{ doc.name }}</p>
              <StatusBadge :status="statusLabel" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="bg-surface-muted/60 rounded-lg p-3">
              <p class="text-xs text-muted mb-1">Client</p>
              <p class="font-medium text-foreground">{{ doc.customer || doc.client_name || "—" }}</p>
              <p class="text-muted text-xs">{{ doc.location || "—" }}</p>
            </div>
            <div class="bg-surface-muted/60 rounded-lg p-3 text-xs space-y-1">
              <div class="flex justify-between"><span class="text-muted">Category</span><span class="text-foreground font-medium">{{ doc.category || "—" }}</span></div>
              <div class="flex justify-between"><span class="text-muted">Area</span><span class="text-foreground font-medium">{{ areaLabel(doc) }}</span></div>
              <div class="flex justify-between"><span class="text-muted">Profit</span><span class="text-positive font-semibold">{{ doc.profit_type === "Percent" ? doc.profit_value + "%" : formatCurrency(doc.profit_value) }}</span></div>
            </div>
          </div>

          <div v-for="section in sections" :key="section.name" class="space-y-1">
            <div class="flex items-center justify-between bg-surface-muted/60 rounded-t-lg px-4 py-2 border border-border border-b-0 section-header">
              <h4 class="font-semibold text-foreground text-sm">{{ section.name }}</h4>
            </div>
            <div class="border border-border rounded-b-lg overflow-x-auto print-scroll-fix">
              <table class="w-full text-sm min-w-[640px] internal-table">
                <thead>
                  <tr class="border-b border-border">
                    <th class="font-medium text-muted text-left px-4 py-2">Description</th>
                    <th class="font-medium text-muted text-right px-4 py-2">Qty</th>
                    <th class="font-medium text-muted text-left px-4 py-2">Unit</th>
                    <th class="font-medium text-muted text-right px-4 py-2">Client Rate</th>
                    <th class="font-medium text-muted text-right px-4 py-2">Client Amt</th>
                    <th class="font-medium text-right px-4 py-2 bg-negative-soft/30 text-negative/70 text-[11px]">Int. Rate</th>
                    <th class="font-medium text-right px-4 py-2 bg-negative-soft/30 text-negative/70 text-[11px]">Int. Amt</th>
                    <th class="font-medium text-right px-4 py-2 bg-positive-soft/40 text-positive/70 text-[11px]">Margin</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-border">
                  <tr v-for="(line, li) in section.lines" :key="li" class="hover:bg-surface-muted/20">
                    <td class="px-4 py-2.5 text-foreground">{{ line.description }}</td>
                    <td class="px-4 py-2.5 text-right text-muted tabular-nums">{{ line.quantity }}</td>
                    <td class="px-4 py-2.5 text-muted">{{ line.uom }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums">{{ formatCurrency(line.rate) }}</td>
                    <td class="px-4 py-2.5 text-right font-medium tabular-nums">{{ formatCurrency(line.amount) }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums bg-negative-soft/20 text-negative/80 text-xs">{{ formatCurrency(line.internal_rate) }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums bg-negative-soft/20 text-negative font-semibold text-xs">{{ formatCurrency(line.quantity * line.internal_rate) }}</td>
                    <td class="px-4 py-2.5 text-right tabular-nums bg-positive-soft/30 text-positive font-semibold text-xs">
                      {{ formatCurrency(line.amount - line.quantity * line.internal_rate) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="bg-surface border border-border rounded-xl overflow-hidden text-sm">
            <div class="px-4 py-2.5 bg-surface-muted/40 border-b border-border font-medium text-foreground">Full Costing Sequence</div>
            <dl class="divide-y divide-border">
              <div class="flex justify-between px-4 py-2.5">
                <dt class="text-muted">Cost Subtotal</dt>
                <dd class="tabular-nums font-medium">{{ formatCurrency(doc.cost_subtotal) }}</dd>
              </div>
              <div class="flex justify-between px-4 py-2.5 bg-negative-soft/20">
                <dt class="text-negative/70">Total Internal Cost</dt>
                <dd class="tabular-nums text-negative font-semibold">{{ formatCurrency(internalTotal) }}</dd>
              </div>
              <div v-for="comp in doc.cost_components" :key="comp.name" class="flex justify-between px-4 py-2.5">
                <dt class="text-muted">+ {{ comp.component_name }}</dt>
                <dd class="tabular-nums">{{ formatCurrency(comp.amount) }}</dd>
              </div>
              <div class="flex justify-between px-4 py-2.5">
                <dt class="text-muted">Subtotal Before Profit</dt>
                <dd class="tabular-nums">{{ formatCurrency(doc.subtotal_before_profit) }}</dd>
              </div>
              <div class="flex justify-between px-4 py-2.5">
                <dt class="text-muted">+ Profit</dt>
                <dd class="tabular-nums text-positive font-semibold">{{ formatCurrency(doc.subtotal_before_tax - doc.subtotal_before_profit) }}</dd>
              </div>
              <div class="flex justify-between px-4 py-2.5">
                <dt class="text-muted">+ GST ({{ doc.tax_percent }}%)</dt>
                <dd class="tabular-nums">{{ formatCurrency(doc.grand_total - doc.subtotal_before_tax) }}</dd>
              </div>
              <div class="flex justify-between px-4 py-3 bg-primary/5 font-bold text-base">
                <dt class="text-foreground">Grand Total</dt>
                <dd class="tabular-nums text-primary">{{ formatCurrency(doc.grand_total) }}</dd>
              </div>
              <div class="flex justify-between px-4 py-2.5 bg-positive-soft/40">
                <dt class="text-positive/80">Gross Margin</dt>
                <dd class="tabular-nums text-positive font-bold">{{ formatCurrency(marginValue) }} ({{ marginPct }}%)</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Root cause of the reported cutoff: the app shell reserves 16rem
   (lg:pl-64, App.vue) for the fixed sidebar, and `main` adds its own
   px/py padding on top — both survive into print even though the sidebar
   itself is hidden (global rule in style.css), eating most of a printed
   page's usable width before this document's own content is laid out.
   That global fix handles the shell; the rules below handle this
   document's own containers so nothing here re-introduces a similar
   width/overflow trap. */
@media print {
  .no-print {
    display: none !important;
  }
  .preview-frame {
    border: none !important;
    border-radius: 0 !important;
    overflow: visible !important;
  }
  .print-area {
    max-width: 100% !important;
    width: 100% !important;
    padding: 0 !important;
  }
  /* Horizontal-scroll wrapper on the Internal sheet's 8-column table would
     otherwise only print whatever was scrolled into view — verified this is
     a real print-rendering gotcha for overflow:auto containers, not
     specific to this app. */
  .print-scroll-fix {
    overflow: visible !important;
  }
  .internal-table {
    min-width: 0 !important;
    width: 100% !important;
  }
  /* Multi-page tables (verified against a 5-line BOQ and an 8-column
     Internal sheet): repeat the header row on every page, never split a
     row or a section header across a page break. */
  table {
    page-break-inside: auto;
  }
  thead {
    display: table-header-group;
  }
  tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .section-header {
    page-break-inside: avoid;
    page-break-after: avoid;
    break-inside: avoid;
  }
}
</style>
