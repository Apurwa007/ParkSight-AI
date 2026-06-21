import os
import sys
import pandas as pd
from sqlalchemy import text
from database import engine, Base
from models import Violation

# Ensure we're in the backend directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Locate CSV
csv_path = "../jan to may police violation_anonymized791b166.csv"
if not os.path.isfile(csv_path):
    csv_path = "jan to may police violation_anonymized791b166.csv"
if not os.path.isfile(csv_path):
    csv_path = "dataset.csv"

if not os.path.isfile(csv_path):
    print("Error: CSV file not found!")
    sys.exit(1)

print(f"Located dataset at: {csv_path}")

# Initialize tables
print("Ensuring tables are created...")
Base.metadata.create_all(bind=engine)

# Clear existing violations
print("Clearing existing violations from database...")
with engine.begin() as conn:
    conn.execute(text("TRUNCATE TABLE violations CASCADE;"))

print("Starting chunked upload to PostgreSQL...")
chunksize = 20000
total_uploaded = 0

# Read CSV in chunks
for chunk in pd.read_csv(csv_path, chunksize=chunksize, usecols=[
    'id', 'latitude', 'longitude', 'created_datetime', 'location', 'junction_name'
]):
    # Preprocess chunk
    chunk['created_datetime'] = pd.to_datetime(chunk['created_datetime'], errors='coerce')
    chunk = chunk.dropna(subset=['latitude', 'longitude', 'created_datetime'])
    
    # Save to SQL
    chunk.to_sql(name='violations', con=engine, if_exists='append', index=False)
    
    total_uploaded += len(chunk)
    print(f"Uploaded {total_uploaded} rows...")

print(f"Success! Uploaded a total of {total_uploaded} rows to Neon Postgres.")
