# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ProjectCategory(Document):
	pass


# Mirrors amend_estimate's exact pattern (estimate.py) — frappe.copy_doc()
# copies every field including both child tables (Category Template
# Item/Activity) and strips system fields automatically, same mechanism
# Desk's own Amend/Duplicate rely on. Pre-checks the name collision with a
# friendly message rather than letting the raw DuplicateEntryError surface —
# category_name IS the doc's name (autoname: field:category_name), so a
# collision is a plain unique-constraint violation, not a real edge case to
# special-case around.
@frappe.whitelist()
def clone_category_template(source, new_category_name):
	if frappe.db.exists("Project Category", new_category_name):
		frappe.throw(_("A category named {0} already exists.").format(new_category_name))
	doc = frappe.get_doc("Project Category", source)
	new_doc = frappe.copy_doc(doc)
	new_doc.category_name = new_category_name
	new_doc.insert()
	return new_doc
