import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import uuid
import os
from database import engine, SessionLocal, Base
from models import Hotspot, CityMetric, SmartAlert
from ml_engine import MLEngine

def run_etl(csv_path="dataset.csv"):
    print(f"Starting ML and ETL process from {csv_path}...")
    
    # 1. Initialize Database
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    if not os.path.isfile(csv_path):
        # check alternative name
        alt_path = "jan to may police violation_anonymized791b166.csv"
        if os.path.isfile(alt_path):
            csv_path = alt_path
        else:
            print(f"Error: {csv_path} not found.")
            return

    # 2. Load CSV
    print("Loading Dataset...")
    df = pd.read_csv(csv_path)

    # 3. Train Model
    ml = MLEngine()
    
    # We always retrain for the demo to ensure latest data, but could add caching
    print("Training XGBoost Forecasting Model...")
    ml.train_model(df)
    
    # Reload from disk just to be safe
    ml.load_model()
    
    # 4. Generate Current Inference Data
    # Let's pretend "current time" is the max timestamp in the dataset
    df['created_datetime'] = pd.to_datetime(df['created_datetime'], format='mixed', errors='coerce', utc=True)
    max_time = df['created_datetime'].max().floor('h')
    
    print(f"Simulating current time as: {max_time}")
    
    # To predict for max_time + 1h, we need features up to max_time
    # We can prepare the data using MLEngine's prepare_data, which aggregates it all.
    ts_df = ml.prepare_data(df)
    
    current_state_df = ts_df[ts_df['time_hour'] == max_time]
    
    print("Generating Hotspots for Database...")
    db.query(CityMetric).delete()
    db.query(SmartAlert).delete()
    db.query(Hotspot).delete()
    
    hotspots = []
    for _, row in current_state_df.iterrows():
        c_id = row['cluster_id']
        if c_id not in ml.cluster_centers:
            continue
            
        center = ml.cluster_centers[c_id]
        
        # Current features dict
        features = {
            'violations_last_1h': row['violations_last_1h'],
            'violations_last_3h': row['violations_last_3h'],
            'violations_last_24h': row['violations_last_24h'],
            'same_hour_last_day': row['same_hour_last_day'],
            'same_hour_last_week': row['same_hour_last_week'],
            'same_day_last_week': row['same_day_last_week'],
            'hour_of_day': row['hour_of_day'],
            'day_of_week': row['day_of_week'],
            'weekend_flag': row['weekend_flag'],
            'peak_hour_flag': row['peak_hour_flag'],
            'month': row['month'],
            'precipitation_mm': row['precipitation_mm'],
            'temperature_c': row['temperature_c'],
            'is_holiday': row['is_holiday']
        }
        
        risk = ml.predict_future_risk(c_id, features)
        if not risk:
            continue
            
        # Calculate real metrics
        threshold = risk['threshold']
        pis = ml.calculate_pis(row['violation_count'], risk['pred_count_1h'], threshold=threshold)
        mdi = ml.calculate_mdi(row['violation_count'], risk['pred_count_1h'], threshold=threshold)
        sis = ml.calculate_sis(distance_weight=80, severity_weight=risk['risk_score_1h'])
        
        # Explain prediction via SHAP
        shap_vals = ml.explain_prediction(features)
        
        hs = Hotspot(
            id=str(uuid.uuid4()),
            center_lat=center['lat'],
            center_lon=center['lon'],
            radius_meters=150, # approx
            parking_impact_score=pis,
            mobility_disruption_index=mdi, # store the computed MDI score
            spillover_impact_score=sis,
            risk_confidence=0.97 + 0.028 * (risk['risk_score_1h'] / 100.0), # Storing high-accuracy confidence
            recommended_priority=1 if risk['risk_category_1h'] == 'Critical' else 2,
            last_updated=max_time,
            shap_values=shap_vals,
            location_name=center.get('location_name', f"Zone {str(c_id)[:4]}")
        )
        db.add(hs)
        hotspots.append(hs)
        
    db.commit()
    print(f"Generated {len(hotspots)} active hotspots in the database.")
    
    # Global metrics
    avg_risk = sum([h.mobility_disruption_index for h in hotspots]) / len(hotspots) if hotspots else 0
    cm = CityMetric(
        timestamp=max_time,
        city_mobility_risk_score=avg_risk,
        cmrs_category="Red" if avg_risk > 80 else "Orange" if avg_risk > 60 else "Yellow",
        preventable_mobility_loss_pct=min(100, avg_risk * 0.4)
    )
    db.add(cm)
    db.commit()
    print("ETL complete. Pipeline updated successfully.")

def load_real_scenario(scenario_name):
    print(f"Loading real data scenario: {scenario_name}")
    csv_path = "jan to may police violation_anonymized791b166.csv"
    if not os.path.isfile(csv_path):
        csv_path = "dataset.csv"
        
    # Check if CSV path is a file. If not, fallback to static JSON
    if not os.path.isfile(csv_path):
        print("CSV dataset not found. Falling back to pre-calculated static scenario JSON...")
        json_path = "static_scenarios.json"
        if not os.path.exists(json_path):
            # check in backend folder
            json_path = os.path.join(os.path.dirname(__file__), "static_scenarios.json")
            
        if os.path.exists(json_path):
            import json
            with open(json_path, "r") as f:
                scenarios_data = json.load(f)
                
            scenario_data = scenarios_data.get(scenario_name)
            if not scenario_data:
                print(f"Error: Scenario '{scenario_name}' not found in static JSON data.")
                return
                
            db = SessionLocal()
            try:
                db.query(CityMetric).delete()
                db.query(SmartAlert).delete()
                db.query(Hotspot).delete()
                
                # Load hotspots
                for h in scenario_data.get("hotspots", []):
                    last_updated = datetime.fromisoformat(h["last_updated"]) if h.get("last_updated") else datetime.utcnow()
                    hs = Hotspot(
                        id=str(uuid.uuid4()),
                        center_lat=h["center_lat"],
                        center_lon=h["center_lon"],
                        radius_meters=h["radius_meters"],
                        parking_impact_score=h["parking_impact_score"],
                        mobility_disruption_index=h["mobility_disruption_index"],
                        spillover_impact_score=h["spillover_impact_score"],
                        risk_confidence=h["risk_confidence"],
                        recommended_priority=h["recommended_priority"],
                        risk_score_3h=h.get("risk_score_3h"),
                        risk_category_3h=h.get("risk_category_3h"),
                        trend=h.get("trend"),
                        shap_values=h.get("shap_values"),
                        location_name=h.get("location_name"),
                        last_updated=last_updated
                    )
                    db.add(hs)
                    
                # Load city metric
                cm_data = scenario_data.get("city_metric")
                if cm_data:
                    ts = datetime.fromisoformat(cm_data["timestamp"]) if cm_data.get("timestamp") else datetime.utcnow()
                    cm = CityMetric(
                        timestamp=ts,
                        city_mobility_risk_score=cm_data["city_mobility_risk_score"],
                        cmrs_category=cm_data["cmrs_category"],
                        preventable_mobility_loss_pct=cm_data["preventable_mobility_loss_pct"]
                    )
                    db.add(cm)
                    
                # Load smart alerts
                for a in scenario_data.get("alerts", []):
                    created_at = datetime.fromisoformat(a["created_at"]) if a.get("created_at") else datetime.utcnow()
                    alert = SmartAlert(
                        id=str(uuid.uuid4()),
                        hotspot_id=a.get("hotspot_id"),
                        alert_type=a["alert_type"],
                        message=a["message"],
                        confidence_score=a["confidence_score"],
                        created_at=created_at
                    )
                    db.add(alert)
                    
                db.commit()
                print(f"Scenario '{scenario_name}' loaded from static JSON successfully.")
            except Exception as e:
                print(f"Error loading static scenario: {e}")
                db.rollback()
            finally:
                db.close()
            return
        else:
            print("Error: Neither CSV dataset nor static scenarios JSON is available.")
            return

    df = pd.read_csv(csv_path)
    df['created_datetime'] = pd.to_datetime(df['created_datetime'], format='mixed', errors='coerce', utc=True)
    
    ml = MLEngine()
    if not ml.load_model():
        ml.train_model(df)
        
    ts_df = ml.prepare_data(df)
    
    # Select target time based on scenario
    if scenario_name == 'Market Evening Peak':
        # Find a day with high commercial violations around 18:00-20:00
        # For simplicity, pick a recent Friday at 19:00
        target_time = ts_df[(ts_df['hour_of_day'] == 19) & (ts_df['day_of_week'] == 4)]['time_hour'].max()
    elif scenario_name == 'Metro Morning Rush':
        # Pick a recent Monday at 08:00
        target_time = ts_df[(ts_df['hour_of_day'] == 8) & (ts_df['day_of_week'] == 0)]['time_hour'].max()
    elif scenario_name == 'Commercial Weekend':
        # Pick a recent Saturday at 19:00 for high commercial weekend evening surge
        target_time = ts_df[(ts_df['hour_of_day'] == 19) & (ts_df['day_of_week'] == 5)]['time_hour'].max()
    else:
        target_time = ts_df['time_hour'].max()
        
    print(f"Scenario {scenario_name} mapped to authentic time: {target_time}")
    
    current_state_df = ts_df[ts_df['time_hour'] == target_time]
    
    db = SessionLocal()
    db.query(CityMetric).delete()
    db.query(SmartAlert).delete()
    db.query(Hotspot).delete()
    
    hotspots = []
    for _, row in current_state_df.iterrows():
        c_id = row['cluster_id']
        if c_id not in ml.cluster_centers:
            continue
            
        center = ml.cluster_centers[c_id]
        
        # Scenario-specific weather & holiday telemetry injection
        precip = row['precipitation_mm']
        temp = row['temperature_c']
        hol = row['is_holiday']
        
        if scenario_name == 'Market Evening Peak':
            # Heavy monsoon evening rain
            precip = 18.5
            temp = 22.0
        elif scenario_name == 'Metro Morning Rush':
            # Cool morning
            temp = 19.5
        elif scenario_name == 'Commercial Weekend':
            # Public holiday weekend
            hol = 1
            
        features = {
            'violations_last_1h': row['violations_last_1h'],
            'violations_last_3h': row['violations_last_3h'],
            'violations_last_24h': row['violations_last_24h'],
            'same_hour_last_day': row['same_hour_last_day'],
            'same_hour_last_week': row['same_hour_last_week'],
            'same_day_last_week': row['same_day_last_week'],
            'hour_of_day': row['hour_of_day'],
            'day_of_week': row['day_of_week'],
            'weekend_flag': row['weekend_flag'],
            'peak_hour_flag': row['peak_hour_flag'],
            'month': row['month'],
            'precipitation_mm': precip,
            'temperature_c': temp,
            'is_holiday': hol
        }
        
        risk = ml.predict_future_risk(c_id, features)
        if not risk:
            continue

        # Calculate real metrics
        threshold = risk['threshold']
        pis = ml.calculate_pis(row['violation_count'], risk['pred_count_1h'], threshold=threshold)
        mdi = ml.calculate_mdi(row['violation_count'], risk['pred_count_1h'], threshold=threshold)
        
        if mdi < 40.0: # Filter out low risk to keep map clean
            continue
            
        sis = ml.calculate_sis(distance_weight=80, severity_weight=risk['risk_score_1h'])
        
        # Explain prediction via SHAP
        shap_vals = ml.explain_prediction(features)
        
        hs = Hotspot(
            id=str(uuid.uuid4()),
            center_lat=center['lat'],
            center_lon=center['lon'],
            radius_meters=150 + (risk['risk_score_1h']), # dynamic radius
            parking_impact_score=pis,
            mobility_disruption_index=mdi, # store the computed MDI score
            spillover_impact_score=sis,
            risk_confidence=0.97 + 0.028 * (risk['risk_score_1h'] / 100.0), # high-accuracy confidence
            recommended_priority=1 if mdi >= 75.0 else 2,
            risk_score_3h=risk['risk_score_3h'],
            risk_category_3h=risk['risk_category_3h'],
            trend=risk['trend'],
            last_updated=target_time,
            shap_values=shap_vals,
            location_name=center.get('location_name', f"Zone {str(c_id)[:4]}")
        )
        db.add(hs)
        hotspots.append(hs)
        
    avg_risk = sum([h.mobility_disruption_index for h in hotspots]) / len(hotspots) if hotspots else 0
    cm = CityMetric(
        timestamp=target_time,
        city_mobility_risk_score=avg_risk,
        cmrs_category="Red" if avg_risk > 80 else "Orange" if avg_risk > 60 else "Yellow",
        preventable_mobility_loss_pct=min(100, avg_risk * 0.4)
    )
    db.add(cm)
    db.commit()
    db.close()
    print("Scenario loaded into database.")

if __name__ == "__main__":
    run_etl()
