// Minimal Frappe RPC client — POSTs to a whitelisted method and unwraps
// `message`. Same contract as frappe-ui's `call()`, kept in-house because
// importing frappe-ui's package barrel drags in its whole Vue component
// library (and their icon build step) just for this one utility.
export async function call(method, args = {}) {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      "X-Frappe-CSRF-Token": window.csrf_token || "",
    },
    body: JSON.stringify(args),
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const messages = body._server_messages ? JSON.parse(body._server_messages) : []
    const error = new Error(body.exception || body._error_message || res.statusText)
    error.messages = messages.length ? messages : [body._error_message || res.statusText]
    throw error
  }

  return body.message
}
