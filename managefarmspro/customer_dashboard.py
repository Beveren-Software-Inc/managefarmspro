from frappe import _


def get_data():
	return {
		"fieldname": "customer",
		"non_standard_fieldnames": {
			"Payment Entry": "party",
			"Quotation": "party_name",
			"Plot": "customer_name",
			"Work": "customer"
		},
		"dynamic_links": {"party_name": ["Customer", "quotation_to"]},
		"transactions": [
			{
				"items": [
					"Plot",
					"Quotation",
					"Project",
					"Sales Invoice",
					"Payment Entry",
					"Work"
				]
			}
		]
	}

