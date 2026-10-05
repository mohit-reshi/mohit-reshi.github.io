---
slug: employer-claims-status
title: "Employer Portal: Claims Status Overview"
kind: report
group: enterprise
client_label: "Group insurance portal analytics"
summary: "Employer portal view of claims by status and volume, with a denied-claims bookmark and a volume drill-down. RLS-scoped to the employer."
role: "Power BI developer"
year: 2026
tools: [Power BI, DAX, Embedded analytics]
tags: [power-bi, rls, embedded, dax, insurance]
featured: true
order: 60
draft: false
status: live
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
live_lab: { enabled: true, report_key: insurance-employer }
featured_measures: ["Denial Rate %", "Total Benefit Paid", "Premium In Force Status"]
model_doc: /content/generated/insurance-portal-core.model.json
---

## Problem

Employers using a group insurance portal want to see how their claims are progressing, how many are denied, and where volume is coming from, without seeing any other employer's data.

## Data model

One shared model sits behind 11 reports in three portals (Employer, Member and Producer): 12 tables, 15 relationships and 145 measures. The Employer role filters the employer dimension through a user-account mapping table,
using the role type as the discriminator. The embedded app passes an **effective identity**, so the same model serves every portal.

## Report

A claims status page (24 visuals) with a hidden tooltip page for claim volume detail, and two bookmarks: **Denied claims only** and **Reset view**. Embedded in this site's Live Lab, where the Employer, Member and Producer personas show the same model through different security.

## Under the hood

The Employer role is a dynamic RLS rule using `USERNAME()` against a mapping table. Many status measures return friendly text sentences with matching colour codes, so the page reads in plain language and conditional formatting comes from DAX.
A "Report As-Of Date" measure uses the last loaded date instead of `TODAY()`, so ages and renewals stay correct on a fixed synthetic dataset. The data is synthetic.
Pick a measure below to read its DAX.

## Outcome

Each employer sees only their own claims from one shared model, so adding a portal or a customer does not mean adding a dataset.
[OWNER: add one real, true result if you have it; otherwise delete this line.]
