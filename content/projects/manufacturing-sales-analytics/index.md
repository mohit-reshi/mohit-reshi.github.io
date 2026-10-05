---
slug: manufacturing-sales-analytics
title: "Manufacturing Sales Analytics"
kind: report
group: portfolio
client_label: null
summary: "Manufacturing sales analytics on a medallion Lakehouse with a DirectLake model, 37 measures, bookmark navigation and Git dev/UAT/main."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, PySpark, DirectLake, DAX, Git]
tags: [power-bi, fabric, directlake, dax, time-intelligence, manufacturing]
featured: true
order: 10
draft: false
status: recorded-only
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
featured_measures: ["Revenue YOY %", "Revenue YTD", "Selected Metric"]
model_doc: /content/generated/manufacturing-sales-analytics.model.json
---

## Problem

Sales leadership needed to see, in one glance, whether the business was ahead of last year and ahead of budget, and then reach reps, customers and products without opening a second report.
The data arrived as raw operational extracts, so the first job was to make it trustworthy before making it pretty. [OWNER: one sentence on the real motivation or the "before" state, if you want it.]

## Data model

A medallion pipeline in Microsoft Fabric (bronze, silver, gold, written in PySpark) lands four gold Lakehouse tables: a sales summary, customers, reps, and budget vs actuals.
The semantic model reads them in **DirectLake**, so there is no scheduled import to wait for. It is deliberately small: 7 tables and 3 relationships, because the Lakehouse already did the aggregation.
Only the sales summary connects to the rep, customer and date tables; the other gold tables stay unrelated and are queried through measures.
The load behind it, with its seeded data, validation gates and pipeline, is written up in [Manufacturing Medallion Pipeline](/work/manufacturing-medallion-pipeline/).

## Report

Seven pages with a drillthrough page for rep detail and 20 bookmarks that drive in-report navigation. Page titles are measures (seven dynamic titles), so a headline always matches the current selection.
An executive summary card is built from a single HTML measure with threshold-based colours. A disconnected metric selector lets one visual switch between measures instead of needing a visual per metric.

### Page by page

1. **Executive Summary** answers whether sales are ahead of last year, with headline cards, a colour-coded summary sentence and the leading products.
2. **Channel Performance** answers how each sales channel is doing against last year and against budget, with a selector that switches the metric.
3. **Product Analysis** answers which products and categories drive revenue and margin, and where returns are high.
4. **Customer Analysis** answers how many customers are new, reactivated, lapsed or rolling active, and whether the base is growing.
5. **Rep Performance** answers how reps compare on revenue, transactions and budget, and opens the rep detail page.
6. **Trend Analysis** answers how revenue is moving over time, with month, quarter, year to date and trailing twelve month views and a waterfall.
7. **Rep Detail** is a hidden drillthrough page that shows one rep's revenue, channel and product mix against last year and budget.

The 20 bookmarks are a navigation open and closed pair for each of the seven pages, four period switches (month, quarter, year to date, trailing twelve months) and two product views (top five and all).

## Under the hood

37 measures in 10 display folders. The time-intelligence set covers MTD, QTD, YTD, last year, year-over-year percentage and trailing twelve months, plus rolling-window customer segments (new, reactivated, lapsed, rolling active).
Budget vs actuals reports variance in basis points. The metric selector is `SWITCH` over `SELECTEDVALUE`; the executive summary uses `VAR` blocks. The development flow uses Git with dev, UAT and main branches.
Pick a measure below to read its DAX.

## Outcome

One page now answers the "ahead of last year and budget?" question on its own, and the report reads straight from the Lakehouse without a refresh window.
[OWNER: add one real, true result, such as page load time, refresh time removed, or who uses it. Delete this line if you have none; do not estimate.]
