import frappe
from frappe.model.document import Document
from frappe.utils import get_first_day, get_last_day, getdate


class Plot(Document):
	def onload(self):
		"""Displays current spending for the month — no DB writes."""
		total_spent = self._calculate_current_month_spending()
		self.total_amount_spent = total_spent
		if self.monthly_maintenance_budget:
			self.maintenance_balance = self.monthly_maintenance_budget - total_spent

	def _calculate_current_month_spending(self):
		"""Pure calculation — returns total spending for the current month. No DB writes."""
		current_date = getdate()
		month_start = get_first_day(current_date)
		month_end = get_last_day(current_date)

		if self.use_fixed_supervision_charge and self.fixed_supervision_charge:
			# Fixed charge: sum raw work costs then add the flat supervision amount
			total_works_cost = frappe.db.sql(
				"""
				SELECT COALESCE(SUM(total_cost), 0)
				FROM tabWork
				WHERE plot = %s
				AND docstatus = 1
				AND work_date BETWEEN %s AND %s
				""",
				(self.name, month_start, month_end),
			)[0][0]
			return total_works_cost + (self.fixed_supervision_charge or 0)
		else:
			# Percentage charge: add supervision % on top of each work's cost
			return frappe.db.sql(
				"""
				SELECT COALESCE(SUM(total_cost + (total_cost * %s / 100)), 0)
				FROM tabWork
				WHERE plot = %s
				AND docstatus = 1
				AND work_date BETWEEN %s AND %s
				""",
				(self.supervision_charge or 0, self.name, month_start, month_end),
			)[0][0]

	def update_current_month_spending(self):
		"""Recalculates and persists monthly spending to DB. Call after work submit/cancel."""
		total_spent = self._calculate_current_month_spending()
		self.db_set("total_amount_spent", total_spent, update_modified=False)
		if self.monthly_maintenance_budget:
			self.db_set(
				"maintenance_balance", self.monthly_maintenance_budget - total_spent, update_modified=False
			)

	def validate(self):
		# Enforce mutual exclusivity between the two supervision charge types
		if self.use_fixed_supervision_charge:
			self.supervision_charge = 0
		else:
			self.fixed_supervision_charge = 0

		# Sync maintenance_balance when monthly_maintenance_budget changes
		if self.has_value_changed("monthly_maintenance_budget"):
			self.maintenance_balance = self.monthly_maintenance_budget

		# Only proceed with maintenance checks if budget is set
		if self.monthly_maintenance_budget:
			self.check_monthly_reset()

	def before_insert(self):
		if self.monthly_maintenance_budget:
			# Initialize maintenance balance with budget amount for new plots
			self.maintenance_balance = self.monthly_maintenance_budget
			self.total_amount_spent = 0
			self.last_maintenance_reset = get_first_day(getdate())

	def check_monthly_reset(self):
		if not self.monthly_maintenance_budget:
			return

		current_date = getdate()
		month_start = get_first_day(current_date)
		last_reset_date = self.get("last_maintenance_reset") or month_start

		if getdate(last_reset_date) < month_start:
			# First reset values for new month
			self.db_set("maintenance_balance", self.monthly_maintenance_budget, update_modified=False)
			self.db_set("total_amount_spent", 0, update_modified=False)
			self.db_set("last_maintenance_reset", month_start, update_modified=False)

			# Then update with any spending in current month
			self.update_current_month_spending()

	def before_save(self):
		# Capture the old cluster value before it's modified during the update
		self.previous_cluster_name = frappe.db.get_value("Plot", self.name, "cluster_name", cache=False)

	def on_update(self):
		# Handle updates to the Plot and corresponding Cluster
		if self.previous_cluster_name and self.previous_cluster_name != self.cluster_name:
			self.remove_from_previous_cluster(self.previous_cluster_name)

		# self.update_owner_plot_list()
		self.update_customer_plot_list()
		self.update_cluster_plots()

	def remove_from_previous_cluster(self, previous_cluster_name):
		"""Remove this plot from the previous cluster's plots child table."""
		if frappe.db.exists("Cluster", previous_cluster_name):
			frappe.db.delete(
				"link plot cluster",
				{"parent": previous_cluster_name, "parenttype": "Cluster", "plot": self.name},
			)
		else:
			frappe.log_error(
				f"Previous Cluster {previous_cluster_name} not found for Plot {self.name}",
				"Remove from Old Cluster Error",
			)

	def update_customer_plot_list(self):
		"""Update this plot's row in the Customer's plot_list child table."""
		customer_name = self.customer_name
		if not customer_name:
			return

		if not frappe.db.exists("Customer", customer_name):
			frappe.log_error(
				f"Customer {customer_name} not found while creating/updating Plot {self.name}",
				"Populate Plot List Error",
			)
			return

		row_filters = {"parent": customer_name, "plot": self.name}
		update_fields = {
			"plot_name": self.plot_name,
			"plot_area": self.area,
			"cluster": self.cluster,
		}

		if frappe.db.exists("link plot owner", row_filters):
			frappe.db.set_value("link plot owner", row_filters, update_fields)
		else:
			frappe.get_doc({
				"doctype": "link plot owner",
				"plot": self.name,
				"parent": customer_name,
				"parentfield": "plot_list",
				"parenttype": "Customer",
				**update_fields,
			}).insert()

	def update_cluster_plots(self):
		"""Update this plot's row in the Cluster's plots child table."""
		cluster_name = self.cluster_name
		if not cluster_name:
			return

		if not frappe.db.exists("Cluster", cluster_name):
			frappe.msgprint(f"Error: New cluster {cluster_name} does not exist.")
			frappe.log_error(
				f"Cluster {cluster_name} not found while creating/updating Plot {self.name}",
				"Populate Plots Error",
			)
			return

		row_filters = {"parent": cluster_name, "plot": self.name}
		update_fields = {
			"plot_name": self.plot_name,
			"plot_area": self.area,
			"units": self.units,
		}

		if frappe.db.exists("link plot cluster", row_filters):
			frappe.db.set_value("link plot cluster", row_filters, update_fields)
		else:
			frappe.get_doc({
				"doctype": "link plot cluster",
				"plot": self.name,
				"parent": cluster_name,
				"parentfield": "plots",
				"parenttype": "Cluster",
				**update_fields,
			}).insert()
