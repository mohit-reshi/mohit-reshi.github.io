---
slug: rehearsal-desk
title: "Rehearsal Desk"
kind: app
group: app
client_label: null
summary: "Paste a resume and get interview answer cards built from your own facts, with a job match, readability checks and a printable resume. Private, in your browser."
role: "Builder"
year: 2026
tools: [HTML, CSS, JavaScript]
tags: []
featured: false
order: 30
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
stack: [HTML, CSS, JavaScript]
ai_built: false
needs_api_key: false
howBuilt: "Plain JavaScript in one HTML file. The resume parser, question builder and job matching are rule based and covered by unit tests. The interface has browser tests, including accessibility checks in light and dark themes."
---
---
## Problem

Interview answers about your own career are the ones people prepare least. "Tell me about yourself", "walk me through this job" and "what did you do on that project" all come from the resume, yet most prep tools only offer generic question lists.

## Data model

The resume text is read into one structured record: contact details, summary, each job with its dates and bullets, projects, personal projects and skills. Everything else is derived from that record: the readability checks, the job match, the question cards and the printable resume. The record is shown back to the user for correction, because parsing is never perfect.

Starter answers use only what the resume says. Anything it does not say is left as a visible gap, such as "[add: the result, with a number]", so the app never invents facts.

## Report

Home starts with a fictional sample resume and job description, so the app works before anything is pasted. Pasting your own text and pressing Analyse fills in the rest.

- **Question cards** are grouped into sections (a start-here set, common questions, one section per job, projects, career story and the job description), shown as notes in wrapping rows. A bar at the top names the section in focus, and the page can scroll so each section fits the screen.
- **Editor** opens each card on its own page with coaching on what the interviewer is testing, live checks for length, numbers, results and hedging, earlier versions, and a button back to the card.
- **Perfected** answers look different from the rest and can be filtered.
- **Resume** shows what was found, readability checks with suggestions for individual bullets, and five single-column designs that print to PDF.
- **Job match** compares a job description with the resume, lists what is shown, only listed or missing, and what the recruiter is likely testing.
- **Practice** asks the questions one at a time with a timer.

## Under the hood

One HTML file with no server and no outside requests. Resume text, answers and settings stay in the browser and can be backed up as a file. The parser looks for headings, date ranges and bullets, and handles several layouts. Job skills come from a dictionary with synonyms, and "Snowflake or BigQuery" counts as one requirement. The PDF uses the browser's print engine with a print stylesheet, so the text stays real and selectable. The readability checks are rules of thumb, not an ATS score, and the page says so.

## Outcome

A rehearsal tool that starts from your own facts and shows what is missing. [OWNER: add one line on how you use it or what you would add next.]
