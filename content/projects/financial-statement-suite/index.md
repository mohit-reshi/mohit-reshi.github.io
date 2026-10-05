---
slug: financial-statement-suite
title: "Financial Statement Reporting Suite"
kind: report
group: portfolio
client_label: null
summary: "Financial statement suite: P&L, balance sheet, cash flow, aged receivables and budget, with template tables, incremental refresh and territory RLS."
role: "Power BI & Fabric developer"
year: 2026
tools: [Power BI, Microsoft Fabric, DAX]
tags: [power-bi, fabric, rls, dax, time-intelligence, incremental-refresh, finance]
featured: true
order: 30
draft: false
status: recorded-only
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
featured_measures: ["Revenue YoY %", "Budget Variance Fixed", "Receivables Per Group"]
model_doc: /content/generated/financial-statement-suite.model.json
---

## Problem

Finance reports are read by people who know exactly what a profit and loss statement should look like. Statement layout, line order, subtotals and the way a percentage row differs from an amount row all have to be right,
and they should not depend on how the data happens to be sorted.

## Data model

The largest model in the portfolio: 20 tables, 55 measures and 14 relationships, reading a Fabric Warehouse through its SQL endpoint in Import mode. [OWNER: confirm the storage mode before publishing; the source files show Import, not DirectLake.]
Separate template tables define the P&L, balance sheet, cash flow and ratios layouts, so line order and subtotals are independent of the data.
A sales table uses an **incremental refresh** policy (rolling 8-year window, 3-day incremental window).
Two inactive date relationships on invoices (invoice date and due date) keep the active date path unambiguous.
The pipeline behind it (source copies, silver change feed, Warehouse MERGE and the model refresh that follows) is written up in [Financial Suite Ingestion](/work/financial-suite-ingestion-and-incremental-refresh/).

## Report

Seven pages: a navigation page, the three statements, aged receivables, a revenue insights page and budget variance. Each statement is driven by its template table, with the current line read by `SELECTEDVALUE`.

### Page by page

1. **Navigation** is a landing page with buttons to each report page.
2. **P&L Statement** answers what revenue, costs and profit were for a selected year, line by line, with this year against last year and a waterfall.
3. **Balance Sheet** answers what the company owned and owed at year end, with a ratios block beside the statement.
4. **Cash Flow Statement** answers where cash came from and where it went, split into operating, investing and financing activities.
5. **Aged AR** answers which invoices are open on a selected date and how long they have been overdue, by customer and by age band.
6. **Revenue Insights** answers how sales and profit vary by channel, territory, product and customer, with a rolling average and the previous highest sale.
7. **Budget vs Actuals** answers how actual results compare with budget by account, with the variance and the variance percentage.

## Under the hood

Measures switch behaviour per statement line: percentage rows show a percentage-point difference instead of a ratio. Year-over-year uses `SAMEPERIODLASTYEAR`; budget vs actual has a fixed-variance measure.
Aged receivables are computed as of a selected date: an invoice is open if it was issued before that date and is due after it, and ageing bands (minimum and maximum days) live in a small band table that the measures filter against.
Territory row-level security uses three static roles that filter the Region dimension.
Pick a measure below to read its DAX.

## Outcome

Statement layouts can be changed by editing a template table rather than rebuilding visuals, receivables can be aged as of any date, and each territory sees only its own region.
[OWNER: add one real, true result if you have it; otherwise delete this line.]
