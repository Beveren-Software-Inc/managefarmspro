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
    // _server_messages is JSON-encoded TWICE over the wire — a JSON array
    // whose entries are themselves JSON-encoded `{message, title, indicator}`
    // objects (Frappe's own frappe.msgprint wire format). Parsing only the
    // outer layer leaves raw `{"message": "...", ...}` strings as the
    // "error message" shown to the user — confirmed live, this was exactly
    // what surfaced as a raw JSON dump for a real duplicate-customer error.
    let messages = []
    if (body._server_messages) {
      try {
        messages = JSON.parse(body._server_messages)
          .map((m) => {
            try {
              return JSON.parse(m).message
            } catch {
              return m
            }
          })
          .filter(Boolean)
      } catch {
        messages = []
      }
    }
    const error = new Error(body.exception || body._error_message || res.statusText)
    error.messages = messages.length ? messages : [body._error_message || res.statusText]
    throw error
  }

  return body.message
}
