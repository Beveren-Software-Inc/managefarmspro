# Copyright (c) 2026, FigAi GenAi Solutions and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from managefarmspro.managefarmspro.doctype.estimate.estimate import (
	amend_estimate,
	convert_to_project,
	create_plot_and_link,
	link_customer,
	link_plot,
)


def make_estimate(**kwargs):
	doc = frappe.get_doc({"doctype": "Estimate", "client_name": "Test Client", **kwargs})
	doc.insert()
	return doc


def make_customer(customer_name, **kwargs):
	doc = frappe.get_doc({"doctype": "Customer", "customer_name": customer_name, "customer_type": "Individual", **kwargs})
	doc.insert()
	return doc


def make_cluster(cluster_name="Test Cluster"):
	if frappe.db.exists("Cluster", cluster_name):
		return frappe.get_doc("Cluster", cluster_name)
	doc = frappe.get_doc({"doctype": "Cluster", "cluster_name": cluster_name})
	doc.insert()
	return doc


class TestEstimate(FrappeTestCase):
	# link_customer -------------------------------------------------------

	def test_link_customer_existing(self):
		customer = make_customer("Test Existing Customer")
		estimate = make_estimate()

		result = link_customer(estimate.name, customer=customer.name)

		self.assertEqual(result["customer"], customer.name)
		self.assertEqual(frappe.db.get_value("Estimate", estimate.name, "customer"), customer.name)

	def test_link_customer_nonexistent_existing_throws(self):
		estimate = make_estimate()
		self.assertRaises(frappe.ValidationError, link_customer, estimate.name, customer="Does Not Exist")

	def test_link_customer_creates_new(self):
		estimate = make_estimate(client_name="Brand New Prospect")

		result = link_customer(estimate.name, customer_name="Brand New Prospect")

		self.assertTrue(frappe.db.exists("Customer", result["customer"]))
		self.assertEqual(frappe.db.get_value("Estimate", estimate.name, "customer"), result["customer"])

	def test_link_customer_with_contact_sets_them(self):
		estimate = make_estimate()

		result = link_customer(estimate.name, customer_name="Contactable Prospect", email_id="test@example.com", mobile_no="9000000000")

		customer = frappe.get_doc("Customer", result["customer"])
		self.assertEqual(customer.email_id, "test@example.com")
		self.assertEqual(customer.mobile_no, "9000000000")

	def test_link_customer_no_selection_throws(self):
		estimate = make_estimate()
		self.assertRaises(frappe.ValidationError, link_customer, estimate.name)

	def test_link_customer_duplicate_name_without_contact_returns_duplicate_signal(self):
		make_customer("Duplicate Name Customer")
		estimate = make_estimate()

		result = link_customer(estimate.name, customer_name="Duplicate Name Customer")

		self.assertTrue(result.get("duplicate"))
		self.assertEqual(result["existing_customer"], "Duplicate Name Customer")
		# Nothing should have been linked or created for a duplicate signal.
		self.assertIsNone(frappe.db.get_value("Estimate", estimate.name, "customer"))

	def test_link_customer_duplicate_name_with_contact_succeeds(self):
		make_customer("Another Duplicate Customer")
		estimate = make_estimate()

		result = link_customer(estimate.name, customer_name="Another Duplicate Customer", mobile_no="9111111111")

		self.assertNotIn("duplicate", result)
		self.assertTrue(frappe.db.exists("Customer", result["customer"]))

	# link_plot / create_plot_and_link -------------------------------------

	def test_link_plot_existing(self):
		cluster = make_cluster()
		plot = frappe.get_doc(
			{"doctype": "Plot", "plot_name": "Test Link Plot", "area": 5, "units": "Cent", "cluster": cluster.name, "supervision_charge": 0}
		).insert()
		estimate = make_estimate()

		result = link_plot(estimate.name, plot.name)

		self.assertEqual(result["plot"], plot.name)
		self.assertEqual(frappe.db.get_value("Estimate", estimate.name, "plot"), plot.name)

	def test_link_plot_nonexistent_throws(self):
		estimate = make_estimate()
		self.assertRaises(frappe.ValidationError, link_plot, estimate.name, "Does Not Exist")

	def test_create_plot_and_link_requires_customer(self):
		estimate = make_estimate()
		self.assertRaises(frappe.ValidationError, create_plot_and_link, estimate.name, "New Plot", 10, "Cent", make_cluster().name)

	def test_create_plot_and_link_invalid_cluster_throws(self):
		customer = make_customer("Plot Test Customer")
		estimate = make_estimate()
		link_customer(estimate.name, customer=customer.name)
		self.assertRaises(frappe.ValidationError, create_plot_and_link, estimate.name, "New Plot", 10, "Cent", "Does Not Exist")

	def test_create_plot_and_link_success_has_sensible_defaults(self):
		customer = make_customer("Plot Success Customer")
		cluster = make_cluster()
		estimate = make_estimate()
		link_customer(estimate.name, customer=customer.name)

		result = create_plot_and_link(estimate.name, "Fresh Plot", 12.5, "Cent", cluster.name)

		plot = frappe.get_doc("Plot", result["plot"])
		self.assertEqual(plot.customer_name, customer.name)
		self.assertEqual(plot.cluster, cluster.name)
		self.assertEqual(plot.area, 12.5)
		self.assertEqual(plot.supervision_charge, 0)
		self.assertEqual(plot.monthly_maintenance_budget, 0)
		self.assertEqual(frappe.db.get_value("Estimate", estimate.name, "plot"), plot.name)

	# convert_to_project ----------------------------------------------------

	def test_convert_to_project_blocks_without_customer(self):
		estimate = make_estimate()
		estimate.submit()
		self.assertRaises(frappe.ValidationError, convert_to_project, estimate.name)

	def test_convert_to_project_blocks_without_plot(self):
		customer = make_customer("Convert Block Customer")
		estimate = make_estimate()
		link_customer(estimate.name, customer=customer.name)
		estimate.reload()
		estimate.submit()
		self.assertRaises(frappe.ValidationError, convert_to_project, estimate.name)

	def test_convert_to_project_blocks_on_draft(self):
		customer = make_customer("Convert Draft Customer")
		cluster = make_cluster()
		estimate = make_estimate()
		link_customer(estimate.name, customer=customer.name)
		create_plot_and_link(estimate.name, "Draft Guard Plot", 5, "Cent", cluster.name)
		# Still docstatus 0 — never submitted.
		self.assertRaises(frappe.ValidationError, convert_to_project, estimate.name)

	def test_convert_to_project_success(self):
		customer = make_customer("Convert Success Customer")
		cluster = make_cluster()
		estimate = make_estimate()
		link_customer(estimate.name, customer=customer.name)
		create_plot_and_link(estimate.name, "Convert Success Plot", 8, "Cent", cluster.name)
		estimate.reload()
		estimate.submit()

		project = convert_to_project(estimate.name)

		self.assertEqual(project.estimate, estimate.name)
		self.assertEqual(project.customer, customer.name)
		self.assertTrue(frappe.db.exists("Farm Project", {"estimate": estimate.name}))

	# amend_estimate ----------------------------------------------------

	def test_amend_estimate_copies_fields_and_links_back(self):
		estimate = make_estimate(
			client_name="Amend Test Client",
			area_value=100,
			area_unit="Cent",
			line_items=[{"section": "Materials", "line_type": "Material", "description": "Test Line", "quantity": 2, "uom": "Nos", "rate": 50, "amount": 100}],
		)
		estimate.submit()

		amended = amend_estimate(estimate.name)

		self.assertEqual(amended.amended_from, estimate.name)
		self.assertEqual(amended.docstatus, 0)
		self.assertEqual(amended.client_name, "Amend Test Client")
		self.assertEqual(amended.area_value, 100)
		self.assertEqual(len(amended.line_items), 1)
		self.assertEqual(amended.line_items[0].description, "Test Line")
		self.assertEqual(frappe.db.get_value("Estimate", estimate.name, "docstatus"), 2)
