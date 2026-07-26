import os
import time
import random

import frappe
from frappe import _
from frappe.utils.pdf import get_pdf

# Same pattern as the real, working invoice pipeline
# (report/collated_plot_invoice/collated_plot_invoice.py's download_invoice_pdf):
# render_template -> get_pdf -> write to private/files -> File doc -> return
# a full URL. Mirrored deliberately rather than inventing a new mechanism.

DOC_TEMPLATES = {
	"estimate": ("client_estimate.html", "estimate"),
	"client-boq": ("client_boq.html", "boq"),
	"internal": ("internal_costing_sheet.html", "internal-costing"),
}


def fmt_num(value):
	"""Whole numbers print without a trailing .0 (3, not 3.0); anything with
	a real fractional part keeps up to 2 decimals, trimmed of trailing
	zeros. Python's default float repr always shows "3.0" for a whole
	float — this is the one thing JS's Vue preview never needed, since JS
	number-to-string already drops trailing .0 on its own."""
	if value is None:
		return "0"
	value = float(value)
	if value == int(value):
		return str(int(value))
	return f"{value:.2f}".rstrip("0").rstrip(".")


def get_estimate_costing_context(estimate_name):
	"""Shared context for all three Estimate output documents — grouped/
	subtotaled line items, cost components, and the internal margin figures.
	Every rollup total (cost_subtotal, subtotal_before_profit,
	subtotal_before_tax, grand_total) is read directly off the doc, never
	recomputed here — same principle as the frontend preview (Builder is the
	only place that ever computes the costing sequence itself)."""
	doc = frappe.get_doc("Estimate", estimate_name)

	sections = []
	by_name = {}
	for li in doc.line_items:
		key = li.section or "General"
		if key not in by_name:
			by_name[key] = {"name": key, "discount": 0, "lines": []}
			sections.append(by_name[key])
		by_name[key]["lines"].append(li)
	for sd in doc.section_discounts:
		if sd.section not in by_name:
			by_name[sd.section] = {"name": sd.section, "discount": 0, "lines": []}
			sections.append(by_name[sd.section])
		by_name[sd.section]["discount"] = sd.discount_percent or 0

	for s in sections:
		gross = sum((l.amount or 0) for l in s["lines"])
		discount_amount = round(gross * (s["discount"] or 0) / 100)
		s["gross"] = gross
		s["discount_amount"] = discount_amount
		s["subtotal"] = gross - discount_amount

	internal_total = sum((li.quantity or 0) * (li.internal_rate or 0) for li in doc.line_items)
	cost_subtotal = doc.cost_subtotal or 0
	margin_value = cost_subtotal - internal_total
	margin_pct = round((margin_value / cost_subtotal) * 100) if cost_subtotal else 0

	has_project = bool(frappe.db.exists("Farm Project", {"estimate": estimate_name}))

	return {
		"doc": doc,
		"sections": sections,
		"internal_total": internal_total,
		"margin_value": margin_value,
		"margin_pct": margin_pct,
		"has_project": has_project,
		"today": frappe.utils.formatdate(frappe.utils.today()),
		"fmt_num": fmt_num,
	}


@frappe.whitelist()
def download_estimate_pdf(estimate, doc_type):
	if doc_type not in DOC_TEMPLATES:
		frappe.throw(_("Unknown document type: {0}").format(doc_type))
	template_file, file_suffix = DOC_TEMPLATES[doc_type]

	context = get_estimate_costing_context(estimate)
	html = frappe.render_template(f"managefarmspro/templates/{template_file}", context)
	pdf_file = get_pdf(html)

	request = frappe.request
	host = request.headers.get("Host")
	forwarded_proto = request.headers.get("X-Forwarded-Proto", "http")
	original_host = request.headers.get("X-Forwarded-Host", host)
	base_url = f"{forwarded_proto}://{original_host}"

	timestamp = int(time.time())
	random_number = random.randint(1000, 9999)
	file_name = f"{estimate}-{file_suffix}-{timestamp}{random_number}.pdf"

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
			"attached_to_doctype": "Estimate",
			"attached_to_name": estimate,
			"is_private": 1,
		}
	)
	file_doc.insert(ignore_permissions=True)

	return f"{base_url}{file_doc.file_url}"
