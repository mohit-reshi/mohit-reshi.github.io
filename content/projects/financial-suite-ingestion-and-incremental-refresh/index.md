---
slug: financial-suite-ingestion-and-incremental-refresh
title: "Financial Suite Ingestion"
kind: pipeline
group: portfolio
client_label: null
summary: "Fabric pipeline from source copies to bronze, silver and a Warehouse gold: change feed, MERGE upserts, watermarks, run log and incremental model refresh."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, PySpark, T-SQL, Dataflow Gen2, Fabric Data Pipelines, Semantic Link]
tags: [fabric, medallion, python, incremental-refresh, finance, power-bi]
featured: true
order: 32
draft: false
status: recorded-only
links: {}
model_doc: null
---

## Problem

This is the data engineering behind [Financial Statement Reporting Suite](/work/financial-statement-suite/). A finance report needs two things from its pipeline. Yesterday's numbers must arrive without reloading seven years of history, and a correction to an old row must still reach the report.
The daily pipeline therefore loads only what changed, keeps a control table of where it stopped, logs every run, and then refreshes only the semantic model partitions that need it.
All data is synthetic. A seeded generator builds seven years of history, plants eight defect types, and the silver layer has to find and fix each one.

## Data model

Bronze and silver are Delta tables in a Lakehouse with schemas. Gold is a Fabric Warehouse. The semantic model reads gold views in Import mode, and only the sales table has an incremental refresh policy.

```text
SOURCES (synthetic)                      LOAD                              BRONZE (Lakehouse, schema bronze)
 order system (SQL Server)   PL_Ingest_OMS_Bronze  3 Copy activities   ->  Brz_Sales  Brz_Products  Brz_GLAccounts
 receivables system (SQL)    PL_Ingest_AR_Bronze   3 Copy activities   ->  Brz_Regions  Brz_Customers  Brz_Invoices
 Excel and CSV files         DF_Ingest_Excel_Bronze (Dataflow Gen2)    ->  Brz_BalanceSheetData  Brz_CashFlowData
                                                                           Brz_ChannelRevenues  Brz_CompanyExpenses
 budget feed (REST)          [OWNER: confirm ingest path]              ->  Brz_Budget
 history 2019-2025           NB_Generate_Bronze_Historical (seed 42)
 2026 backfill, daily rows   NB_Bronze_Backfill_2026, NB_Bronze_Daily_Increment

SILVER (Lakehouse, schema silver)
 NB_Silver_Transform   full load, fixes 8 defects, writes Slv_*, Qrn_Sales, Rvw_Invoices
 NB_Silver_Incremental change feed + watermark + MERGE, keeps the same tables current

GOLD (Warehouse, schema gold)
 sp_Load*               full loads of dimensions, P&L, balance sheet, cash flow, budget
 sp_IncrementalFact*    staging + MERGE + delete + watermark, for sales and invoices
 vw_*                   one view per table, read by the model

MODEL    FS_Financial_Suite (Import) <- NB_Model_Refresh (policy refresh + targeted partitions)

PL_Daily_Financial_Suite:
 Bronze -> silver -> gold_SP_FactSales -> gold_SP_FactInvoices -> SemanticModel
                                                       |-- Succeeded -> Log_success
                                                       |-- Failed or Skipped -> Log_Skip-fail -> Fail
```

| Layer | Table | Grain |
|---|---|---|
| Silver | `Slv_Sales`, `Qrn_Sales` | one row per order line, clean or quarantined |
| Silver | `Slv_Invoices`, `Rvw_Invoices` | one row per invoice, clean or held for review |
| Silver | `Slv_Customers`, `Slv_Products`, `Slv_Regions`, `Slv_GLAccounts` | one row per member |
| Silver | `Slv_BalanceSheetData`, `Slv_CashFlowData`, `Slv_CompanyExpenses`, `Slv_ChannelRevenues`, `Slv_Budget` | statement line by year, or by month for expenses, revenue and budget |
| Silver | `Ctl_Watermark` | one row per incremental source table |
| Gold | `FactSales`, `FactInvoices` | order line, invoice |
| Gold | `FactProfitLoss`, `FactBudget` | month by account (revenue rows by channel) |
| Gold | `FactBalanceSheet`, `FactCashFlow` | year-end by statement item |
| Gold | `DimDate`, `DimCustomer`, `DimProduct`, `DimRegion`, `DimGLAccount` | one row per member |
| Gold | template tables and `AgedDebtorGroups` | statement layouts and ageing bands |
| Gold | `Ctl_GoldWatermark`, `Ctl_PipelineRunLog` | one row per fact, one row per run |

## Report

The report reads the Warehouse views through the SQL endpoint, so the model is Import mode and not DirectLake. [OWNER: confirm the storage mode before publishing; the model files show Import.]
The statement pages in [Financial Statement Reporting Suite](/work/financial-statement-suite/) read year-end and monthly facts that the full-load procedures build. The sales and invoice facts are the ones kept current by the daily pipeline.
The model has three territory roles that filter a region table, so region and territory attributes have to be clean before they reach it. Customers whose region could not be matched are given an Unknown territory in silver, and the silver comments note that no territory role will see them.

## Under the hood

### Bronze: history, backfill and a daily increment

`NB_Generate_Bronze_Historical` seeds Python and NumPy with 42 and builds 2019-01-01 to 2025-12-31. It then injects eight defect types with a seed offset of 1, so the defects are independent of the clean data and still reproducible. The eight are: null customer on sales (D1), duplicate invoice numbers (D2), future-dated orders (D3), negative asset values (D4), three GL code formats (D5), customers pointing at a region that does not exist (D6), an out-of-range invoice value (D7) and two month formats in expenses (D8).

Two notebooks extend history into 2026. `NB_Bronze_Backfill_2026` copies the same dates from 2025, shifted by twelve months, with 8 percent growth and plus or minus 5 percent noise. It asserts that the window holds at most 100 rows (the planted future-dated ones) before it writes, so a second run stops instead of duplicating the year. `NB_Bronze_Daily_Increment` does the same for one day: it takes the same calendar day of the previous year, seeds the noise from today's date and continues the key sequence from the current maximum.

This excerpt shows the three properties that make a daily generator safe to run twice: a guard, a deterministic seed and key continuation.

```python
TODAY   = date.today()
SRC_DAY = date(TODAY.year - 1, 2, 28) if (TODAY.month == 2 and TODAY.day == 29) \
          else TODAY.replace(year=TODAY.year - 1)
GROWTH  = 1.08
SEED    = int(TODAY.strftime("%Y%m%d"))

already = sales.filter(F.col("OrderDate") == str(TODAY)).count()
if already > 100:
    notebookutils.notebook.exit(f"Skipped: {already:,} rows already exist for {TODAY}")

max_order = sales.agg(F.max("OrderNumber")).collect()[0][0]
new_sales = (
    sales.filter((F.col("OrderDate") == str(SRC_DAY)) & F.col("CustomerIndex").isNotNull())
    .withColumn("OrderDate", F.lit(str(TODAY)))
    .withColumn("LineTotal",
        (F.col("LineTotal") * GROWTH * (0.95 + F.rand(SEED) * 0.10)).cast("decimal(12,2)"))
    .withColumn("OrderNumber",
        (F.lit(max_order) + F.row_number().over(Window.orderBy("OrderNumber"))).cast("int"))
)
```

The source day is filtered to rows with a customer, so the planted null-customer defect is not copied forward. New order numbers continue after the current maximum, which is what the silver watermark relies on.

### Silver full load: profile, fix, reconcile, quarantine

`NB_Silver_Transform` is the first load. Each cell profiles the defect before fixing it, fixes it, asserts that the counts reconcile and writes two audit columns, `_SilverLoadDate` and `_SourceTable`. The processing date is a fixed value, not today's date, so the future-dated check gives the same answer on any day.
The fixes follow one rule: keep the row unless it is wrong in a way that would mislead.

| Defect | Fix |
|---|---|
| Null customer, future-dated order | row moved to `Qrn_Sales` with a defect code (`D1`, `D3` or `D1+D3`) |
| Duplicate invoice number | keep the highest `InvoiceIndex` per number, using `row_number` over a window |
| Invoice above 100,000 | moved to `Rvw_Invoices` with a review reason |
| Invalid region | customer kept with territory `Unknown`, because invoices reference the customer |
| GL code in three formats | `regexp_extract` of the digits, then `lpad` to the form `GL-NNN` |
| Negative asset value | sign flipped, except accumulated depreciation, which is legitimately negative |
| Two month formats | `MM/YYYY` split and rebuilt as `YYYY-MM` |

Quarantine instead of delete is a design choice with a reason. A deleted row cannot be reviewed or reprocessed, and a count that drops without a trace cannot be explained. With a quarantine table, bronze equals silver plus quarantine, and that identity can be asserted.

### Silver incremental: change feed, watermark, MERGE

`NB_Silver_Incremental` keeps silver current after the full load. It turns on Delta change data feed for the two growing bronze tables and keeps one row per table in `Ctl_Watermark`: the key column, the highest key already processed, the last bronze version read and a run time. The control table is seeded from the highest key found in silver and quarantine together.

The first run has no bronze version, so it reads rows above the key watermark. Later runs read the change feed from the next version to the current one, keep inserts and update post-images, and take the latest change per key.

```python
def get_changes(table):
    c, path = ctl[table], f"{BRONZE}/{table}"
    end_v = bronze_version(table)
    if c.CdfVersion is None:
        df, mode = spark.read.format("delta").load(path).filter(F.col(c.KeyColumn) > c.KeyWatermark), "key-watermark"
    elif end_v > c.CdfVersion:
        df = (spark.read.format("delta")
              .option("readChangeFeed", "true")
              .option("startingVersion", c.CdfVersion + 1)
              .option("endingVersion", end_v)
              .load(path)
              .filter(F.col("_change_type").isin("insert", "update_postimage")))
        latest = Window.partitionBy(c.KeyColumn).orderBy(F.col("_commit_version").desc())
        df = (df.withColumn("_r", F.row_number().over(latest)).filter("_r = 1")
                .drop("_r", "_change_type", "_commit_version", "_commit_timestamp"))
        mode = "cdf"
    else:
        df, mode = spark.read.format("delta").load(path).limit(0), "no-change"
    return df, end_v
```

The latest-per-key window matters. A key changed twice between runs appears twice in the feed, and a MERGE with two source rows for one target row fails.

Sales are then split into clean and quarantined rows, the two counts are asserted to add up to the input, and four MERGEs keep the tables consistent. Two upserts write each side. Two deletes remove a key from the table it no longer belongs in, so a row that is corrected in bronze leaves quarantine and enters silver, and the reverse.

```python
assert n_clean + n_qrn == n_in, f"Lost rows: {n_clean} + {n_qrn} != {n_in}"

slv.alias("t").merge(clean.alias("s"), "t.OrderNumber = s.OrderNumber") \
   .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
q.alias("t").merge(qrn.alias("s"), "t.OrderNumber = s.OrderNumber") \
   .whenMatchedUpdateAll().whenNotMatchedInsertAll().execute()
# a corrected row leaves quarantine, a newly bad row leaves silver
q.alias("t").merge(clean.select("OrderNumber").alias("s"), "t.OrderNumber = s.OrderNumber") \
   .whenMatchedDelete().execute()
slv.alias("t").merge(qrn.select("OrderNumber").alias("s"), "t.OrderNumber = s.OrderNumber") \
   .whenMatchedDelete().execute()
```

Invoices follow the same shape with a different key. They are deduplicated on invoice number, rows above the 100,000 threshold go to `Rvw_Invoices`, and every update and delete carries the condition `s.InvoiceIndex > t.InvoiceIndex`, so an older copy can never overwrite a newer one.
The watermark is written last, after both tables merge. If the notebook fails halfway, the next run reads the same changes again, and because every write is a MERGE, rereading is harmless. The notebook ends by checking that bronze equals silver plus quarantine, and silver plus review for invoices, and prints PASS or FAIL.

### Gold: staging, MERGE and a second watermark

The full-load procedures drop and recreate each gold table from silver, which is how dimensions, the P&L, balance sheet, cash flow and budget facts are built. Statement facts join to the date dimension on month starts or on year-end, so each statement row has exactly one date key and nothing fans out.
`DimCustomer` has the columns of a type 2 dimension (`IsCurrent`, `ValidFrom`, `ValidTo`) but one row per customer. The flag comes from silver, and no new version is created when an attribute changes. It keeps inactive customers so old invoices still resolve.

Sales and invoices have a separate incremental procedure. It reads its watermark from `Ctl_GoldWatermark`, stages the changed silver rows with surrogate keys resolved, upserts with MERGE, removes rows that left silver, and moves the watermark last.

```sql
-- 1. stage changed silver rows, keys resolved; unknown customer becomes -1
TRUNCATE TABLE gold.Stg_FactSales;
INSERT INTO gold.Stg_FactSales
SELECT s.OrderNumber, d.DateKey, ISNULL(c.CustomerKey, -1), p.ProductKey, r.RegionKey,
       s.Channel, s.CurrencyCode, s.OrderQuantity, s.LineTotal, p.UnitCost,
       CAST(s.LineTotal - (p.UnitCost * s.OrderQuantity) AS DECIMAL(12,2)),
       s._SilverLoadDate
FROM FS_Financial_Lakehouse.silver.Slv_Sales s
JOIN gold.DimDate d          ON d.FullDate = s.OrderDate
LEFT JOIN gold.DimCustomer c ON c.CustomerIndex = s.CustomerIndex AND c.IsCurrent = 1
JOIN gold.DimProduct p       ON p.ProductIndex = s.ProductIndex
JOIN gold.DimRegion r        ON r.RegionIndex = s.RegionIndex
WHERE s._SilverLoadDate >= @wm;

-- 2. upsert   3. delete rows that left silver   4. watermark last
MERGE gold.FactSales AS t USING gold.Stg_FactSales AS s ON t.OrderNumber = s.OrderNumber
WHEN MATCHED THEN UPDATE SET t.LineTotal = s.LineTotal, t.GrossProfit = s.GrossProfit /* ...other columns */
WHEN NOT MATCHED BY TARGET THEN INSERT /* ...all columns */;
```

The filter uses `>=`, so the watermark day is read again on every run. That costs a little work and removes the risk of missing rows loaded later on the same day, and MERGE makes the repeat safe. The silver-to-gold step also runs a delete for rows that are no longer in silver, so a row that moved to quarantine disappears from the fact table. The watermark moves only to the highest load date actually staged, and the procedure records `LastRowsStaged` for each run.
The invoice procedure stores a ready-made ageing bucket measured from a fixed date in the code. [OWNER: confirm that the report ages invoices with its own as-of-date logic and does not read this stored bucket.]

### The pipeline, with a run log

`PL_Daily_Financial_Suite` has five working activities in a straight chain. Each depends on the one before with the condition `Succeeded`. The two stored-procedure activities run one after the other, so gold sales finish before gold invoices start. Every activity has a 12 hour timeout and no retries. The pipeline has no parameters, and the item stores no schedule. [OWNER: confirm the schedule, which lives outside the item.]

The end of the pipeline is worth reading closely. One Script activity logs success when the model refresh succeeds. A second logs failure when the model refresh `Failed` or `Skipped`. A step that fails earlier in the chain makes every later activity skip, so a single handler on the last activity catches a failure anywhere. The handler writes a row to `Ctl_PipelineRunLog` with the run id, then a `Fail` activity ends the run with an error code.
Without that last activity, handling the error would mark the pipeline as succeeded in Monitor. With it, the log has the row and the run still shows as failed.

### Incremental refresh and the late-correction gap

The `Sales` table in the model has a refresh policy: a rolling window of 8 years, with a 3 day incremental period. The source query filters the gold sales view on an integer date key, and a small function turns the `RangeStart` and `RangeEnd` parameters into that key so the filter can be pushed to the Warehouse.

```text
refreshPolicy
    policyType: basic
    rollingWindowGranularity: year
    rollingWindowPeriods: 8
    incrementalGranularity: day
    incrementalPeriods: 3
    sourceExpression =
        let
            Source   = Sql.Database(<warehouse endpoint>, "FS_Financial_Warehouse"),
            gold_vw_FactSales = Source{[Schema="gold", Item="vw_FactSales"]}[Data],
            Filtered = Table.SelectRows(gold_vw_FactSales,
                each [DateKey] >= fnDateKey(RangeStart) and [DateKey] < fnDateKey(RangeEnd))
        in
            Filtered
```

Incremental refresh has a blind spot. It refreshes the last three days. If a row for an older date is corrected or removed today, the policy never touches that old partition, and the report keeps the stale number.
`NB_Model_Refresh` closes that gap in three steps. It runs a refresh with the policy applied, which rolls the window and reloads the recent partitions. It then asks silver which order dates before the window were loaded or quarantined today. Finally it looks up the partitions that cover those dates and refreshes only them.

```python
changed = (spark.read.format("delta").load(f"{SILVER}/Slv_Sales")
           .filter((F.col("_SilverLoadDate") == str(TODAY)) & (F.col("OrderDate") < F.lit(WINDOW_START)))
           .select("OrderDate"))
removed = (spark.read.format("delta").load(f"{SILVER}/Qrn_Sales")
           .filter((F.col("_QuarantineDate") == str(TODAY)) & (F.col("OrderDate") < F.lit(WINDOW_START)))
           .select("OrderDate"))
old_dates = [r.OrderDate for r in changed.union(removed).distinct().collect()]

parts = fabric.evaluate_dax(MODEL, """
EVALUATE
VAR t = SELECTCOLUMNS(FILTER(INFO.TABLES(), [Name] = "Sales"), "TID", [ID])
RETURN SELECTCOLUMNS(FILTER(INFO.PARTITIONS(), [TableID] IN t),
    "Partition", [Name], "RangeStart", [RangeStart], "RangeEnd", [RangeEnd])
""", workspace=WORKSPACE)

targets = set()
for d in old_dates:
    ts = pd.Timestamp(d)
    hit = parts[(parts["RangeStart"] <= ts) & (parts["RangeEnd"] > ts)]
    targets.update(hit["Partition"].tolist())
if targets:
    run_refresh(refresh_type="full",
                objects=[{"table": "Sales", "partition": p} for p in sorted(targets)],
                apply_refresh_policy=False, effective_date=TODAY)
```

The refresh helper submits the request through Semantic Link and then polls every 15 seconds for up to 60 minutes. It returns on `Completed` and raises on `Failed`, `Cancelled`, `Disabled` or `TimedOut`, so a failed model refresh fails the pipeline activity and reaches the failure handler. Only the `Sales` table has a policy, so the targeted step covers sales and not invoices.

### What the sources do not show

The project test log holds the environment notes and a branch name for development, and no test results are recorded. The source folder holds no schedule, no deployment pipeline and no record of branches beyond that development branch. [OWNER: confirm the dev, UAT and main flow before the page claims it.]

## Outcome

The pipeline guarantees that each daily run loads only changed rows, that bronze reconciles to silver plus quarantine, that rows are upserted by key so a rerun cannot duplicate them, and that every run leaves a row in a log table with its status. It also guarantees that a correction to an old sales row reaches the model, because the refresh notebook reloads exactly the partitions that cover it.
The report can therefore keep an 8 year window of sales while each refresh touches only recent partitions and the few old ones that changed.
[OWNER: add one real, true result if you have one; otherwise delete this line.]
