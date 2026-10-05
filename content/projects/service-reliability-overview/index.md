---
slug: service-reliability-overview
title: "Service Reliability Overview"
kind: report
group: enterprise
client_label: "Enterprise service governance"
summary: "Executive overview of service reliability: availability, outages, incidents and tier-1 critical applications on one page."
role: "Power BI developer"
year: 2026
tools: [Power BI, DAX, Embedded analytics]
tags: [power-bi, rls, dax, kpi-scorecard, it-governance]
featured: true
order: 40
draft: false
status: live
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
live_lab: { enabled: true, report_key: service-governance-interactive }
featured_measures: ["MTTA", "Breach Rate %", "MTTA Status"]
model_doc: /content/generated/service-reliability.model.json
---

## Problem

Executives asked three questions at once: are our applications available, how fast do we respond to incidents, and which critical applications are at risk. The answers lived in three separate datasets.

## Data model

A star schema with three fact tables (incidents, uptime and an on-call roster) that share conformed Application, Team and Date dimensions, so one model answers reliability, response and coverage questions.
It is shared by four interactive reports: 9 tables and 104 measures, 70 of them in one measure table grouped into folders such as Availability, Breach, Escalation, Coverage and Trend.

## Report

A one-page executive overview (25 visuals) plus a hidden tooltip page for availability detail. Two bookmarks give a **Tier 1 critical apps only** view and a **reset** view. It runs embedded in this site's Live Lab.

## Under the hood

40 of the measures are status indicators that return text and colour codes, so conditional formatting is driven by DAX instead of per-visual rules and stays consistent across the report.
`TREATAS` applies the selected date range to an outage-events table that has no date relationship (a virtual relationship), and an inactive relationship to the outage table is kept for event-level drills.
Row-level security is dynamic: a single role maps the signed-in identity to the service lines they may see through a small security table, with an executive path that sees everything.
Pick a measure below to read its DAX.

## Outcome

Availability, response and critical-application risk sit on one page, and each viewer sees only the service lines they are entitled to, using one role instead of one per team.
[OWNER: add one real, true result if you have it; otherwise delete this line.]
