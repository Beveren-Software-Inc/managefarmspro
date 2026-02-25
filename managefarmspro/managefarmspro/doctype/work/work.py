import frappe
from frappe.model.document import Document
from frappe.utils import get_first_day, get_last_day, getdate


class Work(Document):
	def validate(self):
		if self.plot:
			plot_doc = frappe.get_doc("Plot", self.plot)

			# Only proceed with maintenance checks if plot has budget
			if plot_doc.monthly_maintenance_budget:
				# Check and apply monthly reset if needed (uses db_set only, no cascade)
				plot_doc.check_monthly_reset()

				# Re-read fresh values from DB after potential reset
				self.monthly_maintenance_budget = frappe.db.get_value(
					"Plot", self.plot, "monthly_maintenance_budget"
				)
				self.maintenance_balance = frappe.db.get_value(
					"Plot", self.plot, "maintenance_balance"
				)

	def on_submit(self):
		self.update_plot_totals()

	def on_cancel(self):
		self.update_plot_totals()

	def update_plot_totals(self):
		if self.plot:
			plot_details = frappe.db.get_value(
				"Plot",
				self.plot,
				[
					"monthly_maintenance_budget",
					"use_fixed_supervision_charge",
					"supervision_charge",
					"fixed_supervision_charge",
				],
				as_dict=True,
			)

			# Skip if no maintenance budget is set
			if not plot_details or not plot_details.monthly_maintenance_budget:
				return

			current_date = getdate()
			month_start = get_first_day(current_date)
			month_end = get_last_day(current_date)

			if plot_details.use_fixed_supervision_charge:
				# Fixed charge: sum raw work costs then add the flat supervision amount
				total_works_cost = frappe.db.sql(
					"""
                    SELECT COALESCE(SUM(total_cost), 0)
                    FROM tabWork
                    WHERE plot = %s
                    AND docstatus = 1
                    AND work_date BETWEEN %s AND %s
                    """,
					(self.plot, month_start, month_end),
				)[0][0]
				total_spent = total_works_cost + (plot_details.fixed_supervision_charge or 0)
			else:
				# Percentage charge
				total_spent = frappe.db.sql(
					"""
                    SELECT COALESCE(SUM(total_cost + (total_cost * %s / 100)), 0)
                    FROM tabWork
                    WHERE plot = %s
                    AND docstatus = 1
                    AND work_date BETWEEN %s AND %s
                    """,
					(plot_details.supervision_charge or 0, self.plot, month_start, month_end),
				)[0][0]

			# Update Plot document fields
			frappe.db.set_value(
				"Plot",
				self.plot,
				{
					"total_amount_spent": total_spent,
					"maintenance_balance": plot_details.monthly_maintenance_budget - total_spent,
				},
				update_modified=False,
			)

			# Publish realtime update
			frappe.publish_realtime(
				"plot_updated",
				{
					"plot_name": self.plot,
					"total_amount_spent": total_spent,
					"maintenance_balance": plot_details.monthly_maintenance_budget - total_spent,
				},
				doctype="Plot",
				docname=self.plot,
				after_commit=True,
			)


@frappe.whitelist()
def get_plot_balances(plot):
	"""Get the current maintenance budget and balance for a plot"""
	plot_doc = frappe.get_doc("Plot", plot)

	if not plot_doc.monthly_maintenance_budget:
		return {"monthly_maintenance_budget": 0, "maintenance_balance": 0}

	# Check and apply monthly reset if needed (uses db_set only, no cascade)
	plot_doc.check_monthly_reset()

	# Re-read fresh values from DB after potential reset
	fresh = frappe.db.get_value(
		"Plot",
		plot,
		["monthly_maintenance_budget", "maintenance_balance"],
		as_dict=True,
	)
	return {
		"monthly_maintenance_budget": fresh.monthly_maintenance_budget,
		"maintenance_balance": fresh.maintenance_balance,
	}


# Function to calculate total cost based on child tables
def calculate_total_cost(doc, method):
	total_cost = sum(
		(row.total_price or 0)
		for table in [doc.equipment_table, doc.material_table, doc.labor_table]
		if table
		for row in table
	)
	doc.db_set("total_cost", total_cost, update_modified=False)


# Function to update the Work Child table in the Plot and Cluster Doctypes
def update_work_child(doc, method):
	"""Update Work Child rows in both Plot (work_details) and Cluster (table_bcjd)."""
	work_fields = {
		"work_name": doc.work_type_name,
		"work_date": doc.work_date,
		"status": {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(doc.docstatus, "Unknown"),
		"total_cost": doc.total_cost,
	}

	# --- Update/insert in Plot's work_details ---
	if frappe.db.exists("Work Child", {"parent": doc.plot, "work_id": doc.name}):
		frappe.db.set_value(
			"Work Child", {"parent": doc.plot, "work_id": doc.name}, work_fields
		)
	else:
		frappe.get_doc({
			"doctype": "Work Child",
			"work_id": doc.name,
			"parent": doc.plot,
			"parentfield": "work_details",
			"parenttype": "Plot",
			**work_fields,
		}).insert()

	# --- Update/insert in Cluster's table_bcjd ---
	cluster_name = frappe.db.get_value("Plot", doc.plot, "cluster_name")
	if cluster_name:
		if frappe.db.exists("Work Child", {"parent": cluster_name, "work_id": doc.name}):
			frappe.db.set_value(
				"Work Child", {"parent": cluster_name, "work_id": doc.name}, work_fields
			)
		else:
			frappe.get_doc({
				"doctype": "Work Child",
				"work_id": doc.name,
				"parent": cluster_name,
				"parentfield": "table_bcjd",
				"parenttype": "Cluster",
				**work_fields,
			}).insert()
