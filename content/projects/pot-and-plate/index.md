---
slug: pot-and-plate
title: "Pot and Plate"
kind: app
group: app
client_label: null
summary: "An offline meal, calorie and water tracker. Weigh the ingredients, build a meal once, log any portion of it later. Your data stays on your device."
role: "Builder"
year: 2026
tools: [HTML, CSS, JavaScript]
tags: []
featured: false
order: 31
draft: false
status: recorded-only
media:
  cover: media/cover.webp
links: {}
live_lab: { enabled: false, report_key: null }
featured_measures: []
model_doc: null
appKind: static
stack: [HTML, CSS, JavaScript]
ai_built: false
needs_api_key: false
howBuilt: "Plain JavaScript in one HTML file with a service worker, so it installs and works with no connection. The nutrition maths, the quick-log reader, the meal and CSV importers and the statistics are plain functions covered by unit tests. The interface has browser tests, including offline use and accessibility checks in light and dark themes."
---
---
## Problem

Most calorie apps need an account, a connection and a paid plan for the useful parts, and they guess portions from photos. A person who already weighs their food in grams needs something simpler: exact weights in, calories out, and no repeat typing for meals they eat every week.

## Data model

Foods are stored per 100 g, with optional household units (one roti is 40 g, one katori is 150 g) and a density for liquids. Each food shows where its numbers came from. A starter list of about 140 common foods is built in, marked approximate, and any food can be edited, ticked as verified, hidden or reset.

A meal keeps its own copy of each ingredient's values, so editing a food later never changes an old recipe. Each diary entry also keeps the values it was logged with, so history does not shift when foods change.

## Report

- **Today:** a calorie ring with the amount left, protein, carbs, fat and fibre bars, four meal sections, water in millilitres and a weight box. Going over the goal is shown in a neutral colour, not red. A day can start at an hour you choose, so a late snack counts for the evening before.
- **Add:** search the food list, type "rice 180g, dal 230 g, 2 roti" and let the app read it, build a plate from several foods, or add calories only. The preview shows the exact calories before anything is saved.
- **My meals:** save a plate or a recipe. Weigh the finished pot once, and any portion can be logged by grams or by servings. The pot method accounts for water gained or lost in cooking.
- **Foods:** search and edit the list, convert the values on a pack label to per 100 g, and import or export a CSV. A check warns when calories do not match the macros, which catches typos.
- **Progress:** calories per day against the goal, averages over the days that were logged, a weight chart with a seven-day average, a weekday pattern and the foods that add the most calories.
- **Goals:** a default goal plus up to three dated goal periods that replace it while they run, with a reminder on Today the day before one starts. A diet preset (balanced, high protein, low carb, keto and others) turns the calorie limit into protein, carbs and fat for the active goal. Two periods can never share a date.
- **Backup:** download everything as one file, restore it, and undo the restore.

## Under the hood

One HTML file with no outside requests. A content security policy allows none apart from the owner sync, which only runs when the owner is signed in. A service worker caches the app so it opens offline, and the page asks the browser to keep its storage. If saving ever fails, a warning says so and points to the backup.

Pasted recipes follow a small plain-text format ("MEAL v1") that the owner view can read, preview and save. The reader copes with chat formatting, flags numbers that do not add up and never saves anything before it is shown. Everything stays on the device unless the owner is signed in.

## Outcome

A tracker that works with no connection, no account and no guesses about portions. [OWNER: add one line on how you use it or what you would add next.]
