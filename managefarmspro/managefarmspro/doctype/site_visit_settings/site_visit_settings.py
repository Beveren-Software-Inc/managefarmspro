# Copyright (c) 2026, FigAi GenAi Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

# Default boundaries from the approved Site Visit Management plan. Only ever
# used to seed a blank Site Visit Settings (see seed_defaults below) — after
# that, admins own these values entirely.
DEFAULT_TIERS = [
	{"tier_label": "Local (up to 200 km)", "max_distance_km": 200, "base_charge": 15000, "travel_food_included": 1, "accommodation_included": 0},
	{"tier_label": "Regional (201-500 km)", "max_distance_km": 500, "base_charge": 20000, "travel_food_included": 0, "accommodation_included": 0},
	{"tier_label": "Distant (500+ km)", "max_distance_km": 0, "base_charge": 25000, "travel_food_included": 0, "accommodation_included": 0},
]

# Client feedback after demo: up to 2 visits/day is fine as long as they're
# in different slots — left to the user's own judgement on whether two far-
# apart sites are practical same-day, not enforced here. Default is exactly
# 2 slots, but this is a configurable table, not a hardcoded limit.
DEFAULT_SLOTS = [
	{"slot_label": "Morning", "start_time": "09:00:00", "end_time": "12:00:00"},
	{"slot_label": "Afternoon", "start_time": "14:00:00", "end_time": "17:00:00"},
]


class SiteVisitSettings(Document):
	pass


def seed_defaults():
	"""after_migrate hook — idempotent per section. Only inserts default rows
	into whichever table (pricing_tiers/slots) is genuinely empty, so it never
	overwrites an admin's own edits on repeat migrations."""
	settings = frappe.get_single("Site Visit Settings")
	dirty = False
	if not settings.pricing_tiers:
		for row in DEFAULT_TIERS:
			settings.append("pricing_tiers", row)
		dirty = True
	if not settings.slots:
		for row in DEFAULT_SLOTS:
			settings.append("slots", row)
		dirty = True
	if dirty:
		settings.save(ignore_permissions=True)
