---
slug: sample-sales-analytics
title: "Sample: Sales Analytics"
kind: report
group: portfolio
client_label: null
summary: "Illustrative sample: a Fabric medallion Lakehouse feeding a DirectLake model with a bookmark-driven executive report."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, PySpark, DirectLake, DAX, Git]
tags: [power-bi, fabric, directlake, dax, time-intelligence, manufacturing]
featured: true
order: 10
draft: false
sample: true
status: live
media:
  cover: media/cover.webp
  poster: media/poster.webp
  video: media/video.mp4
  before_after: { before: media/before.webp, after: media/after.webp, caption: "Before: a table-first report. After: the redesigned executive page." }
links: {}
live_lab: { enabled: true, report_key: insurance-employer }
featured_measures: ["Revenue YoY %", "Revenue by Ship Date", "Selected Metric"]
model_doc: /site/sample-data/sample-sales.model.json
---

## Problem

This is **sample content** that shows how a case study reads. A sales team wanted one executive page that answered "are we ahead of last year and of budget?" in five seconds, and a way to
drill into reps and products without a second report.

## Data model

Bronze, silver and gold layers in a Lakehouse feed a small star schema: one sales fact, a date table, product, customer and rep dimensions, and a budget fact. The model reads the gold tables in **DirectLake**,
so there is no scheduled import to wait for. A disconnected metric selector lets one visual switch between revenue and growth.

## Report

Seven pages, bookmark navigation, and a drillthrough page for rep detail. Titles are measures, so the headline always matches the filter state.

## Under the hood

Time intelligence uses `SAMEPERIODLASTYEAR`; the shipping-date view is an inactive relationship activated with `USERELATIONSHIP`; the metric selector is a `SWITCH` over `SELECTEDVALUE`.
Pick any measure in the list below to read its DAX.

## Outcome

The first page now answers the question on its own, and the report loads from the Lakehouse without a refresh window. (Numbers in this sample are placeholders.)
