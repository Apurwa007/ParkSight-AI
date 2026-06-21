def optimize_resources(hotspots, available_officers, available_tow_trucks):
    """
    Phase 4: Resource War Room Optimization
    A greedy knapsack approach to allocate resources to maximize CMRS reduction.
    """
    # Sort hotspots by CMRS (or MDI) descending to prioritize highest risk
    sorted_hotspots = sorted(hotspots, key=lambda x: x['cmrs'], reverse=True)
    
    allocations = []
    total_reduction = 0.0
    
    for hp in sorted_hotspots:
        action = "No Action"
        officers_allocated = 0
        trucks_allocated = 0
        roi = "Low"
        reduction = 0.0
        
        # Simple heuristic: Critical needs tow truck + officers, High needs officers
        if hp['risk_category'] == 'Critical' and available_tow_trucks > 0 and available_officers >= 2:
            action = "Deploy 2 Traffic Officers and 1 Tow Truck for active towing and parking clearance."
            officers_allocated = 2
            trucks_allocated = 1
            available_officers -= 2
            available_tow_trucks -= 1
            roi = "High"
            reduction = hp['cmrs'] * 0.40 # 40% local reduction
        elif hp['risk_category'] in ['Critical', 'High'] and available_officers >= 2:
            action = "Deploy 2 Traffic Officers to monitor the congestion and guide traffic flows."
            officers_allocated = 2
            available_officers -= 2
            roi = "Medium"
            reduction = hp['cmrs'] * 0.25 # 25% local reduction
        elif available_officers >= 1:
            action = "Deploy 1 Traffic Officer to clear double-parking and keep traffic moving."
            officers_allocated = 1
            available_officers -= 1
            roi = "Low"
            reduction = hp['cmrs'] * 0.10
            
        if officers_allocated > 0 or trucks_allocated > 0:
            # Sort shap values to find top driver if present
            shap_vals = hp.get("shap_values") or {}
            top_driver = None
            if shap_vals:
                sorted_shap = sorted(shap_vals.items(), key=lambda x: abs(x[1]), reverse=True)
                if sorted_shap:
                    top_driver = sorted_shap[0][0]
            
            # Append dynamic advice
            if top_driver == 'precipitation_mm':
                action += " Set speed warning signs and coordinate with municipal crews for drainage clearing."
            elif top_driver in ['weekend_flag', 'is_holiday']:
                action += " Coordinate with nearby commercial garages to open extra parking capacities."
            elif top_driver in ['violations_last_1h', 'violations_last_3h']:
                action += " Focus strict enforcement on double-parking hotspot links."
                
            total_reduction += reduction
            allocations.append({
                "hotspot_id": hp["id"],
                "location": hp.get("location_name", "Unknown Zone"),
                "lat": hp.get("lat"),
                "lon": hp.get("lon"),
                "radius": hp.get("radius"),
                "recommended_action": action,
                "allocated_resources": {"officers": officers_allocated, "tow_trucks": trucks_allocated},
                "expected_local_reduction": round(reduction, 2),
                "intervention_roi": roi,
                "recommendation_confidence": 0.85 + (0.1 if roi == "High" else 0.0) # Mock confidence
            })
            
    # Calculate global Preventable Mobility Loss (%)
    # Assuming average CMRS drops
    global_cmrs = sum(h['cmrs'] for h in hotspots) / len(hotspots) if hotspots else 0
    preventable_loss = (total_reduction / (global_cmrs * len(hotspots))) * 100 if global_cmrs > 0 else 0
    
    return {
        "allocations": allocations,
        "preventable_mobility_loss_pct": round(preventable_loss, 2),
        "officers_remaining": available_officers,
        "tow_trucks_remaining": available_tow_trucks
    }
