---
slug: manufacturing-medallion-pipeline
title: "Manufacturing Medallion Pipeline"
kind: pipeline
group: portfolio
client_label: null
summary: "PySpark medallion pipeline in Fabric: seeded synthetic data, bronze to gold Delta tables, three validation gates and one chained pipeline."
role: "Power BI & Fabric developer"
year: 2026
tools: [Microsoft Fabric, PySpark, Delta Lake, Fabric Data Pipelines]
tags: [fabric, medallion, python, directlake, manufacturing]
featured: true
order: 12
draft: false
status: recorded-only
links: {}
model_doc: null
---

## Problem

This is the data engineering behind [Manufacturing Sales Analytics](/work/manufacturing-sales-analytics/). A report is only as trustworthy as the tables under it, so the job here was to turn raw sales extracts into a small set of tested tables that a DirectLake model can read.
Three things had to hold. Every run had to produce the same result. Each layer had to be checked before the next one started. The report had to read a few small tables, not scan transactions.
All data is synthetic. The first notebook generates it with fixed seeds, which is what makes exact-count tests possible later.

## Data model

Seven notebooks and one pipeline. Each layer is a set of Delta tables in one Lakehouse, and a validation notebook sits between every pair of layers.

```text
PL_Generate_Manufacturing_Data   (6 activities in a chain, concurrency 1)

NB_Generate_Synthetic_Data  ->  bronze_*   7 tables, overwrite
NB_Validate_Bronze              gate 1: counts, nulls, net reconciliation, orphan keys
NB_Transform_Silver         ->  silver_*   7 tables, typed + derived columns
NB_Validate_Silver              gate 2: parity, types, derived values, ranges
NB_Aggregate_Gold           ->  gold_*     4 tables, joined + aggregated
NB_Validate_Gold                gate 3: counts, silver-to-gold totals, business rules
                                   |
                  Manufacturing_Lakehouse  ->  DirectLake semantic model  ->  report
```

| Layer | Tables | Grain |
|---|---|---|
| Bronze | `bronze_dim_date` | one row per calendar day, 2022-01-01 to 2024-12-31 |
| Bronze | `bronze_dim_channel`, `bronze_dim_product`, `bronze_dim_sales_rep`, `bronze_dim_customer` | one row per member (5 channels, 150 products, 30 reps, 500 customers) |
| Bronze | `bronze_dim_budget` | channel by month, 3 years |
| Bronze | `bronze_fact_sales` | one row per order line (50,000) |
| Silver | the same seven names with a `silver_` prefix | same grain, typed, with derived columns |
| Gold | `gold_sales_summary` | date, product, channel, rep and customer |
| Gold | `gold_customer_summary` | customer by year |
| Gold | `gold_budget_actuals` | channel by month, actuals next to budget |
| Gold | `gold_rep_performance` | rep by month, with rank |

The product dimension is built as 3 categories by 5 subcategories by 10 items. The date dimension carries a fiscal year that starts in July.
With this data every combination in `gold_sales_summary` occurs once, so it has as many rows as the fact table, and the gold validator expects 50,000.

## Report

The semantic model reads the four gold tables in DirectLake, so the model holds no copy of the data. The mapping to the [Manufacturing Sales Analytics](/work/manufacturing-sales-analytics/) pages is direct. The sales summary feeds revenue, product and channel pages. The customer summary feeds the customer page. Rep performance feeds the rep page and its drillthrough. Budget vs actuals feeds the budget variance measures.
The pipeline has no semantic model refresh activity. DirectLake reads the Delta tables the pipeline just wrote. [OWNER: confirm the model's setting for keeping Direct Lake data up to date, so the page can say how new loads become visible.]
Aggregation happens in the notebook so it can be tested. A column that a notebook computed once and a validator checked is easier to trust than the same logic repeated in several measures.

## Under the hood

### Seeded synthetic data

`NB_Generate_Synthetic_Data` seeds Python and NumPy with 42 and writes the seven bronze tables with `overwrite`. Revenue has shape: a channel mix of 40, 30, 15, 10 and 5 percent, a 1.3 multiplier in October to December, 0.85 in January and February, and returns on about a quarter of orders.
Without a seed, the row counts would still match but every sum would change run to run, and a reconciliation test could only check "close enough".

The next excerpt shows how one order line is built. The seasonality, the weighted channel pick and the optional return all come from the seed.

```python
random.seed(42)          # set once at the top of the notebook
np.random.seed(42)

for i in range(50000):
    order_date_key, order_date = random_date_key(date(2022, 1, 1), date(2024, 12, 31))

    # Q4 peaks, January and February dip
    month = order_date.month
    seasonal = 1.3 if month in [10, 11, 12] else 0.85 if month in [1, 2] else 1.0

    channel_key = random.choices(channel_keys, weights=channel_weights)[0]
    units = random.randint(1, 20)
    list_price = random.uniform(50, 2000)
    gross_revenue = round(units * list_price * seasonal, 2)

    # returns are 8-15% of gross on about 25% of orders
    has_return = random.random() < 0.25
    returns = round(-gross_revenue * random.uniform(0.08, 0.15), 2) if has_return else 0.0
    standard_cost = round(gross_revenue * random.uniform(0.35, 0.55), 2)
```

### Silver: one typed contract

Silver reads each bronze table and does four things: cast to explicit types, trim text, round money to two decimals, and add derived columns. The fact table gets `GrossProfit`, `HasReturn` and `ReturnRate`. Products get `GrossMarginPct`, customers get `CustomerTenureDays`, reps get `MonthlyTarget`, and budget rows get `NetRevenueBudget` and a `DateKey` built from year and month.
Each table is written with `overwrite`, so a rerun rebuilds silver from bronze and never appends duplicates. Computing derived values once here means the DAX layer and the gold layer cannot disagree about what "return rate" means.

This excerpt shows the fact table step. The `when` guard on `ReturnRate` avoids a divide by zero and keeps the column inside 0 to 1, which the silver validator later asserts.

```python
silver_sales = bronze_sales.select(
    col("SalesKey").cast(IntegerType()),
    col("OrderDateKey").cast(IntegerType()),
    round(col("GrossRevenue").cast(DoubleType()), 2).alias("GrossRevenue"),
    round(col("Returns").cast(DoubleType()), 2).alias("Returns"),
    round(col("StandardCost").cast(DoubleType()), 2).alias("StandardCost"),
    # remaining keys and measures are cast the same way
).withColumn(
    "GrossProfit", round(col("GrossRevenue") - col("StandardCost"), 2)
).withColumn(
    "HasReturn", when(col("Returns") < 0, lit(1)).otherwise(lit(0))
).withColumn(
    "ReturnRate",
    when(col("GrossRevenue") > 0,
         round(abs(col("Returns")) / col("GrossRevenue"), 4)
    ).otherwise(lit(0.0))
)

silver_sales.write.mode("overwrite").saveAsTable("silver_fact_sales")
```

### Gold: join, aggregate, rank

`NB_Aggregate_Gold` reads all seven silver tables once, then builds four tables. The joins are `left` joins from the fact table, so a missing dimension key cannot silently remove a sale. An inner join would drop those rows with no error.

Budget vs actuals aggregates actuals to channel and month, then joins the budget on year, month and channel. Variance is stored as a percentage and as basis points, which is the unit the report's budget measure uses. This excerpt is shortened to the join and the variance columns.

```python
actuals = fact.join(dim_date, fact.OrderDateKey == dim_date.DateKey, "left") \
    .groupBy(dim_date.Year, dim_date.Month, dim_date.MonthKey, fact.ChannelKey) \
    .agg(round(sum("GrossRevenue"), 2).alias("ActualGrossRevenue"))

gold_budget = actuals.join(
    dim_budget,
    (actuals.Year == dim_budget.Year) &
    (actuals.Month == dim_budget.Month) &
    (actuals.ChannelKey == dim_budget.ChannelKey),
    "left"
).withColumn(
    "RevenueVariance",
    round(col("ActualGrossRevenue") - col("GrossRevenueBudget"), 2)
).withColumn(
    "VariancePct",
    round((col("ActualGrossRevenue") - col("GrossRevenueBudget")) / col("GrossRevenueBudget"), 4)
).withColumn(
    "VarianceBPS", round(col("VariancePct") * 10000, 1)
)
gold_budget.write.mode("overwrite").saveAsTable("gold_budget_actuals")
```

Rep performance is summed to rep and month, compared with a monthly target, and ranked inside each month with window functions. `dense_rank` gives ties the same rank. `percent_rank` gives a 0 to 1 position that a report can bucket without recomputing.

```python
gold_rep = gold_rep.withColumn(
    "MonthlyTargetAchievement", round(col("GrossRevenue") / col("MonthlyTarget"), 4)
).withColumn(
    "TargetVariance", round(col("GrossRevenue") - col("MonthlyTarget"), 2)
)

# rank reps inside each year-month
window_month = Window.partitionBy("Year", "Month").orderBy(col("GrossRevenue").desc())
gold_rep = gold_rep.withColumn("MonthlyRank", dense_rank().over(window_month)) \
    .withColumn("PercentileRank", round(percent_rank().over(window_month), 4))
gold_rep.write.mode("overwrite").saveAsTable("gold_rep_performance")
```

### Three validation gates

Each gate is a notebook of small checks. What each one asserts:

| Gate | Checks |
|---|---|
| Bronze | row count per table against expected (1,096 dates, 5, 150, 30, 500, 180, 50,000); no nulls in fact keys and dimension keys; `NetRevenue` equals gross plus returns within a tolerance of 1.00; no orphan product, customer, channel or date keys in the fact |
| Silver | row parity with bronze for all seven tables; fact column types; `GrossProfit`, `HasReturn` and `ReturnRate` recomputed and compared; `GrossMarginPct` and `ReturnRate` between 0 and 1; tenure never negative |
| Gold | row counts (50,000, 1,500, 180, 1,080); gross, net and units match between silver and gold within 1.00; basis points equal percentage times 10,000; target achievement equals revenue over target; ranks at least 1; percentile between 0 and 1 |

The gold counts follow from the seed and the grain. 1,500 is 500 customers by 3 years. 180 is 5 channels by 36 months. 1,080 is 30 reps by 36 months.

This excerpt shows two kinds of check side by side: a referential check written as a left join, and a total that must survive the move from silver to gold.

```python
orphan_products = spark.sql("""
    SELECT COUNT(*) FROM bronze_fact_sales f
    LEFT JOIN bronze_dim_product p ON f.ProductKey = p.ProductKey
    WHERE p.ProductKey IS NULL
""").collect()[0][0]

silver_gross = spark.sql("SELECT ROUND(SUM(GrossRevenue), 2) FROM silver_fact_sales").collect()[0][0]
gold_gross   = spark.sql("SELECT ROUND(SUM(GrossRevenue), 2) FROM gold_sales_summary").collect()[0][0]

tolerance = 1.0
diff = abs(silver_gross - gold_gross)
status = "PASS" if diff <= tolerance else "FAIL"
print(f"{status} GrossRevenue: silver={silver_gross:,.2f}, gold={gold_gross:,.2f}, diff={diff:.2f}")
```

The totals check is the one to reuse. It catches a join that fans out or drops rows, which a row count alone can miss when the two errors cancel.

### Orchestration

`PL_Generate_Manufacturing_Data` has six notebook activities. Each one depends on the previous one with the condition `Succeeded`, so a gate that fails stops the chain. Every activity has a 12 hour timeout, no retries and a 30 second retry interval, and the pipeline runs with concurrency 1 so two runs cannot overwrite each other's tables. The pipeline has no parameters. The item stores no schedule. [OWNER: confirm whether this ran on demand or on a schedule.]

### What I would change

The validation notebooks print PASS or FAIL and the closing summary cell prints PASS without testing anything. None of the three notebooks contains an `assert` or a `raise`. As written, a failed check would show in the output and the pipeline would still continue. To make the gates real, each notebook should raise at the end when `all_passed` is false. That is a short change, and it is the first one to make before reusing this pattern.
The gold notebook also still holds a first draft of the customer summary above the final one. The later cell overwrites the table, so the result is right, but the dead cell should go.

## Outcome

The pipeline guarantees that the same seed produces the same seven bronze tables, that every silver and gold table can be traced back to the layer below it, and that the gold totals reconcile to silver within a stated tolerance. It gives the semantic model four small, typed gold tables in DirectLake, with ranks, variances and basis points already computed, so the report's measures stay short.
The notebooks and the pipeline are stored as text in Fabric Git format, so a change to a check or a join shows up as a readable diff. [OWNER: confirm the dev, UAT and main branch flow used for this project before stating it.]
[OWNER: add one real, true result if you have one; otherwise delete this line.]
