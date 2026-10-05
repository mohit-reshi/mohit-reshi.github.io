---
slug: longbreath
title: "Longbreath"
kind: app
group: app
client_label: null
summary: "A breathing and breath-hold trainer: guided timers, progress charts and a resting heart rate log. One offline page that keeps data on your device."
role: "Builder"
year: 2026
tools: [HTML, CSS, JavaScript]
tags: [data-viz]
featured: false
order: 45
draft: false
status: recorded-only
media:
  cover: media/cover.webp
  # video: media/video.mp4
  # poster: media/poster.webp
  # before_after: { before: media/before.webp, after: media/after.webp, caption: "What changed" }
links: {}
live_lab: { enabled: false, report_key: null }
featured_measures: []
model_doc: null
appKind: static
stack: [HTML, CSS, JavaScript, SVG]
ai_built: false
needs_api_key: false
howBuilt: "A single HTML file with inline CSS, JavaScript and hand-drawn SVG charts. Exercise timings and safety text are part of the page."
---
## Problem

Most breathing apps are either a bare timer or a subscription. I wanted one page that guides a session, teaches the technique and shows whether practice is paying off, without an account.

## Data model

Everything is stored in the browser on your device: sessions, max hold tests, resting heart rate readings and settings. There is no server and no sign-in. A button erases all of it.

## Report

Four tabs. Practice lists the exercises in groups (calm and focus, base breathing and breath-hold tables) with a guided timer and sound cues. Learn explains how the training works, with safety rules and a 12-week plan. Progress charts max hold tests and minutes practised per week. Heart records resting heart rate with a tap counter and shows the trend.

Breath-hold training starts with a safety screen: dry land only, seated or lying down, never after hyperventilating. It has to be acknowledged before the first hold.

## Under the hood

One HTML file with inline CSS, JavaScript and SVG. It uses system fonts and makes no network requests. Timers run phase by phase (in, hold, out, rest), and each exercise has adjustable timings per level. This is a practice tool, not medical advice.

## Outcome

A small, accessible, offline app that shows what a single self-contained page can do. [OWNER: add one line on why you built it or how you use it.]
