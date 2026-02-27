frappe.query_reports["Collated Plot Invoice"] = {
filters: [
{
fieldname: "plot",
label: __("Plot"),
fieldtype: "Link",
options: "Plot",
reqd: 1,
},
{
fieldname: "start_date",
label: __("Start Date"),
fieldtype: "Date",
reqd: 1,
default: frappe.datetime.month_start(),
},
{
fieldname: "end_date",
label: __("End Date"),
fieldtype: "Date",
reqd: 1,
default: frappe.datetime.month_end(),
},
],
onload: function (report) {
report.page.add_inner_button(__("Generate Invoice"), function () {
const filters = report.get_values();

if (!filters.plot || !filters.start_date || !filters.end_date) {
frappe.msgprint(__("Please set the Plot, Start Date and End Date filters first."));
return;
}

// Step 1: fetch preview data — read-only, no DB writes
frappe.call({
method: "managefarmspro.managefarmspro.report.collated_plot_invoice.collated_plot_invoice.get_invoice_preview",
args: { filters: filters },
freeze: true,
freeze_message: __("Loading invoice preview..."),
callback: function (r) {
if (!r.message) {
frappe.msgprint(__("No uninvoiced work entries found for the selected period."));
return;
}

const data = r.message;
const fmt = (v) => frappe.format(v || 0, { fieldtype: "Currency" });

// Build per-work detail cards
const work_cards = data.invoices.map(function (inv) {
const date_str = frappe.datetime.str_to_user(inv.work_date) || inv.work_date;
const desc = inv.description
? inv.description
: "<em style='color:#aaa;'>No description available</em>";

const item_rows = (inv.items || []).map(function (item) {
return "<tr>"
+ "<td>" + (item.item_group || "") + "</td>"
+ "<td>" + (item.item_name || item.item_code || "") + "</td>"
+ "<td class='text-right'>" + (item.qty !== undefined ? item.qty : "") + "</td>"
+ "<td class='text-right'>" + fmt(item.rate) + "</td>"
+ "<td class='text-right'>" + fmt(item.amount) + "</td>"
+ "</tr>";
}).join("");

const items_table = (inv.items && inv.items.length)
? "<table class='table table-bordered table-condensed' style='margin:8px 0 0; font-size:12px;'>"
+ "<thead style='background:#f0f0f0;'><tr>"
+ "<th>Item Group</th><th>Item Name</th>"
+ "<th class='text-right' style='width:80px;'>Quantity</th>"
+ "<th class='text-right' style='width:110px;'>Rate</th>"
+ "<th class='text-right' style='width:120px;'>Amount</th>"
+ "</tr></thead>"
+ "<tbody>" + item_rows + "</tbody>"
+ "<tfoot><tr style='background:#f5f5f5;'>"
+ "<td colspan='4' class='text-right'><strong>Subtotal:</strong></td>"
+ "<td class='text-right'><strong>" + fmt(inv.total_cost) + "</strong></td>"
+ "</tr></tfoot>"
+ "</table>"
: "<p class='text-muted' style='margin:6px 0 0; font-size:12px;'>No items recorded</p>";

return "<div style='border:1px solid #d1d8dd; border-radius:4px; padding:12px 14px; margin-bottom:14px; background:#fff;'>"
+ "<div style='font-weight:bold; color:#2490EF; font-size:13px; margin-bottom:4px;'>"
+ (inv.work_name || "") + " &ndash; " + date_str
+ "</div>"
+ "<div style='font-size:12px; color:#666; margin-bottom:6px;'>"
+ "<strong>Work Description:</strong> " + desc
+ "</div>"
+ items_table
+ "</div>";
}).join("");

const supervision_label = data.supervision_charge > 0
? "Supervision Charges"
: "Supervision Charges (not applicable)";

const words_row = data.final_grand_total_in_words
? "<div style='text-align:right; font-size:11px; color:#555; margin-top:6px; font-style:italic;'>"
+ "Grand Total in Words: " + data.final_grand_total_in_words
+ "</div>"
: "";

const preview_html = "<div style='font-size:13px; background:#f8f9fa; padding:10px 14px; border-radius:4px; border:1px solid #e4e6e8; margin-bottom:16px;'>"
+ "<strong>Customer:</strong> " + (data.customer || "&mdash;") + "&emsp;"
+ "<strong>Plot:</strong> " + (data.plot_name || filters.plot) + "&emsp;"
+ "<strong>Period:</strong> " + filters.start_date + " &rarr; " + filters.end_date
+ "</div>"
+ work_cards
+ "<div style='border-top:2px solid #ccc; padding-top:12px; margin-top:4px;'>"
+ "<table style='width:380px; margin-left:auto; font-size:13px; border-collapse:collapse;'>"
+ "<tr><td style='padding:5px 10px;'>Total for All Works</td>"
+ "<td style='padding:5px 10px; text-align:right;'>" + fmt(data.grand_total) + "</td></tr>"
+ "<tr><td style='padding:5px 10px;'>" + supervision_label + "</td>"
+ "<td style='padding:5px 10px; text-align:right;'>" + fmt(data.supervision_charge) + "</td></tr>"
+ "<tr style='background:#f0f4ff; font-weight:bold; font-size:15px;'>"
+ "<td style='padding:8px 10px;'>Grand Total</td>"
+ "<td style='padding:8px 10px; text-align:right; color:#2490EF;'>" + fmt(data.final_grand_total) + "</td></tr>"
+ "</table>"
+ words_row
+ "</div>";

// Step 2: show preview modal — no DB writes have happened yet
const dialog = new frappe.ui.Dialog({
title: __("Invoice Preview"),
size: "extra-large",
fields: [{
fieldtype: "HTML",
fieldname: "preview_html",
options: preview_html,
}],
primary_action_label: __("Generate Invoice"),
primary_action: function () {
// Step 3: user confirmed — now create the invoice
dialog.disable_primary_action();
frappe.call({
method: "managefarmspro.managefarmspro.report.collated_plot_invoice.collated_plot_invoice.download_invoice_pdf",
args: { filters: filters },
freeze: true,
freeze_message: __("Generating invoice..."),
callback: function (response) {
dialog.hide();
if (response.message) {
window.open(response.message, "_blank");
frappe.msgprint(__("PDF generated and saved to File Manager."));
}
},
});
},
});

dialog.show();
},
});
});
},
};
