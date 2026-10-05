---
slug: producer-book-of-business
title: "Producer Portal: Book of Business"
kind: report
group: enterprise
client_label: "Group insurance portal analytics"
summary: "Producer portal book of business: policies, premium and status for the producer's own clients. RLS-scoped to the producer."
role: "Power BI developer"
year: 2026
tools: [Power BI, DAX, Embedded analytics]
tags: [power-bi, rls, embedded, dax, insurance]
featured: false
order: 80
draft: false
status: live
media: { cover: media/cover.webp, poster: media/poster.webp, video: media/video.mp4 }
links: {}
live_lab: { enabled: true, report_key: insurance-producer }
featured_measures: ["Active Policy Count", "Premium In Force"]
model_doc: /content/generated/insurance-portal-core.model.json
---

## Problem

Insurance producers (brokers and agents) manage a book of clients. They need to see their policies, premium in force and policy status at a glance, and never anyone else's book.

## Data model

The shared portal model again, this time through the Producer role: a dynamic filter on the producer dimension via the user-account mapping table. The model also holds quotes at two grains
(a case header and state-line detail), each with explicit "Case-level" and "Detail-level" measure folders so every count states its grain.

## Report

A book-of-business page (22 visuals), a hidden tooltip page for active policy detail, and two bookmarks: **Active policies only** and **Reset view**.

## Under the hood

Dynamic RLS keyed on `USERNAME()` and a role-type discriminator. Three inactive relationships exist in the shared model (claim decision date, claim to policy, commission to producer); only one is activated in DAX so far.
[OWNER: decide whether to say this publicly as a "known gap" or leave it out.]
Pick a measure below to read its DAX.

## Outcome

Producers see only their own book of business, and the Live Lab persona switch shows how one identity change reshapes the same report.
[OWNER: add one real, true result if you have one; otherwise delete this line.]
