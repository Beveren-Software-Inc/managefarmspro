# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

# Default boundaries from the approved Site Visit Management plan. Only ever
# used to seed a blank Site Visit Settings (see seed_default_pricing_tiers
# below) — after that, admins own these values entirely.
DEFAULT_TIERS = [
	{"tier_label": "Local (up to 200 km)", "max_distance_km": 200, "base_charge": 15000, "travel_food_included": 1, "accommodation_included": 0},
	{"tier_label": "Regional (201-500 km)", "max_distance_km": 500, "base_charge": 20000, "travel_food_included": 0, "accommodation_included": 0},
	{"tier_label": "Distant (500+ km)", "max_distance_km": 0, "base_charge": 25000, "travel_food_included": 0, "accommodation_included": 0},
]


class SiteVisitSettings(Document):
	pass


def seed_default_pricing_tiers():
	"""after_migrate hook — idempotent. Only inserts the default 3 tiers when
	the single is genuinely empty, so it never overwrites an admin's own
	edits on repeat migrations."""
	settings = frappe.get_single("Site Visit Settings")
	if settings.pricing_tiers:
		return
	for row in DEFAULT_TIERS:
		settings.append("pricing_tiers", row)
	settings.save(ignore_permissions=True)
