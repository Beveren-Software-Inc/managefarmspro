# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_to_date, now_datetime


# Server-computed cutoff (not a client-computed one) so this never drifts
# with a browser/server clock or timezone mismatch — same discipline as Site
# Visit's own availability checks. Converted-detection mirrors
# get_estimate_detail's own check (existence of a linked Farm Project).
@frappe.whitelist()
def get_estimates_awaiting_action(days=7):
	cutoff = add_to_date(now_datetime(), days=-int(days))
	converted = set(frappe.get_all("Farm Project", pluck="estimate"))
	rows = frappe.get_all(
		"Estimate",
		filters={"docstatus": 1, "approved_on": ["<=", cutoff]},
		fields=["name", "customer", "client_name", "approved_on"],
		order_by="approved_on asc",
	)
	return [r for r in rows if r.name not in converted][:5]
