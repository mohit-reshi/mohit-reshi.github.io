---
slug: member-claim-history
title: "Member Portal: Claim History"
kind: report
group: enterprise
client_label: "Group insurance portal analytics"
summary: "Member portal claim history: the member's own claims by status and amount. RLS-scoped to the member."
role: "Power BI developer"
year: 2026
tools: [Power BI, DAX, Embedded analytics]
tags: [power-bi, rls, embedded, dax, insurance]
featured: false
order: 70
draft: false
status: live
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
live_lab: { enabled: true, report_key: insurance-member }
featured_measures: ["Total Benefit Paid", "Denial Rate %"]
model_doc: /content/generated/insurance-portal-core.model.json
---

## Problem

A plan member opening a portal wants a plain answer to "what happened to my claims?" The audience is non-technical, so the report has to be calm, readable and strictly limited to that one person's data.

## Data model

The same shared model as the Employer and Producer reports. The Member role filters the member dimension through a user-account mapping table with the role type "Member".
One deliberate bi-directional relationship (Member to Employer) is a documented exception to single-direction filtering.

## Report

A claim history page (24 visuals), a hidden tooltip page for claim count detail, and two bookmarks: **Paid claims only** and **Reset view**. Wording and colours are chosen for a non-technical reader.

## Under the hood

Dynamic row-level security with an effective identity passed by the embedding app. Status measures return readable sentences with colour codes. Because the model is shared, a fix to a measure improves all three portals at once.
Pick a measure below to read its DAX.

## Outcome

Members see only their own claims, in plain language, from the same model that serves employers and producers.
[OWNER: add one real, true result if you have one; otherwise delete this line.]
