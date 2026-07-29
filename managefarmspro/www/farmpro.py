from urllib.parse import urlencode

import frappe
import frappe.sessions

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.redirect(f"/login?{urlencode({'redirect-to': frappe.request.path})}")

	csrf_token = frappe.sessions.get_csrf_token()
	frappe.db.commit()

	context.no_cache = 1
	context.csrf_token = csrf_token
	context.user = frappe.session.user
	context.user_fullname = frappe.utils.get_fullname(frappe.session.user)
	context.user_roles = frappe.get_roles(frappe.session.user)

	return context
