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

- **Guidance:** a four-step guide (paste, check what was found, perfect the answers, practise) and a readiness panel that lists what to prepare first and the next best step.
- **Question cards** are grouped into sections (a start-here set, common questions, one section per job, projects, career story and the job description), shown as notes in wrapping rows. A bar at the top names the section in focus, and the page can scroll so each section fits the screen. "Next to work on" jumps to the next answer that needs attention.
- **Editor** opens each card on its own page with coaching on what the interviewer is testing, live checks for length, numbers, results and hedging, a "Your facts" list of real resume lines to insert, a button that jumps to the next gap, a stopwatch for speaking time, earlier versions, and previous, next and "perfect and go on" buttons.
- **Perfected** answers look different from the rest and can be filtered.
- **Resume** shows what was found, readability checks with suggestions that jump to the bullet (and a one-click rewrite for "responsible for"), a page-count estimate, and five single-column designs that print to PDF.
- **Job match** compares a job description with the resume, lists what is shown, only listed or missing, what the recruiter is likely testing, and lets you add a skill you really have.
- **Practice** is a drill that can hide words from your answer or all of it, lists the facts you should hit, and schedules reviews on a growing gap (a day, three, a week, two weeks, a month; a miss comes back within minutes). A timed mock interview runs in interview order with a clock and no hints.

## Under the hood

One HTML file with no server and no outside requests. Resume text, answers and settings stay in the browser and can be backed up as a file or cleared at any time. The parser looks for headings, date ranges and bullets, and handles several layouts. Job skills come from a dictionary with synonyms, and "Snowflake or BigQuery" counts as one requirement. The PDF uses the browser's print engine with a print stylesheet, so the text stays real and selectable. The readability checks are rules of thumb, not an ATS score, and the page says so.

## Outcome

A rehearsal tool that starts from your own facts and shows what is missing. [OWNER: add one line on how you use it or what you would add next.]
