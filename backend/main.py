from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from sqlalchemy.orm import Session
from database import get_db, SessionLocal, engine, Base
from models import Hotspot, CityMetric, SmartAlert
from war_room import optimize_resources
from copilot import generate_copilot_insight

# Create database tables if they do not exist
Base.metadata.create_all(bind=engine)

# Auto-seed database with default scenario if empty
def auto_seed_db():
    db = SessionLocal()
    try:
        if db.query(Hotspot).count() == 0:
            print("Database is empty. Auto-seeding default scenario 'Market Evening Peak'...")
            from etl import load_real_scenario
            load_real_scenario("Market Evening Peak")
    except Exception as e:
        print(f"Error during auto-seeding: {e}")
    finally:
        db.close()

auto_seed_db()

app = FastAPI(title="ParkSight-AI Traffic Command Center API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class WarRoomRequest(BaseModel):
    available_officers: int
    available_tow_trucks: int

class DemoScenarioRequest(BaseModel):
    scenario_name: str

@app.get("/")
def root():
    return {"status": "ok", "message": "ParkSight-AI Backend is running."}

@app.get("/api/v1/dashboard/state")
def get_dashboard_state(db: Session = Depends(get_db)):
    hotspots = db.query(Hotspot).all()
    city_metric = db.query(CityMetric).order_by(CityMetric.timestamp.desc()).first()
    alerts = db.query(SmartAlert).order_by(SmartAlert.created_at.desc()).limit(10).all()

    # Build Hotspots GeoJSON
    features = []
    for hs in hotspots:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [hs.center_lon, hs.center_lat]
            },
            "properties": {
                "id": hs.id,
                "cmrs": hs.mobility_disruption_index, # real computed MDI
                "pis": hs.parking_impact_score,
                "mdi": hs.mobility_disruption_index,
                "sis": hs.spillover_impact_score,
                "radius": hs.radius_meters,
                "risk_category": hs.get_risk_category(),
                "confidence": int(hs.risk_confidence * 100) if hs.risk_confidence is not None else 98
            }
        })
    hotspots_geojson = {"type": "FeatureCollection", "features": features}

    # Build Spillover Network GeoJSON
    spillover_features = []
    if len(hotspots) > 1:
        sorted_hs = sorted(hotspots, key=lambda x: x.mobility_disruption_index, reverse=True)
        for i in range(len(sorted_hs) - 1):
            source = sorted_hs[i]
            target = sorted_hs[i+1]
            spillover_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[source.center_lon, source.center_lat], [target.center_lon, target.center_lat]]
                },
                "properties": {
                    "source_id": source.id,
                    "target_id": target.id,
                    "risk_transfer": source.spillover_impact_score
                }
            })
    spillover_geojson = {"type": "FeatureCollection", "features": spillover_features}

    # Return consolidated state
    return {
        "hotspots": hotspots_geojson,
        "spillover": spillover_geojson,
        "alerts": [
            {
                "id": a.id,
                "alert_type": a.alert_type,
                "message": a.message,
                "confidence_score": int(a.confidence_score * 100) if a.confidence_score else 0
            } for a in alerts
        ],
        "cmrs": {
            "city_mobility_risk_score": round(city_metric.city_mobility_risk_score, 2) if city_metric and city_metric.city_mobility_risk_score is not None else 80.0,
            "cmrs_category": city_metric.cmrs_category if city_metric else "High",
            "preventable_mobility_loss_pct": round(city_metric.preventable_mobility_loss_pct, 2) if city_metric and city_metric.preventable_mobility_loss_pct is not None else 30.0,
            "critical_hotspots": len([h for h in hotspots if h.get_risk_category() == "Critical"])
        }
    }

def get_dynamic_action_plan(hs):
    mdi = hs.mobility_disruption_index or 50.0
    risk_cat = hs.get_risk_category()
    shap_vals = hs.shap_values or {}
    
    # Sort shap values to find top driver
    top_driver = None
    if shap_vals:
        sorted_shap = sorted(shap_vals.items(), key=lambda x: abs(x[1]), reverse=True)
        if sorted_shap:
            top_driver = sorted_shap[0][0]
            
    # Base action plan depending on risk category/MDI
    if risk_cat == "Critical":
        action = "Deploy 3 Traffic Officers and 2 Tow Trucks for active towing."
        improvement_val = int(mdi * 0.45)
    elif risk_cat == "High":
        action = "Deploy 2 Traffic Officers and 1 Tow Truck for active parking clearance."
        improvement_val = int(mdi * 0.40)
    elif risk_cat == "Medium":
        action = "Deploy 1 Traffic Officer to clear double-parking and monitor spillover."
        improvement_val = int(mdi * 0.35)
    else:
        action = "Schedule routine patrol check every 2 hours."
        improvement_val = int(mdi * 0.30)
        
    # Inject driver-specific actions
    if top_driver == 'precipitation_mm':
        action += " Coordinate drainage clearing and implement speed warnings."
    elif top_driver == 'weekend_flag' or top_driver == 'is_holiday':
        action += " Coordinate with nearby commercial spaces to open extra parking garages."
    elif top_driver in ['violations_last_1h', 'violations_last_3h']:
        action += " Initiate strict enforcement on double-parking hotspot links."
        
    # Ensure improvement value is reasonable
    improvement_val = max(10, min(95, improvement_val))
    improvement = f"{improvement_val}% MDI reduction"
    
    return action, improvement

@app.get("/api/v1/hotspots/{hotspot_id}/intelligence")
def get_hotspot_intelligence(hotspot_id: str, db: Session = Depends(get_db)):
    hs = db.query(Hotspot).filter(Hotspot.id == hotspot_id).first()
    if not hs:
        return {"error": "Hotspot not found"}
    
    # Generate Dynamic Action Plan
    action, improvement = get_dynamic_action_plan(hs)
    
    hotspot_dict = {
        "id": hs.id,
        "location_name": hs.location_name if (hasattr(hs, "location_name") and hs.location_name) else f"Zone {str(hs.id)[:4]}",
        "risk_category": hs.get_risk_category(),
        "risk_confidence": hs.risk_confidence,
        "recommended_action": action,
        "expected_improvement": improvement,
        "shap_values": hs.shap_values
    }
    copilot_insight = generate_copilot_insight(hotspot_dict)
    
    return {
        "id": hs.id,
        "location_name": hotspot_dict["location_name"],
        "cmrs": hs.mobility_disruption_index,
        "pis": hs.parking_impact_score,
        "mdi": hs.mobility_disruption_index,
        "sis": hs.spillover_impact_score,
        "confidence": int(hs.risk_confidence * 100) if hs.risk_confidence is not None else 98,
        "recommended_action": hotspot_dict["recommended_action"],
        "expected_improvement": hotspot_dict["expected_improvement"],
        "copilot": copilot_insight,
        "trend": hs.trend,
        "risk_score_3h": hs.risk_score_3h,
        "risk_category_3h": hs.risk_category_3h,
        "risk_category_1h": hs.get_risk_category(),
        "shap_values": hs.shap_values
    }

@app.post("/api/v1/enforcement/war-room")
def post_war_room(request: WarRoomRequest, db: Session = Depends(get_db)):
    hotspots_db = db.query(Hotspot).all()
    hotspots = []
    for hs in hotspots_db:
        hotspots.append({
            "id": hs.id, 
            "location_name": hs.location_name if (hasattr(hs, "location_name") and hs.location_name) else f"Zone {str(hs.id)[:4]}", 
            "cmrs": hs.mobility_disruption_index, 
            "risk_category": hs.get_risk_category(),
            "lat": hs.center_lat,
            "lon": hs.center_lon,
            "radius": hs.radius_meters,
            "shap_values": hs.shap_values
        })
    return optimize_resources(hotspots, request.available_officers, request.available_tow_trucks)

from etl import load_real_scenario

@app.post("/api/v1/demo/load-scenario")
def load_scenario(request: DemoScenarioRequest):
    # Load authentic scenario from dataset
    load_real_scenario(request.scenario_name)
    return {"status": "success", "message": f"Scenario '{request.scenario_name}' loaded successfully."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
