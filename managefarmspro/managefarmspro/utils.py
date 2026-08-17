# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import os
import random
import time

import frappe
from frappe.utils.pdf import get_pdf


def save_pdf_and_get_url(html, filename_prefix, attached_to_doctype=None, attached_to_name=None):
	"""Shared render_template output -> get_pdf -> private File -> full URL
	pipeline — same mechanism as every generated document in this app
	(Estimate outputs, Collated Plot Invoice, Site Visit invoice/reports).
	Not Frappe's generic print_format.download_pdf: this app's own Print
	Formats are built for specific existing flows (e.g. "New SI" carries
	Work-invoicing-specific field labels) and aren't safe to reuse generically."""
	pdf_file = get_pdf(html)

	request = frappe.request
	host = request.headers.get("Host")
	forwarded_proto = request.headers.get("X-Forwarded-Proto", "http")
	original_host = request.headers.get("X-Forwarded-Host", host)
	base_url = f"{forwarded_proto}://{original_host}"

	timestamp = int(time.time())
	random_number = random.randint(1000, 9999)
	file_name = f"{filename_prefix}-{timestamp}{random_number}.pdf"

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
			"attached_to_doctype": attached_to_doctype,
			"attached_to_name": attached_to_name,
			"is_private": 1,
		}
	)
	file_doc.insert(ignore_permissions=True)

	return f"{base_url}{file_doc.file_url}"
