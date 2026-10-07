// Fictional sample data shown until the visitor adds their own. The person and every company are invented.
/** Dates are relative to today so the sample always reads as roughly eight years of experience. */
export function sampleResume(now) {
  const Y = (now || new Date()).getFullYear();
  return `Jordan Avery
Senior Data Analyst
Leeds, United Kingdom | jordan.avery@example.com | +44 7700 900123 | linkedin.com/in/jordan-avery-sample

SUMMARY
Senior data analyst with 8 years of experience turning messy operational data into decisions for retail and logistics teams. Strong in SQL, Python and Power BI, and comfortable presenting findings to senior stakeholders.

EXPERIENCE
Senior Data Analyst | Brightleaf Analytics | Mar ${Y - 3} - Present
- Built a self-service sales dashboard in Power BI used by 40 regional managers, replacing 12 manual weekly reports
- Designed SQL models on Snowflake that cut monthly reporting time from 3 days to 4 hours
- Led an A/B testing programme on checkout changes that raised conversion by 6.2%
- Mentored two junior analysts and ran weekly office hours on SQL and data storytelling
- Responsible for data quality checks across 15 source tables

Data Analyst | Harborline Logistics | Jun ${Y - 6} - Feb ${Y - 3}
- Automated delivery performance reporting in Python, saving the operations team 10 hours a week
- Forecast weekly parcel volumes with a seasonal model that reached 92% accuracy
- Worked with warehouse managers to define on-time delivery KPIs
- Built Excel and Power BI reports for the finance team

Junior Analyst | Pinecrest Retail | Sep ${Y - 8} - May ${Y - 6}
- Cleaned and joined store sales data from 3 systems in SQL Server
- Helped with monthly category performance packs
- Supported the pricing team with ad hoc analysis

PROJECTS
Customer Churn Analysis | Python, SQL, Power BI
- Combined billing and support data to find the three behaviours that most often came before a cancellation
- Presented a retention plan to the commercial director that was adopted for the next quarter

Store Footfall Dashboard
- Visualised hourly footfall against staffing levels for 60 stores
- Used the results to propose a new rota pattern for peak hours

PERSONAL PROJECTS
Cycling Route Planner | Python, SQLite
- Built a small tool that ranks local cycling routes by elevation, surface and traffic from open data
- Published the code on GitHub and wrote a short post about the scoring method

SKILLS
Languages: SQL, Python, R, DAX
BI and data: Power BI, Excel, Snowflake, SQL Server, dbt, Git
Practice: A/B testing, forecasting, stakeholder management, data storytelling, mentoring

EDUCATION
BSc Mathematics and Statistics, University of Northfield, ${Y - 8}

CERTIFICATIONS
Microsoft Certified: Power BI Data Analyst Associate
`;
}

export const SAMPLE_JD = `Senior Data Analyst
Fernwood Mobility
Location: Manchester, hybrid

About Fernwood Mobility
Fernwood Mobility runs shared bikes and scooters in 20 cities. Our analytics team helps city operations and product teams decide where to put vehicles and what to build next.

The role
We are looking for a Senior Data Analyst to own reporting and analysis for our city operations teams.

Responsibilities
- Build and maintain dashboards in Power BI for city managers and the product team
- Write clear, well-tested SQL against our Snowflake warehouse
- Design and analyse A/B tests with product managers
- Present findings and recommendations to senior stakeholders
- Mentor junior analysts and raise the standard of analysis across the team

Requirements
- 6+ years of experience in an analytics role
- Strong SQL and experience with a cloud data warehouse such as Snowflake or BigQuery
- Experience building dashboards in Power BI or Tableau
- Python or R for analysis
- Experience designing and analysing experiments
- Excellent stakeholder management and communication skills

Nice to have
- Experience with dbt
- Forecasting or demand modelling
- Knowledge of geospatial data

To apply, send your CV to talent@fernwoodmobility.example
`;
