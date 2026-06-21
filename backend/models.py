from sqlalchemy import Column, String, Float, Boolean, DateTime, Integer, JSON
from database import Base
import uuid
from datetime import datetime

class Hotspot(Base):
    __tablename__ = 'hotspots'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    center_lat = Column(Float)
    center_lon = Column(Float)
    radius_meters = Column(Float)
    parking_impact_score = Column(Float) # 0-100
    mobility_disruption_index = Column(Float) # 0-100 (This is 1h score)
    spillover_impact_score = Column(Float) # 0-100
    risk_confidence = Column(Float)
    recommended_priority = Column(Integer)
    
    # New Multi-Horizon / Trend fields
    risk_score_3h = Column(Float)
    risk_category_3h = Column(String)
    trend = Column(String)
    shap_values = Column(JSON)
    location_name = Column(String, nullable=True)
    
    last_updated = Column(DateTime, default=datetime.utcnow)

    def get_risk_category(self):
        score = self.mobility_disruption_index if self.mobility_disruption_index is not None else 0.0
        if score < 40.0:
            return "Low"
        elif score < 60.0:
            return "Medium"
        elif score < 75.0:
            return "High"
        else:
            return "Critical"


class CityMetric(Base):
    __tablename__ = 'city_metrics'
    timestamp = Column(DateTime, primary_key=True, default=datetime.utcnow)
    city_mobility_risk_score = Column(Float)
    cmrs_category = Column(String)
    preventable_mobility_loss_pct = Column(Float)

class SmartAlert(Base):
    __tablename__ = 'smart_alerts'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    hotspot_id = Column(String)
    alert_type = Column(String)
    message = Column(String)
    confidence_score = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
