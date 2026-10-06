---
slug: interview-prep-desk
title: "Interview Prep Desk"
kind: app
group: app
client_label: null
summary: "A browser app that turns a job description or resume into practice questions, with lessons and mock interviews. Runs in your browser."
role: "Power BI developer"
year: 2026
tools: [HTML, JavaScript, Python]
tags: [power-bi, fabric, dax]
featured: false
order: 40
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
stack: [HTML, CSS, JavaScript, Python]
ai_built: false
needs_api_key: false
howBuilt: "A Python build script generates the single HTML file and the question data from the markdown interview and learning guides. Matching and scoring were tuned by hand."
---

## Problem

Interview prep for Power BI and data engineering roles is usually a long list of questions with no sense of which ones matter for a given job. I wanted a tool that starts from the job description and my own resume, then picks and orders the questions.

## Data model

A bank of 803 scenario questions with model answers, and 161 lessons in 26 topics, all written as markdown and compiled into the app. A skills dictionary of about 40 Power BI, ETL and soft skills, with synonyms, reads the text you paste. No client data and no accounts.

## Report

Seven tabs: Job description, Resume, JD + resume, Browse and filter, Learn, Mock interview and My progress. Paste a job description and the app lists the skills it asks for, estimates seniority and ranks the questions most likely to come up. Compare it with your resume to see gaps and strengths. Practise with a timer, rate yourself, and the app schedules spaced reviews. Typed answers are saved per question; the next time you practise it, the review shows your previous attempt, your new answer and the model answer side by side. Previous and Next buttons move through a practice list, you can continue where you left off, and your progress can be downloaded as a file and imported elsewhere.

## Under the hood

One self-contained HTML file with no server. Your resume and job description stay in the browser. The only outside request is optional: uploading a PDF or Word file loads a small reader library from a public CDN. Pasting text needs none. Questions are scored by how squarely they cover each requested skill, with a text-similarity score as a second signal. A Python build script regenerates the app from the markdown guides and can fail the build if a question or lesson is not linked.

## Outcome

A practice tool shared as a worked example of a small, self-contained app. [OWNER: add one line on how you use it or what you would change next.]
