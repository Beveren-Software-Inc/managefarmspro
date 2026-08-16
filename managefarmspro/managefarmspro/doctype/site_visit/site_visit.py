# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import os
import random
import time

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, flt, getdate, today
from frappe.utils.pdf import get_pdf

# Same company used by the app's other real Sales Invoice pipeline
# (collated_plot_invoice.py) — not a new constant, just not importable
# cross-module without touching that file.
SITE_VISIT_COMPANY = "Philosan Farm Management"

# Statuses that occupy a scheduled_date for the double-booking rule. Cancelled
# visits free up their date; Completed visits are always in the past by the
# time they reach that status, but included for safety against back-dated data.
ACTIVE_STATUSES_FOR_AVAILABILITY = ["Scheduled", "Visited", "Completed"]


class SiteVisit(Document):
	def validate(self):
		self.validate_not_past_date()
		self.validate_slot()
		self.check_availability()
		self.set_pricing()

	def validate_not_past_date(self):
		"""Only enforced on creation — a Site Visit already scheduled for
		today naturally moves into the past by the time it's Visited/
		Completed, and every later save (inspection notes, status, invoice)
		must still go through, so this can't be a blanket check on every
		save."""
		if self.is_new() and self.scheduled_date and getdate(self.scheduled_date) < getdate(today()):
			frappe.throw(_("Scheduled Date cannot be in the past."))

	def validate_slot(self):
		if not self.scheduled_date:
			return
		labels = get_slot_labels()
		if self.slot not in labels:
			frappe.throw(_("Slot must be one of: {0}").format(", ".join(labels)))

	def check_availability(self):
		"""Up to one Site Visit per slot per date — client feedback after the
		demo was that 2 visits/day is fine as long as they're in different
		slots (whether two far-apart sites are practical same-day is left to
		the user's own judgement, not enforced here). Enforced here so it
		holds regardless of caller (SPA or Desk), not just whatever the SPA's
		calendar happens to show before submit."""
		if not self.scheduled_date or not self.slot:
			return
		conflict = frappe.db.get_value(
			"Site Visit",
			{
				"scheduled_date": self.scheduled_date,
				"slot": self.slot,
				"status": ["in", ACTIVE_STATUSES_FOR_AVAILABILITY],
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if conflict:
			frappe.throw(_("The {0} slot on {1} is already booked by another Site Visit ({2}).").format(self.slot, self.scheduled_date, conflict))

	def set_pricing(self):
		"""Single place base_charge is ever computed — see get_pricing_tier
		below. Expense fields are force-zeroed when the matched tier bundles
		them into the base charge, so that rule holds even if a stale value
		was sent from the client (e.g. distance edited down after an expense
		was already entered)."""
		if not self.distance_km:
			return
		tier = get_pricing_tier(self.distance_km)
		self.distance_tier = tier.tier_label
		self.base_charge = tier.base_charge
		if tier.travel_food_included:
			self.travel_expense = 0
			self.food_expense = 0
		if tier.accommodation_included:
			self.accommodation_expense = 0
		self.total_amount = (
			flt(self.base_charge) + flt(self.travel_expense) + flt(self.food_expense) + flt(self.accommodation_expense)
		)


def get_pricing_tier(distance_km):
	"""Reads Site Visit Settings' admin-configurable pricing_tiers, sorted by
	Max Distance ascending with the unbounded tier (Max Distance == 0) last,
	and returns the first tier the given distance fits under. The one and
	only place base-charge logic is implemented — call this, don't
	reimplement the boundary rule anywhere else."""
	distance_km = flt(distance_km)
	settings = frappe.get_single("Site Visit Settings")
	if not settings.pricing_tiers:
		frappe.throw(_("No pricing tiers configured in Site Visit Settings. Ask a System Manager to set them up."))

	tiers = sorted(settings.pricing_tiers, key=lambda t: t.max_distance_km or float("inf"))
	for tier in tiers:
		if not tier.max_distance_km or distance_km <= tier.max_distance_km:
			return tier
	frappe.throw(_("No pricing tier matches a distance of {0} km.").format(distance_km))


@frappe.whitelist()
def preview_base_charge(distance_km):
	"""Read-only preview for the creation form — same get_pricing_tier() the
	controller itself uses on save, so the number shown before submit can
	never drift from what actually gets saved."""
	tier = get_pricing_tier(distance_km)
	return {
		"distance_tier": tier.tier_label,
		"base_charge": tier.base_charge,
		"travel_food_included": tier.travel_food_included,
		"accommodation_included": tier.accommodation_included,
	}


def get_slots():
	"""Reads Site Visit Settings' admin-configurable slots. A day's capacity
	is simply however many rows are configured here — not a hardcoded 2."""
	settings = frappe.get_single("Site Visit Settings")
	if not settings.slots:
		frappe.throw(_("No daily slots configured in Site Visit Settings. Ask a System Manager to set them up."))
	return settings.slots


def get_slot_labels():
	return [s.slot_label for s in get_slots()]


@frappe.whitelist()
def fetch_slots():
	"""Slot definitions for the creation form's picker."""
	return [{"slot_label": s.slot_label, "start_time": s.start_time, "end_time": s.end_time} for s in get_slots()]


@frappe.whitelist()
def check_date_availability(scheduled_date, exclude=None):
	"""Non-throwing per-slot availability for a date — one row per configured
	slot, for the calendar/creation-form to query before submit."""
	booked = frappe.get_all(
		"Site Visit",
		filters={
			"scheduled_date": scheduled_date,
			"status": ["in", ACTIVE_STATUSES_FOR_AVAILABILITY],
			**({"name": ["!=", exclude]} if exclude else {}),
		},
		fields=["name", "slot"],
	)
	booked_by_slot = {b.slot: b.name for b in booked}
	return [
		{
			"slot_label": s.slot_label,
			"start_time": s.start_time,
			"end_time": s.end_time,
			"available": s.slot_label not in booked_by_slot,
			"conflicting_visit": booked_by_slot.get(s.slot_label),
		}
		for s in get_slots()
	]


# Same existing-vs-prospect duplicate-check UX as Estimate's own
# link_customer (estimate.py) — mirrored here rather than imported, since
# that function is written against an in-progress Estimate doc and isn't a
# generic customer resolver. Site Visit's own customer field is reqd at
# insert (unlike Estimate's, which is set later via link_customer), so this
# has to resolve/create the Customer and create the Site Visit in one call.
@frappe.whitelist()
def create_site_visit(
	site_location,
	distance_km,
	customer=None,
	customer_name=None,
	customer_type=None,
	email_id=None,
	mobile_no=None,
	notes=None,
	preferred_date=None,
	scheduled_date=None,
	slot=None,
	travel_expense=0,
	food_expense=0,
	accommodation_expense=0,
):
	if not customer:
		if not customer_name:
			frappe.throw(_("Provide either an existing customer or a name for a new one"))

		if not (email_id or mobile_no):
			existing = frappe.db.get_value("Customer", {"customer_name": customer_name}, "name")
			if existing:
				return {
					"duplicate": True,
					"existing_customer": existing,
					"message": _(
						"A customer named {0} already exists. Add an email or phone number to create a separate customer, or link to the existing one instead."
					).format(customer_name),
				}

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
		customer = new_customer.name

	doc = frappe.get_doc(
		{
			"doctype": "Site Visit",
			"customer": customer,
			"site_location": site_location,
			"distance_km": distance_km,
			"notes": notes,
			"preferred_date": preferred_date,
			"scheduled_date": scheduled_date,
			"slot": slot,
			"travel_expense": travel_expense or 0,
			"food_expense": food_expense or 0,
			"accommodation_expense": accommodation_expense or 0,
		}
	)
	doc.insert()
	when = f"{scheduled_date} ({slot})" if scheduled_date and slot else scheduled_date or "an unscheduled date"
	doc.add_comment("Info", _("Site Visit requested for {0}.").format(when))
	return doc


# Only the two transitions that have no further gate: Visited (any Scheduled
# visit can be marked visited once the team is on site) and Cancelled (frees
# the scheduled_date immediately — see check_availability). Completed has its
# own guarded mark_completed() below and is never reachable from here.
@frappe.whitelist()
def update_status(site_visit, status, comment=None):
	if status not in ("Visited", "Cancelled"):
		frappe.throw(_("Use the dedicated action for this status change."))
	doc = frappe.get_doc("Site Visit", site_visit)
	doc.status = status
	doc.save()
	doc.add_comment("Info", comment or _("Status changed to {0}.").format(status))
	return doc


@frappe.whitelist()
def add_attachment(site_visit, file_url, caption=None):
	doc = frappe.get_doc("Site Visit", site_visit)
	doc.append("attachments", {"attachment": file_url, "caption": caption})
	doc.save()
	return doc.attachments[-1]


@frappe.whitelist()
def remove_attachment(site_visit, row_name):
	doc = frappe.get_doc("Site Visit", site_visit)
	doc.attachments = [r for r in doc.attachments if r.name != row_name]
	doc.save()


@frappe.whitelist()
def fetch_timeline(site_visit):
	return frappe.get_all(
		"Comment",
		filters={"reference_doctype": "Site Visit", "reference_name": site_visit, "comment_type": "Info"},
		fields=["content", "creation", "owner"],
		order_by="creation asc",
	)


# One Sales Invoice per Site Visit, base charge + each applicable expense as
# its own line item (never one lump sum) so the invoice itself, not just the
# detail page, shows how the total was built. No item_code on the line items
# — same shape collated_plot_invoice.py's own download_invoice_pdf already
# inserts+submits successfully with, this app's Sales Invoice Item doesn't
# require one. Payment recording is deliberately NOT built here — every other
# payment in this app is recorded in Desk, not the SPA, and this follows that
# same precedent; Sales Invoice.status/outstanding_amount are simply read
# live off whatever Desk records.
@frappe.whitelist()
def generate_invoice(site_visit):
	doc = frappe.get_doc("Site Visit", site_visit)
	if doc.sales_invoice:
		frappe.throw(_("An invoice has already been generated for this Site Visit ({0}).").format(doc.sales_invoice))
	if not doc.base_charge:
		frappe.throw(_("This Site Visit has no calculated charge yet."))

	income_account = frappe.db.get_value("Company", SITE_VISIT_COMPANY, "default_income_account")
	if not income_account:
		frappe.throw(_("Please set a default income account for the company {0}.").format(SITE_VISIT_COMPANY))

	items = [
		{
			"item_name": _("Site visit and consultation"),
			"description": doc.site_location,
			"qty": 1,
			"rate": doc.base_charge,
			"amount": doc.base_charge,
			"income_account": income_account,
		}
	]
	for label, amount in (
		(_("Travel Expense"), doc.travel_expense),
		(_("Food Expense"), doc.food_expense),
		(_("Accommodation Expense"), doc.accommodation_expense),
	):
		if amount:
			items.append({"item_name": label, "qty": 1, "rate": amount, "amount": amount, "income_account": income_account})

	sales_invoice = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"customer": doc.customer,
			"company": SITE_VISIT_COMPANY,
			"posting_date": today(),
			"due_date": add_days(today(), 30),
			"set_posting_time": 1,
			"items": items,
		}
	)
	sales_invoice.insert()
	sales_invoice.submit()

	doc.db_set("sales_invoice", sales_invoice.name)
	doc.add_comment(
		"Info",
		_("Invoice {0} generated for {1}.").format(sales_invoice.name, frappe.utils.fmt_money(sales_invoice.grand_total, currency=sales_invoice.currency)),
	)
	return sales_invoice


@frappe.whitelist()
def fetch_invoice_summary(sales_invoice):
	return frappe.db.get_value(
		"Sales Invoice", sales_invoice, ["name", "status", "grand_total", "outstanding_amount", "currency"], as_dict=True
	)


# Same pipeline as estimate_output.py's download_estimate_pdf and
# collated_plot_invoice.py's download_invoice_pdf — render_template -> get_pdf
# -> write to private/files -> File doc -> full URL. NOT frappe's generic
# print_format.download_pdf: this app's default "New SI" print format is
# built for the Work-invoicing flow (its own format_data literally contains
# "Work Name"/"Work Description" field labels), so it renders those as
# leftover placeholder text on any invoice, like a Site Visit's, that doesn't
# populate those Work-specific fields. site_visit_invoice.html is this app's
# own dedicated template for this document type, same as every other output
# document already has one.
@frappe.whitelist()
def download_invoice_pdf(site_visit):
	doc = frappe.get_doc("Site Visit", site_visit)
	if not doc.sales_invoice:
		frappe.throw(_("No invoice has been generated for this Site Visit yet."))
	invoice = frappe.get_doc("Sales Invoice", doc.sales_invoice)

	context = {
		"invoice": invoice,
		"site_visit": doc,
		"received": flt(invoice.grand_total) - flt(invoice.outstanding_amount),
		"amount_in_words": frappe.utils.money_in_words(invoice.grand_total),
	}
	html = frappe.render_template("managefarmspro/templates/site_visit_invoice.html", context)
	pdf_file = get_pdf(html)

	request = frappe.request
	host = request.headers.get("Host")
	forwarded_proto = request.headers.get("X-Forwarded-Proto", "http")
	original_host = request.headers.get("X-Forwarded-Host", host)
	base_url = f"{forwarded_proto}://{original_host}"

	timestamp = int(time.time())
	random_number = random.randint(1000, 9999)
	file_name = f"{invoice.name}-{timestamp}{random_number}.pdf"

	file_path = f"private/files/{file_name}"
	full_file_path = frappe.get_site_path(file_path)
	os.makedirs(os.path.dirname(full_file_path), exist_ok=True)
	with open(full_file_path, "wb") as f:
		f.write(pdf_file)

	file_doc = frappe.get_doc(
		{
			"doctype": "File",
			"file_name": file_name,
			"file_url": f"/private/files/{file_name}",
			"attached_to_doctype": "Sales Invoice",
			"attached_to_name": invoice.name,
			"is_private": 1,
		}
	)
	file_doc.insert(ignore_permissions=True)

	return f"{base_url}{file_doc.file_url}"
