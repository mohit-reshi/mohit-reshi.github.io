---
slug: cancellation-reinstatement-analytics
title: "Cancellation & Reinstatement Analytics"
kind: report
group: portfolio
client_label: "a real-world group insurance problem, rebuilt on synthetic data"
summary: "Cancellation and reinstatement analytics with date-basis toggles, inactive relationships, dynamic alt text and broker row-level security."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, DirectLake, DAX]
tags: [power-bi, fabric, directlake, rls, dax, userelationship, insurance]
featured: true
order: 20
draft: false
status: recorded-only
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
featured_measures: ["Metric YoY %", "Selected Metric", "KPI Card Title"]
model_doc: /content/generated/cancellation-reinstatement-analytics.model.json
---

## Problem

Group insurance teams need to know how many cases cancel, how many come back, and how that changes depending on whether you count by the date the record was made or the date the policy ended.
Both views are correct, and mixing them up is the most common way these reports mislead. This project is a rebuild of that real-world problem on synthetic data.

## Data model

Gold Lakehouse tables in DirectLake: one wide fact table (70 columns) with date, tenure and broker dimensions. 10 tables and 45 measures, all in a single measure table organised by purpose.
The pipeline that builds those tables, including the planted defects and the reconciliations, is written up in [Cancellation Lakehouse Rebuild](/work/cancellation-lakehouse-rebuild/).
Two relationships to the date table are inactive (termination date and termination tenure). They are switched on inside measures, so the same measure can answer by history date or termination date.

## Report

Seven pages: five visible pages, one hidden drillthrough page and one hidden tooltip page, with five reset bookmarks. A date-basis toggle, a count mode, a calendar view and a metric choice let one page serve many questions.
The toggles are measures, not extra visuals, so bookmarks can flip views and the layout stays simple. Alt text is generated from the current selection so a screen reader hears what the chart is showing now.

### Page by page

1. **Attrition Snapshot** answers how many cases cancelled in the chosen period and how they split by reason, product, case size and state. It is filtered to cancellations.
2. **Recovery Snapshot** answers the same questions for reinstatements, so recovered cases can be read next to lost ones.
3. **Attrition Trend** answers whether cancellations are rising or falling over time, with a prior-year comparison and a calendar grain that can be switched between week, month, quarter and year.
4. **Recovery Trend** answers the same trend question for reinstatements.
5. **Non-Payment Watch** answers how many non-payment cancellations come back, by showing cancellations, reinstatements and the share reinstated together.
6. **Policy Drill-through** is a hidden page that lists the policies behind a chosen product, reason, case size or tenure band.
7. **TT_Metrics** is a hidden tooltip page that shows cases, lives and premium together on hover, so a reader can compare them without changing the metric toggle.

The five bookmarks reset the filters on each of the five visible pages.

## Under the hood

`USERELATIONSHIP` inside a date-basis toggle read by `SELECTEDVALUE` and `SWITCH` over four disconnected parameter tables. 14 alt-text measures keep accessibility text in step with the filters.
Measures sit in underscore-prefixed folders by purpose: base, toggle, labels, period, class and alt text.
Row-level security is a single dynamic Broker role: the signed-in email is matched to a broker mapping table, so each broker sees only their own cases.
Pick a measure below to read its DAX.

## Outcome

One model answers history-date and termination-date questions without duplicating logic, brokers are limited to their own cases by a single role, and the report is readable with assistive technology.
[OWNER: add a real, true result if you have one; otherwise delete this line.]
