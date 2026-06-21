import uuid
from datetime import datetime, timedelta
from database import engine, SessionLocal, Base
from models import Hotspot, CityMetric, SmartAlert

def setup_demo_scenarios():
    print("Setting up Demo Scenarios in Database...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Clear existing demo data to avoid duplicates
        db.query(CityMetric).delete()
        db.query(SmartAlert).delete()
        db.query(Hotspot).delete()
        
        # Base scenario timestamps
        now = datetime.utcnow()
        
        # Demo Scenario 1: Market Area Evening Peak
        market_hs = Hotspot(
            id=str(uuid.uuid4()),
            center_lat=12.971598,
            center_lon=77.594562,
            radius_meters=150,
            parking_impact_score=85.0,
            mobility_disruption_index=92.0,
            spillover_impact_score=78.0,
            risk_confidence=0.91,
            recommended_priority=1,
            last_updated=now
        )
        
        # Demo Scenario 2: Metro Station Morning Rush
        metro_hs = Hotspot(
            id=str(uuid.uuid4()),
            center_lat=12.978369,
            center_lon=77.638706,
            radius_meters=100,
            parking_impact_score=76.0,
            mobility_disruption_index=80.0,
            spillover_impact_score=65.0,
            risk_confidence=0.88,
            recommended_priority=2,
            last_updated=now
        )

        # Demo Scenario 3: Commercial Hub Weekend Surge
        comm_hs = Hotspot(
            id=str(uuid.uuid4()),
            center_lat=12.935192,
            center_lon=77.624480,
            radius_meters=200,
            parking_impact_score=94.0,
            mobility_disruption_index=88.0,
            spillover_impact_score=85.0,
            risk_confidence=0.95,
            recommended_priority=1,
            last_updated=now
        )
        
        db.add_all([market_hs, metro_hs, comm_hs])
        
        # Add Global City Metric
        city_cmrs = CityMetric(
            timestamp=now,
            city_mobility_risk_score=82.5,
            cmrs_category="Red",
            preventable_mobility_loss_pct=34.0
        )
        db.add(city_cmrs)
        
        # Add Smart Alerts
        alert1 = SmartAlert(
            id=str(uuid.uuid4()),
            hotspot_id=market_hs.id,
            alert_type="Critical",
            message="Market Area disruption increased by 40% in last hour.",
            confidence_score=0.93,
            created_at=now
        )
        db.add(alert1)
        
        db.commit()
        print("Demo Scenarios successfully pre-configured!")

    except Exception as e:
        print(f"Error setting up demo scenarios: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    setup_demo_scenarios()
