---
slug: sample-statement-suite
title: "Sample: Statement Suite"
kind: report
group: portfolio
client_label: null
summary: "Illustrative sample: template-driven financial statements, as-of-date receivables ageing and incremental refresh."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, Warehouse, DAX]
tags: [power-bi, fabric, rls, dax, time-intelligence, incremental-refresh, finance]
featured: true
order: 30
draft: false
sample: true
status: recorded-only
media:
  cover: media/cover.webp
links: {}
live_lab: { enabled: false, report_key: null }
featured_measures: ["Statement Line", "Receivables per Band"]
model_doc: /site/sample-data/sample-statements.model.json
---

## Problem

**Sample content.** Finance needed a P&L, a balance sheet and aged receivables from one model, with the line order owned by the business and not by the data.

## Data model

Template tables define each statement's lines, ordering and subtotals. Invoices carry two inactive date relationships; ageing bands are a small lookup table.

## Report

Seven pages with a navigation page, three statements, aged receivables and a budget view. Territory roles limit the rows each region sees.

## Under the hood

A single `SWITCH` reads the current template line; receivables are computed as of the selected date; the sales table refreshes incrementally.

## Outcome

Statements stay consistent because the layout lives in tables, not in visual formatting. (Sample text.)
