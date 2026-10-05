---
slug: cancellation-lakehouse-rebuild
title: "Cancellation Lakehouse Rebuild"
kind: pipeline
group: portfolio
client_label: "a real-world group insurance problem, rebuilt on synthetic data"
summary: "Seeded synthetic bronze with 12 planted defect classes, cleaned by Dataflow Gen2 into silver and gold Delta tables, reconciled and tuned for DirectLake."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, PySpark, Dataflow Gen2, Delta Lake, Power Query M]
tags: [fabric, medallion, python, directlake, insurance]
featured: true
order: 22
draft: false
status: recorded-only
links: {}
model_doc: null
---

## Problem

This is the data engineering behind [Cancellation & Reinstatement Analytics](/work/cancellation-reinstatement-analytics/). The reporting problem is a real one: count policies that cancel and policies that come back, from a history table that has duplicates, orphan keys, odd codes and a boundary bug in how case size is bucketed.
The rebuild answers one question. What does a clean, versioned, testable pipeline look like for that data?
No real data is used. The pipeline starts from a generator that plants twelve classes of defect on purpose, with a register of how many rows each one touches. Every later layer is then judged by whether it closes those defects and can account for every row it removed.

## Data model

Bronze is seven CSV files, silver and gold are Delta tables written by two Dataflow Gen2 items, and the semantic model reads gold in DirectLake.

```text
NB_Generate_Bronze  (seed 20260902)
   -> Files/bronze/*.csv   7 source-shaped files + _defect_register.csv
DF_Silver  (7 queries, Replace into Delta)
   -> silver_history  silver_policy  silver_broker  silver_rep
      silver_termination_code  silver_policy_type  silver_sales_channel
DF_Gold  (reads silver Delta, joins, flags, filters)
   -> gold_fact_cancel_reinstatement   gold_dim_date   gold_dim_case_tenure
      gold_param_metric  gold_param_count_mode  gold_param_date_basis  gold_param_calendar_view
      gold_broker_user_map
NB_Optimize_Gold  (V-Order OPTIMIZE on the three large tables)
   -> SM_CR_Rebuild (DirectLake, 8 gold tables) -> report
```

| Table | Grain |
|---|---|
| `termdate_hist` (bronze) | one row per history event (500,000 generated, plus 15,000 planted duplicates) |
| `policy` (bronze) | one row per policy (120,000) |
| `dimbroker`, `dimrep`, `dimsaleschannel`, `dimterminationcodes`, `dimpolicytype` | one row per member (5,000 brokers, 23 reps, 8 channels, 15 termination codes, 10 policy types) |
| `gold_fact_cancel_reinstatement` | one row per history event after the exclusion filter |
| `gold_dim_date` | one row per day, 2018-01-01 to 2024-12-31 |
| `gold_dim_case_tenure` | one row per tenure band, plus an Unknown member |
| `gold_param_*` | one small table per report toggle |
| `gold_broker_user_map` | one row per broker, used by row-level security |

The model uses only the eight gold tables. The silver dimensions are left out because gold already carries their resolved attributes, and keeping both would create two paths to the same field.

## Report

The report toggles (metric, count mode, date basis, calendar grain) are driven by four parameter tables. They are written by the gold dataflow as ordinary Delta tables. DirectLake does not support calculated tables, so a parameter table has to exist in the Lakehouse to exist in the model.
The two inactive relationships in [Cancellation & Reinstatement Analytics](/work/cancellation-reinstatement-analytics/) depend on two pairs of keys that gold creates: processed date and termination date, and the matching tenure band for each. Gold computes both tenure keys so the model can switch them together. The test log records that 16,816 events land in a different tenure band depending on the date basis, which is what justifies the toggle.
Row-level security keys off `gold_broker_user_map`, a mapping table with one row per broker, so adding a broker is a row and not a model change.

## Under the hood

### A generator that plants defects and keeps a register

`NB_Generate_Bronze` uses one NumPy generator with a fixed seed, so a rebuild gives the same files. Every planted defect is written to a register through a helper, and the register is saved next to the data.

```python
rng = np.random.default_rng(20260902)   # fixed seed => reproducible builds

N_POLICIES = 120_000
N_BROKERS  = 5_000
N_EVENTS   = 500_000
DATE_START = pd.Timestamp("2019-01-01")
DATE_END   = pd.Timestamp("2023-12-21")   # last refresh date of the modelled report

defect_log = []
def log_defect(code, desc, count):
    defect_log.append({"defect": code, "description": desc, "rows_affected": int(count)})
    print(f"  {code}: {desc} -> {count:,} rows")
```

The register has twelve classes: a sentinel value in benefit level (D1), case sizes of exactly 49 and 499 (D2), orphan broker, rep and termination-code keys (D3a to D3c), duplicate history rows (D4), null termination dates (D5), drifting text in state and termination code (D6a, D6b), whitespace and case drift in rep names (D7), negative live counts (D8) and future-dated events (D9).
Five of the 15 termination codes are flagged to be excluded in gold. They must exist in bronze, or the exclusion filter has nothing to remove and cannot be tested.

These lines show how a defect is planted and logged. Boundary values, negatives and true duplicates each target a specific failure downstream.

```python
# D2: force the exact boundary values that break Case_Size bucketing
boundary_idx = rng.choice(N_POLICIES, 900, replace=False)
live_count[boundary_idx[:450]] = 49
live_count[boundary_idx[450:]] = 499
log_defect("D2", "live_count of exactly 49 / 499 (Case_Size boundary bug)", 900)

# D8: negative live_count
neg_idx = rng.choice(N_POLICIES, 260, replace=False)
live_count[neg_idx] = -rng.integers(1, 40, 260)
log_defect("D8", "Negative live_count (out of range)", 260)

# D4: true duplicates, same histid
dupe_src = events.sample(n=15_000, random_state=42)
events = pd.concat([events, dupe_src], ignore_index=True)
log_defect("D4", "Duplicate history rows (identical histid)", 15_000)
```

### Silver: normalise first, then deduplicate

`DF_Silver` has seven queries that read the bronze CSVs and write Delta tables with the `Replace` update method. One shared folder query points at the bronze files and every table query references it, so there is one storage connection and one path to change when the project is promoted.

The order of steps matters. `Table.Distinct` keeps the first occurrence, so two rows that differ only by casing survive as separate rows if deduplication runs before cleaning. Deduplication is therefore the last step.
Future-dated events are flagged and then deleted. Bad values on real events are different: negative live counts are kept, the metric is set to null and a validity flag is added, because deleting 260 policies would understate every downstream count and nobody would notice.

This excerpt is the history query, shortened to the cleaning order.

```text
#"Trimmed text"      = Table.TransformColumns(Typed, {{"histermcode", each Text.Trim(_), type nullable text}}),
#"Uppercased text"   = Table.TransformColumns(#"Trimmed text", {{"histermcode", each Text.Upper(_), type nullable text}}),
#"Replaced value"    = Table.ReplaceValue(#"Uppercased text", "N.P.", "NP", Replacer.ReplaceText, {"histermcode"}),
#"Inserted conditional column" = Table.AddColumn(#"Replaced value", "is_future_dated",
                          each if [histdate] > #date(2023, 12, 21) then true else false),
#"Filtered rows 1"   = Table.SelectRows(#"Inserted conditional column", each ([is_future_dated] = false)),
#"Inserted conditional column 1" = Table.AddColumn(#"Filtered rows 1", "termination_date_missing",
                          each if [histtermdt] = null then true else false),
// last step: duplicates removed only after the text is normalised
#"Removed duplicates" = Table.Distinct(#"Inserted conditional column 1", {"histid"})
```

The silver log reconciles history exactly: 515,000 rows as landed, minus 9,585 future-dated, minus 15,000 duplicates, gives 490,415 rows. The first prediction was about 499,660. The gap was events that fall past the cutoff naturally, because the processed date is the termination date plus a random lag. The log records the correction instead of editing the expectation.

### Gold: one wide fact, orphans kept, a filter with a trap

`DF_Gold` reads the silver Delta output, so silver logic lives in one place and the two layers refresh independently. It left-joins history to policy, broker, rep, termination code, policy type and sales channel. Six helper queries read the silver dimensions with no output destination; they exist only as merge targets.

Orphans are coalesced to an Unknown member (key -1), not filtered out. An inner join would silently drop thousands of real events. The case-size bucketing tests values from the top down with one comparison per branch, so no value can fall through the gap that 49 and 499 used to hit.

```text
// Orphans: failed joins become the Unknown member, so no event disappears
#"Added custom"   = Table.AddColumn(Expanded, "broker_key", each if [brokerkey] = null then -1 else [brokerkey]),
#"Added custom 4" = Table.AddColumn(#"Added custom 3", "rep_name", each if [repname] = null then "UNASSIGNED" else [repname]),

// Case size: descending tests, one comparison per branch, no gap at 49 or 499
#"Added custom 6" = Table.AddColumn(#"Removed columns", "case_size",
    each if [livecount_valid] = false or [livecount_clean] = null then "Unknown"
    else if [livecount_clean] >= 500 then "500+"
    else if [livecount_clean] >= 50  then "50-499"
    else if [livecount_clean] >= 1   then "1-49"
    else "Unknown"),

// Excluded codes: coalesce the flag first, because null = false is not true in M
#"Added custom 14" = Table.AddColumn(#"Added custom 13", "excluded_flag",
    each if [excluded_in_gold] = null then false else [excluded_in_gold]),
#"Filtered rows"   = Table.SelectRows(#"Added custom 14", each ([excluded_flag] = false))
```

The last step came from a bug the test log records. 1,040 rows had a null exclusion flag, because their termination code was an orphan and the join failed. A filter written as `<> true` keeps nulls, and a filter written as `= false` drops all of them. Both look correct and neither raises an error. Coalescing the flag first makes the intent explicit.
The silver-to-gold reconciliation is exact: 41,897 events removed by the exclusion filter, and an independent count of events on excluded codes also gives 41,897.

One detail to verify in the gold fact query. The `termination_date_key` step builds year and month from the termination date but takes the day from the processed date. [OWNER: confirm this against the live dataflow. If it is still there, the day part should come from the termination date, because the inactive termination-date relationship joins on this key.]

### The bug that every technical check passed

After gold was built, 58,393 events, about 13 percent of the fact, were dated before their own policy's effective date. They landed in the "under 12 months" tenure band, and 61 percent of that band was logically impossible.
Row counts reconciled, there were no nulls, no orphans and all twelve defects were closed. The only signal was a tenure distribution that looked wrong next to a known reference.
The root cause was in the generator. Policy effective dates and event dates were produced independently. The fix was to derive each policy's effective date from its own earliest event, so non-negative tenure is guaranteed by construction. The gold layer also keeps a permanent guard that routes negative tenure to an Unknown key, because a real source can contain events dated before their policy.

```python
# Two cohorts: newer business with higher churn, and a long-tenured block.
# A single gamma cannot produce mass at both ends; a mixture can.
is_established = rng.random(N_POLICIES) < 0.30
tenure_years = np.where(
    is_established,
    rng.gamma(shape=3.0, scale=2.6, size=N_POLICIES),   # established: mean 7.8 yrs
    rng.gamma(shape=1.1, scale=1.6, size=N_POLICIES)    # newer:       mean 1.8 yrs
)
tenure_days = pd.Series(tenure_years * 365.25, index=np.arange(N_POLICIES)).clip(18, 10950)

# effective date = earliest event minus a drawn tenure, so it can never follow an event
anchored = first_event - pd.to_timedelta(tenure_days.loc[first_event.index], unit="D")
policies.loc[anchored.index, "effectivedate"] = anchored.values
```

The tenure distribution was tuned over four runs against reference percentages. The log notes that changing two parameters at once cost an iteration, and that tuning stopped when every band carried volume, because the reference came from one report on one date and further fitting would chase noise.

### Optimisation, and what was refused

`NB_Optimize_Gold` turns on V-Order and optimize-write, runs `OPTIMIZE ... VORDER` on the three large gold tables and prints the file count of each. After the run each table is one file.

```python
spark.conf.set("spark.sql.parquet.vorder.enabled", "true")
spark.conf.set("spark.databricks.delta.optimizeWrite.enabled", "true")
spark.conf.set("spark.databricks.delta.optimizeWrite.binSize", "1073741824")

tables = [
    "gold_fact_cancel_reinstatement",
    "gold_dim_date",
    "gold_dim_case_tenure",
]
for t in tables:
    spark.sql(f"OPTIMIZE {t} VORDER")
    n = len(spark.read.format("delta").load(f"Tables/{t}").inputFiles())
    print(f"  {t:36s} {n} file(s)")
```

Partitioning was left out deliberately. At about 448,000 rows, partitions by year and month would give roughly 60 files of about 7,500 rows each, far below the size where Parquet files pay off. DirectLake also reads column segments and does not use Delta file skipping, so V-Order matters here and directory layout does not.
A `ZORDER` attempt was refused by Delta, because the chosen columns sit beyond the first 32 columns that collect statistics. It was dropped, since a single file has nothing to skip.

### How the test log is organised

The log is a staged record. Bronze: row counts as landed and the defect register. Silver: counts, a row reconciliation, a defect resolution table and verification queries. Gold: counts, the exact reconciliation, defect closure for orphans and the case-size bug, tenure keys and the optimisation notes. Model, report and three test checkpoints follow: a partial-period comparison, a numerator and denominator check under the toggles, and a row-level security check.
The security check is marked partial. Only the unmapped-identity scenario was run, and the others are listed as not run. [OWNER: confirm whether the remaining scenarios were completed after the log was written.]

### Orchestration, refresh and promotion

There is no pipeline item in the project folder. The silver and gold dataflows are separate items that read and write Lakehouse tables, and the notebooks run on their own. [OWNER: confirm how the generator, the two dataflows and the optimise notebook were sequenced and scheduled, since the source holds no pipeline.]
A DirectLake model refreshes data, not schema. A column added in the gold dataflow does not appear in the model until the table is updated in the model, and a dataflow output remembers its column list, so a new column must be re-confirmed in the destination mapping or it is dropped without a message. Both points are recorded in the log.
One dataflow step replaces a broker's mapped identity with a test account for row-level security testing, and the log lists removing it before promotion. Promotion itself (UAT and main branches, a deployment pipeline and rebinding rules) is listed in the log as not started.

## Outcome

The pipeline guarantees that a rebuild from the seed gives the same files, that each of twelve planted defect classes has a recorded resolution, and that every row removed between bronze and gold is accounted for by a stated rule. It gives the model eight gold tables with unknown members, two tenure keys and four parameter tables, tuned with V-Order for DirectLake.
It also shows a testing habit worth reusing. Technical checks were not enough, and the tenure bug was caught by comparing a distribution with a business expectation.
[OWNER: add one real, true result if you have one; otherwise delete this line.]
