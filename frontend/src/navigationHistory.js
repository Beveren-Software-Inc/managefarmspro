import { ref } from "vue"

// In-memory only, deliberately — a hard refresh/direct URL load/new tab
// should have no "real" previous in-app page to return to, and wiping on
// reload is exactly what makes that fall through to BackButton's `fallback`
// prop correctly, with no extra logic needed.
const MAX_ENTRIES = 20
export const historyStack = ref([])

export function recordVisit(route) {
  const last = historyStack.value[historyStack.value.length - 1]
  if (last && last.path === route.fullPath) return
  historyStack.value.push({
    path: route.fullPath,
    title: route.meta?.title || "",
    id: typeof route.params?.id === "string" ? route.params.id : null,
  })
  if (historyStack.value.length > MAX_ENTRIES) historyStack.value.shift()
}

// The entry just before the current page — what a Back button should
// display/target. Read-only peek, doesn't mutate the stack.
export function peekPrevious() {
  if (historyStack.value.length < 2) return null
  return historyStack.value[historyStack.value.length - 2]
}

// Called at the moment of actually navigating back: drops the current page's
// entry so the stack reflects reality once the navigation completes (the
// router's own afterEach will push the destination back on right after).
export function popAndGetPrevious() {
  if (historyStack.value.length < 2) return null
  historyStack.value.pop()
  return historyStack.value[historyStack.value.length - 1]
}
