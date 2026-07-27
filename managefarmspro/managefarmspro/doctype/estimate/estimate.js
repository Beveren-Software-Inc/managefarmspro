// Copyright (c) 2026, FigAi GenAi Solutions and contributors
// For license information, please see license.txt

frappe.ui.form.on("Estimate", {
	refresh(frm) {
		// Plain standard Submit/Cancel/Amend otherwise — no hidden automation
		// on Desk. This button calls the same server-side link_customer method
		// the SPA's Approve-time convenience uses, so Desk and SPA never
		// diverge on how a Customer gets linked.
		if (!frm.is_new() && frm.doc.docstatus !== 2 && !frm.doc.customer) {
			frm.add_custom_button(__("Link Customer"), () => {
				frappe.prompt(
					[
						{ fieldname: "customer", fieldtype: "Link", options: "Customer", label: __("Existing Customer") },
						{ fieldname: "customer_name", fieldtype: "Data", label: __("Or New Customer Name") },
					],
					(values) => {
						if (!values.customer && !values.customer_name) {
							frappe.msgprint(__("Pick an existing customer, or enter a name for a new one."));
							return;
						}
						frappe.call({
							method: "managefarmspro.managefarmspro.doctype.estimate.estimate.link_customer",
							args: { estimate: frm.doc.name, customer: values.customer, customer_name: values.customer_name },
							freeze: true,
							callback: () => frm.reload_doc(),
						});
					},
					__("Link Customer"),
					__("Link")
				);
			});
		}
	},
});
