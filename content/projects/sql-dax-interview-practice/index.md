---
slug: sql-dax-interview-practice
title: "SQL, DAX and Data Engineering Interview Practice"
kind: app
group: app
client_label: null
summary: "A practice app for SQL, DAX, Power Query M, PySpark and data engineering interviews: lessons, graded questions, review and spaced repetition."
role: "Power BI developer"
year: 2026
tools: [React, TypeScript, JavaScript]
tags: [dax, python]
featured: false
order: 50
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
stack: [React, TypeScript, Vite, CodeMirror]
ai_built: false
needs_api_key: false
howBuilt: "A React and TypeScript single-page app built with Vite and shipped as one HTML file. Model answers were checked against sample data in SQLite and pandas where those engines were available."
---
## Problem

Interview preparation for data roles is scattered across PDFs and blog posts, with no way to practise or see where you keep going wrong. I wanted one place to learn a topic, attempt questions, and revisit the ones I miss.

## Data model

All content is plain JSON: questions with a model answer, common mistakes and tricks, pattern tables, interview scripts and one lesson per topic. Progress is stored in your own browser, so nothing is sent anywhere.

## Report

Pick a topic, read its lesson, then practise: name the pattern, attempt the answer in a SQL, DAX, M or Python editor, get an offline review, compare with the model answer and rate yourself. Missed questions come back through spaced repetition, and the error log shows which kinds of mistake repeat. Covers SQL, DAX, Power Query M, pandas, PySpark, Delta Lake, Microsoft Fabric and data modelling. A Functions tab lists functions and keywords for SQL, T-SQL, MySQL, DAX, Power Query M, PySpark and pandas, each with a definition, syntax and a worked example. After you reveal an answer, a side panel lists the functions that answer uses.

## Under the hood

A React and TypeScript single-page app built with Vite and shipped as one HTML file. The review is a set of offline rules (for example a window function in WHERE, `and` used on PySpark columns) that runs in the browser. Model answers were checked against sample data in SQLite and pandas where those engines were available; Power Query M, DAX and PySpark answers were not executed, so treat them as study material.

## Outcome

A fast way to turn a list of interview questions into repeated, tracked practice. Next step would be running DAX and M answers against a real engine.
