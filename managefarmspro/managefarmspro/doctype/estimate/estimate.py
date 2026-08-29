# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import math

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


def round_half_up(value):
	# Python's round() is banker's rounding (round(2.5) == 2) - the frontend
	# preview (EstimateBuilderView.vue's `calc`) uses JS's Math.round, which
	# always rounds .5 away from zero. Using plain round() here would let the
	# server-computed total silently drift by a rupee from what the Builder
	# screen just showed the user for the same numbers. All values here are
	# non-negative money amounts.
	return math.floor(flt(value) + 0.5)


class Estimate(Document):
	def validate(self):
		self.calculate_totals()

	def calculate_totals(self):
		# Every rollup total (cost_subtotal, subtotal_before_profit,
		# subtotal_before_tax, grand_total) and each cost component's `amount`
		# used to be trusted verbatim from whatever the client sent - and a
		# frontend bug once shipped brand-new Estimates with correct line
		# items but these fields silently dropped from the create payload,
		# so they saved as 0 while the line items themselves were fine
		# (confirmed live: a real Estimate had correct per-section subtotals
		# but cost_subtotal/grand_total stuck at 0 on the generated PDF).
		# Recomputing here from the real inputs (line items, section
		# discounts, cost component rates, profit/tax settings) on every
		# save closes that whole class of bug for good - these fields can
		# never again diverge from what the line items actually say,
		# regardless of what any future client payload does or doesn't send.
		# Mirrors EstimateBuilderView.vue's `calc` computed property exactly.
		section_discount_pct = {sd.section: (sd.discount_percent or 0) for sd in self.section_discounts}

		section_gross = {}
		for li in self.line_items:
			section = li.section or "General"
			section_gross[section] = section_gross.get(section, 0) + flt(li.amount)

		cost_subtotal = 0
		for section, gross in section_gross.items():
			discount_amount = round_half_up(gross * section_discount_pct.get(section, 0) / 100)
			cost_subtotal += gross - discount_amount

		for c in self.cost_components:
			c.amount = round_half_up(cost_subtotal * flt(c.value) / 100) if c.charge_type == "Percent" else flt(c.value)

		components_total = sum(flt(c.amount) for c in self.cost_components)
		subtotal_before_profit = cost_subtotal + components_total

		if self.profit_type == "Fixed":
			profit = flt(self.profit_value)
		else:
			profit = round_half_up(subtotal_before_profit * flt(self.profit_value) / 100)

		subtotal_before_tax = subtotal_before_profit + profit
		tax = round_half_up(subtotal_before_tax * flt(self.tax_percent) / 100)
		grand_total = subtotal_before_tax + tax

		self.cost_subtotal = cost_subtotal
		self.subtotal_before_profit = subtotal_before_profit
		self.subtotal_before_tax = subtotal_before_tax
		self.grand_total = grand_total

	def on_submit(self):
		# db_set, not self.approved_on = ...; on_submit runs after the doc is
		# already saved for this transition, so this needs its own targeted
		# write rather than relying on another full save().
		self.db_set("approved_on", now_datetime())


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
	# Mirrors the frontend's canAmend computed (`!linkedProject.value`) — but
	# that's a UI-only gate; confirmed live that calling this function directly
	# bypasses it entirely, cancelling an Estimate a real Farm Project still
	# points to with nothing to catch it (Farm Project isn't submittable, so
	# Frappe's own submitted-linked-doc check never triggers). Enforced here so
	# it holds regardless of caller, same principle as convert_to_project's own
	# docstatus/customer/plot guards above.
	if frappe.db.exists("Farm Project", {"estimate": doc.name}):
		frappe.throw(_("This Estimate has already been converted to a Project and can no longer be revised."))
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
