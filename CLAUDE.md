# CLAUDE.md

## Project Scope

This repository contains multiple apps, but active development is for **managefarmspro** only.

Treat these as dependencies unless explicitly asked otherwise:

- frappe
- erpnext
- payments

Do not modify those apps during normal feature work.

---

## Project Overview

ManageFarmsPro is a Frappe application for managing farm operations on client-owned land.

Core business entities:

- Plot
- Work
- Owner
- Cluster

ERPNext remains the system of record for Customers and accounting.

---

## Domain Model

Relationships:

- Owner links to ERPNext Customer.
- Plot is the primary operational entity.
- Plot belongs to a Cluster.
- Work belongs to a Plot.
- Work contains Labor, Equipment and Material child tables.
- Submitted Work contributes to monthly plot spending.
- InvoiceList is a lightweight child table, not a custom invoice system.

Primary doctypes:

- Owner
- Plot
- Work
- Cluster
- PlotLocation
- PlotSupervisor
- WorkItem

---

## Core Business Rules

### Budget

- Plot maintains a monthly maintenance budget.
- maintenance_balance is a computed value.
- total_amount_spent is derived from submitted Work.
- Monthly balance resets using existing logic.

### Work

- Work.total_cost is calculated from child tables.
- Submitted Work updates Plot spending.
- Cancelled Work must reverse spending.

### Supervision

- Supervision charge is applied as a percentage during spending rollups.
- Preserve this behavior unless explicitly asked to change it.

---

## ERPNext Integration

Do **not** introduce new Customer or Invoice models unless requested.

Prefer extending:

- ERPNext Customer
- ERPNext Sales Invoice
- existing InvoiceList references

Owner supplements ERPNext Customer; it does not replace it.

---

## Development Principles

Always:

- Follow standard Frappe conventions.
- Use DocType-driven design.
- Use the Frappe ORM.
- Extend existing doctypes before creating new ones.
- Follow existing project patterns.
- Make the smallest change necessary.
- Preserve backward compatibility.
- Reuse existing helper methods whenever possible.

Avoid:

- Generic web-app patterns that bypass Frappe.
- Creating duplicate business entities.
- Renaming existing domain concepts.
- Modifying dependency apps to solve ManageFarmsPro requirements.

---

## Before Editing Code

Before changing behavior:

1. Read the DocType JSON.
2. Read the controller (.py).
3. Read the related client script (.js), if present.
4. Understand existing behavior before modifying it.

For submit/cancel workflows, verify both submit and rollback behavior.

---

## High-Risk Areas

Treat these as sensitive:

- monthly maintenance budget
- maintenance balance
- work cost calculations
- supervision charge
- plot spending rollups
- customer synchronization
- cluster synchronization

Preserve existing behavior unless the user explicitly requests a business-rule change.

---

## Default Reasoning

When implementing new features:

- Prefer extending Plot or Work.
- Reuse existing reports and workspaces before creating new ones.
- Prefer minimal, incremental changes over rewrites.
- If requirements are ambiguous, inspect the implementation before making assumptions.
- Explain any business-rule change before implementing it.