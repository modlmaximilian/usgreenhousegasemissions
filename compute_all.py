import pandas as pd

# Load CSV
df = pd.read_csv("combined_nei_grouped_2010_2023.csv")

# Clean columns and normalize State/City names
df.columns = df.columns.str.strip()
df["State"] = df["State"].str.strip()
df["City"] = df["City"].str.strip().str.upper()
df["Industry Type (sectors)"] = df["Industry Type (sectors)"].str.strip()

# Aggregate US totals per year per industry
us_totals = df.groupby(["Year", "Industry Type (sectors)"]).agg({
    "Total reported direct emissions": "sum",
    "CO2 emissions (non-biogenic)": "sum",
    "Methane (CH4) emissions": "sum",
    "Nitrous Oxide (N2O) emissions": "sum"
}).reset_index()

us_totals["State"] = "ALL"
us_totals["City"] = "ALL"

# Reorder columns like original CSV
cols = df.columns.tolist()
us_totals = us_totals[cols]

# Combine original rows + US totals
final_df = pd.concat([df, us_totals], ignore_index=True)

# Save new CSV
final_df.to_csv("combined_nei_grouped_2010_2023_final.csv", index=False)
