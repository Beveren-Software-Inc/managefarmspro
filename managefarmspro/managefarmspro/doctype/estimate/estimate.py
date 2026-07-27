# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class Estimate(Document):
	pass


# Customer/Plot linking is deliberately NOT wired to on_submit (or any
# doc_event) — Approve should only ever mean "docstatus 0 -> 1", with zero
# side effects on a plain Desk Submit. Linking is its own explicit action,
# callable independently from the SPA (as an Approve-time convenience, or
# any time after) or from Desk (see estimate.js's "Link Customer" button) —
# one server-side source of truth either way.
#
# `customer`/`plot` are allow_on_submit fields (see estimate.json) precisely
# so this can also be called against an already-Approved Estimate — without
# that flag, doc.save() below raises UpdateAfterSubmitError (confirmed live).
#
# ERPNext's own Customer autoname does NOT error on a duplicate
# customer_name — it silently renames the new record to "X - 1" (confirmed
# live: creating a second "Aashish kumar" produced "Aashish kumar - 1" with
# no error at all). So the only place a duplicate can be caught is here,
# before insert — and only when there's no other way to tell two same-named
# customers apart. Returning a `duplicate` payload (not frappe.throw) so the
# caller gets a normal, structured response to build a "use existing
# instead" affordance from, rather than parsing a thrown error message.
@frappe.whitelist()
def link_customer(estimate, customer=None, customer_name=None, customer_type=None, email_id=None, mobile_no=None):
	doc = frappe.get_doc("Estimate", estimate)
	if customer:
		if not frappe.db.exists("Customer", customer):
			frappe.throw(_("Customer {0} does not exist").format(customer))
		doc.customer = customer
		doc.save()
		return {"customer": doc.customer}

	if not customer_name:
		frappe.throw(_("Provide either an existing customer or a name for a new one"))

	if not (email_id or mobile_no):
		existing = frappe.db.get_value("Customer", {"customer_name": customer_name}, "name")
		if existing:
			return {
				"duplicate": True,
				"existing_customer": existing,
				"message": _("A customer named {0} already exists. Add an email or phone number to create a separate customer, or link to the existing one instead.").format(customer_name),
			}

	# mobile_no/email_id are Read Only fields on Customer (fetched from its
	# primary Contact) but are still settable on insert — Customer.on_update
	# -> create_primary_contact() picks them up and creates the Contact
	# itself. Same mechanism Desk's own Customer quick-entry uses, not a
	# workaround.
	new_customer = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": customer_name,
			"customer_type": customer_type or "Individual",
			"email_id": email_id,
			"mobile_no": mobile_no,
		}
	)
	new_customer.insert()
	doc.customer = new_customer.name
	doc.save()
	return {"customer": doc.customer}


# Link-only against an existing Plot.
@frappe.whitelist()
def link_plot(estimate, plot):
	if not frappe.db.exists("Plot", plot):
		frappe.throw(_("Plot {0} does not exist").format(plot))
	doc = frappe.get_doc("Estimate", estimate)
	doc.plot = plot
	doc.save()
	return {"plot": doc.plot}


# There's no rule for which Cluster a brand-new Plot should get automatically
# — that's exactly why auto-creating one at Approve time was never built (see
# link_customer's history). This form asks the user for it directly instead
# of guessing. Customer is deliberately NOT a parameter here — it's always
# the Estimate's own already-linked `doc.customer`, never re-selectable from
# this form, so a Plot can't accidentally get created for the wrong Customer.
# Budget/supervision fields are left at 0 — real values get set from the
# Plot's own detail page once maintenance work actually starts against it.
@frappe.whitelist()
def create_plot_and_link(estimate, plot_name, area, units, cluster):
	doc = frappe.get_doc("Estimate", estimate)
	if not doc.customer:
		frappe.throw(_("Link a Customer before creating a Plot for this Estimate."))
	if not frappe.db.exists("Cluster", cluster):
		frappe.throw(_("Cluster {0} does not exist").format(cluster))

	plot = frappe.get_doc(
		{
			"doctype": "Plot",
			"plot_name": plot_name,
			"area": area,
			"units": units,
			"cluster": cluster,
			"customer_name": doc.customer,
			"supervision_charge": 0,
			"monthly_maintenance_budget": 0,
		}
	)
	plot.insert()
	doc.plot = plot.name
	doc.save()
	return {"plot": doc.plot}


# Hard enforcement point for the Customer/Plot (and Approved-status)
# requirement — checked here, server-side, so it holds regardless of caller
# (SPA or Desk), not just whatever the SPA's UI happens to check before
# showing the button. The docstatus check was missing until writing tests
# for this function surfaced that a Draft Estimate could be "converted" too
# — caught before it shipped, not found live.
@frappe.whitelist()
def convert_to_project(estimate):
	doc = frappe.get_doc("Estimate", estimate)
	if doc.docstatus != 1:
		frappe.throw(_("Only an Approved Estimate can be converted to a Project."))
	if not doc.customer:
		frappe.throw(_("Link a Customer before converting this Estimate to a Project."))
	if not doc.plot:
		frappe.throw(_("Link a Plot before converting this Estimate to a Project."))
	project = frappe.get_doc(
		{
			"doctype": "Farm Project",
			"estimate": doc.name,
			"customer": doc.customer,
			"plot": doc.plot,
			"category": doc.category,
			"status": "Active",
		}
	)
	project.insert()
	return project


# Replaces a hand-copied field list on the frontend (client_name, customer,
# plot, line_items, ... one by one) — fragile, since every new Estimate field
# needed a matching manual edit here or amend would silently drop it.
# frappe.copy_doc() is Frappe's own copy utility: copies every field
# including child tables and strips system fields (name/owner/creation/...)
# automatically — the same mechanism Desk's own Amend button relies on.
# Nothing to keep in sync by hand as the schema grows.
#
# Copy BEFORE cancel, and set docstatus explicitly rather than relying on
# copy_doc to clear it: copy_doc only clears docstatus when
# frappe.flags.in_test is falsy (a test-suite-only quirk in Frappe itself).
# Copying after doc.cancel() carries the just-cancelled docstatus (2) onto
# the new doc under `bench run-tests`, which then fails Frappe's own
# 0->2 DocstatusTransitionError on insert — caught by this function's own
# test, not found live (outside tests, cancel-then-copy happened to work
# because copy_doc's own clearing masked the ordering bug).
@frappe.whitelist()
def amend_estimate(estimate):
	doc = frappe.get_doc("Estimate", estimate)
	new_doc = frappe.copy_doc(doc)
	new_doc.amended_from = doc.name
	new_doc.docstatus = 0
	doc.cancel()
	new_doc.insert()
	return new_doc


# Single round trip for the Estimate + whether a Farm Project already links
# back to it — replaces the fetchEstimateDetail + fetchLinkedProject pair
# every load site used to make separately.
@frappe.whitelist()
def get_estimate_detail(estimate):
	doc = frappe.get_doc("Estimate", estimate)
	result = doc.as_dict()
	result["linked_project"] = frappe.db.get_value("Farm Project", {"estimate": estimate}, ["name", "status"], as_dict=True)
	return result
