---
slug: sample-nl-query-app
title: "Sample App: Ask Your Data"
kind: app
group: app
client_label: null
summary: "Illustrative sample app: a natural-language question box over a small CSV, built with an AI coding assistant."
role: "Builder"
year: 2026
tools: [Python, Streamlit]
tags: [python, ai-built, data-viz]
featured: false
order: 40
draft: false
sample: true
status: recorded-only
media:
  cover: media/cover.webp
links: {}
live_lab: { enabled: false, report_key: null }
featured_measures: []
model_doc: null
appKind: external
url: https://example.invalid/sample-app
stack: [Python, Streamlit, pandas]
ai_built: true
needs_api_key: true
howBuilt: "Built in an afternoon with an AI coding assistant: I wrote the spec and the data checks, the assistant wrote the first draft of the UI."
---

## Problem

**Sample content.** Quick questions about a small dataset should not need a dashboard.

## Data model

A single CSV with a header row; the app profiles it, then answers questions with generated pandas code.

## Report

A text box, a result table and a chart. It runs on a free hosting tier, so the first load can take a while.

## Under the hood

The model proposes code, the app runs it in a restricted namespace and shows both. It needs **your own API key**; nothing is stored.

## Outcome

A useful toy and a good conversation starter about guard rails.
