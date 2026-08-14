# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class FarmProject(Document):
	def validate(self):
		# cost_balance is stored (not a formula field, same as Plot's
		# maintenance_balance) so it stays correct any time this doc is saved
		# directly — not just when Work's update_farm_project_totals() writes
		# actual_cost via db_set, which bypasses validate entirely.
		self.cost_balance = (self.estimated_cost or 0) - (self.actual_cost or 0)
