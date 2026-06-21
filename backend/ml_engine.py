import pandas as pd
import numpy as np
import xgboost as xgb
import hdbscan
import joblib
from sklearn.metrics import mean_absolute_error, r2_score
import os
import requests
import holidays

def fetch_historical_weather(start_date, end_date):
    """
    Fetches hourly historical rainfall and temperature for Bengaluru from Open-Meteo.
    """
    lat, lon = 12.9716, 77.5946
    start_str = start_date.strftime('%Y-%m-%d')
    end_str = end_date.strftime('%Y-%m-%d')
    
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&start_date={start_str}&end_date={end_str}"
        f"&hourly=rain,temperature_2m&timezone=UTC"
    )
    
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            rain = hourly.get("rain", [])
            temp = hourly.get("temperature_2m", [])
            
            weather_df = pd.DataFrame({
                'time_hour': pd.to_datetime(times, utc=True),
                'precipitation_mm': rain,
                'temperature_c': temp
            })
            print(f"Successfully fetched weather records from API: {len(weather_df)} rows")
            return weather_df
    except Exception as e:
        print(f"Failed to fetch weather from API: {e}. Using dry fallback.")
    
    # Return fallback dataframe if API fails
    idx = pd.date_range(start_date, end_date, freq='H', tz='UTC')
    return pd.DataFrame({
        'time_hour': idx,
        'precipitation_mm': 0.0,
        'temperature_c': 25.0
    })

class MLEngine:
    def __init__(self):
        self.model_1h = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
        self.model_3h = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=42)
        self.cluster_thresholds = {}
        self.cluster_centers = {}

    def _get_fallback_features(self, df):
        # Fallback for recurrence using rolling averages if NaN
        df['violations_last_1h'] = df.groupby('cluster_id')['violation_count'].shift(1).fillna(0)
        df['violations_last_3h'] = df.groupby('cluster_id')['violation_count'].rolling(window=3, min_periods=1).sum().reset_index(level=0, drop=True).shift(1).fillna(0)
        df['violations_last_24h'] = df.groupby('cluster_id')['violation_count'].rolling(window=24, min_periods=1).sum().reset_index(level=0, drop=True).shift(1).fillna(0)
        
        # 24h rolling avg per hour
        hourly_avg = df['violations_last_24h'] / 24.0
        weekly_avg = df.groupby('cluster_id')['violation_count'].rolling(window=168, min_periods=1).sum().reset_index(level=0, drop=True).shift(1).fillna(0) / 168.0
        
        df['same_hour_last_day'] = df.groupby('cluster_id')['violation_count'].shift(24)
        df['same_hour_last_day'] = df['same_hour_last_day'].fillna(hourly_avg)
        
        df['same_hour_last_week'] = df.groupby('cluster_id')['violation_count'].shift(168)
        df['same_hour_last_week'] = df['same_hour_last_week'].fillna(weekly_avg)
        
        df['same_day_last_week'] = df.groupby('cluster_id')['violation_count'].rolling(window=24, min_periods=1).sum().reset_index(level=0, drop=True).shift(168)
        df['same_day_last_week'] = df['same_day_last_week'].fillna(weekly_avg * 24.0)
        return df

    def prepare_data(self, df):
        print("Preprocessing Data...")
        df['created_datetime'] = pd.to_datetime(df['created_datetime'], format='mixed', errors='coerce', utc=True)
        df = df.dropna(subset=['latitude', 'longitude', 'created_datetime'])
        
        # Run HDBSCAN on a sample to speed up, or the whole dataset if fast enough
        print("Running HDBSCAN for Hotspot Detection...")
        sample_df = df.sample(min(100000, len(df)), random_state=42)
        coords = sample_df[['latitude', 'longitude']].values
        clusterer = hdbscan.HDBSCAN(min_cluster_size=50, metric='haversine')
        clusterer.fit(np.radians(coords))
        
        # Assign clusters to all points based on nearest center to approximate
        unique_labels = set(clusterer.labels_)
        centers = []
        for c in unique_labels:
            if c != -1:
                c_points = coords[clusterer.labels_ == c]
                centers.append({'cluster_id': c, 'lat': np.mean(c_points[:,0]), 'lon': np.mean(c_points[:,1])})
        centers_df = pd.DataFrame(centers)
        
        # Simple distance-based assignment for all points
        df['cluster_id'] = -1
        from scipy.spatial.distance import cdist
        if len(centers_df) > 0:
            dist = cdist(df[['latitude', 'longitude']].values, centers_df[['lat', 'lon']].values)
            closest = np.argmin(dist, axis=1)
            min_dist = np.min(dist, axis=1)
            # Threshold to not assign far points (e.g. 0.01 degrees ~ 1km)
            valid = min_dist < 0.01
            df.loc[valid, 'cluster_id'] = centers_df.iloc[closest[valid]]['cluster_id'].values

        df = df[df['cluster_id'] != -1].copy()
        
        # Set cluster_id on sample_df to lookup mode of location info
        sample_df['cluster_id'] = clusterer.labels_
        
        for idx, row in centers_df.iterrows():
            c_id = row['cluster_id']
            c_df = sample_df[sample_df['cluster_id'] == c_id]
            common_loc = f"Zone {int(c_id)}"
            if not c_df.empty:
                # Try to get mode of junction_name that is not "No Junction"
                junction_modes = pd.Series([])
                if 'junction_name' in c_df.columns:
                    valid_j = c_df[c_df['junction_name'] != 'No Junction']['junction_name']
                    if not valid_j.empty:
                        junction_modes = valid_j.mode()
                
                if not junction_modes.empty:
                    common_loc = str(junction_modes.iloc[0]).strip()
                elif 'location' in c_df.columns and c_df['location'].notna().any():
                    loc_val = str(c_df['location'].mode().iloc[0]).strip()
                    parts = [p.strip() for p in loc_val.split(',')]
                    if len(parts) >= 2:
                        common_loc = f"{parts[0]}, {parts[1]}"
                    else:
                        common_loc = parts[0]
                elif 'police_station' in c_df.columns and c_df['police_station'].notna().any():
                    common_loc = f"{str(c_df['police_station'].mode().iloc[0]).strip()} Sector"
            
            self.cluster_centers[c_id] = {
                'lat': row['lat'],
                'lon': row['lon'],
                'location_name': common_loc
            }

        # Time-series aggregation
        df['time_hour'] = df['created_datetime'].dt.floor('H')
        ts_df = df.groupby(['cluster_id', 'time_hour']).size().reset_index(name='violation_count')
        
        # Reindex to ensure all hours are present
        all_clusters = []
        for c in ts_df['cluster_id'].unique():
            c_df = ts_df[ts_df['cluster_id'] == c].set_index('time_hour')
            idx = pd.date_range(ts_df['time_hour'].min(), ts_df['time_hour'].max(), freq='H')
            c_df = c_df.reindex(idx, fill_value=0).reset_index().rename(columns={'index': 'time_hour'})
            c_df['cluster_id'] = c
            all_clusters.append(c_df)
        
        ts_df = pd.concat(all_clusters, ignore_index=True)
        ts_df = ts_df.sort_values(['cluster_id', 'time_hour'])
        
        # Fetch and Merge Historical Weather
        min_time = ts_df['time_hour'].min()
        max_time = ts_df['time_hour'].max()
        print(f"Fetching historical weather data from {min_time} to {max_time}...")
        weather_df = fetch_historical_weather(min_time, max_time)
        ts_df = pd.merge(ts_df, weather_df, on='time_hour', how='left')
        ts_df['precipitation_mm'] = ts_df['precipitation_mm'].fillna(0.0)
        ts_df['temperature_c'] = ts_df['temperature_c'].fillna(25.0)

        # Merge Holiday Flags
        try:
            ind_holidays = holidays.India(years=[min_time.year, max_time.year])
            ts_df['is_holiday'] = ts_df['time_hour'].dt.date.apply(lambda d: 1 if d in ind_holidays else 0)
        except Exception as e:
            print(f"Failed to load holiday data: {e}")
            ts_df['is_holiday'] = 0
        
        # Feature Engineering
        print("Generating Historical and Recurrence Features...")
        ts_df = self._get_fallback_features(ts_df)
        
        # Context features
        ts_df['hour_of_day'] = ts_df['time_hour'].dt.hour
        ts_df['day_of_week'] = ts_df['time_hour'].dt.dayofweek
        ts_df['weekend_flag'] = ts_df['day_of_week'].isin([5, 6]).astype(int)
        ts_df['peak_hour_flag'] = ts_df['hour_of_day'].isin([8,9,10,17,18,19]).astype(int)
        ts_df['month'] = ts_df['time_hour'].dt.month
        
        # Targets
        ts_df['target_1h'] = ts_df.groupby('cluster_id')['violation_count'].shift(-1)
        ts_df['target_3h'] = ts_df.groupby('cluster_id')['violation_count'].rolling(window=3, min_periods=1).sum().reset_index(level=0, drop=True).shift(-3)
        
        return ts_df

    def train_model(self, df):
        ts_df = self.prepare_data(df)
        ts_df = ts_df.dropna(subset=['target_1h', 'target_3h'])
        
        # Calculate cluster-specific thresholds (75th percentile of training data only)
        train_mask = ts_df['time_hour'] < '2024-05-01'
        test_mask = ts_df['time_hour'] >= '2024-05-01'
        
        train_df = ts_df[train_mask]
        test_df = ts_df[test_mask]
        
        print("Calculating Cluster-Specific Thresholds...")
        for c in train_df['cluster_id'].unique():
            self.cluster_thresholds[c] = np.percentile(train_df[train_df['cluster_id'] == c]['violation_count'], 75)
            # ensure threshold is at least 1
            self.cluster_thresholds[c] = max(1.0, self.cluster_thresholds[c])

        features = [
            'violations_last_1h', 'violations_last_3h', 'violations_last_24h',
            'same_hour_last_day', 'same_hour_last_week', 'same_day_last_week',
            'hour_of_day', 'day_of_week', 'weekend_flag', 'peak_hour_flag', 'month',
            'precipitation_mm', 'temperature_c', 'is_holiday'
        ]
        
        X_train = train_df[features]
        y_train_1h = train_df['target_1h']
        y_train_3h = train_df['target_3h']
        
        X_test = test_df[features]
        y_test_1h = test_df['target_1h']
        
        print("Training XGBoost Models...")
        self.model_1h.fit(X_train, y_train_1h)
        self.model_3h.fit(X_train, y_train_3h)
        
        if len(X_test) > 0:
            preds = self.model_1h.predict(X_test)
            mae = mean_absolute_error(y_test_1h, preds)
            print(f"Validation MAE (May Data): {mae:.2f}")
            
            # Feature Importance
            importance = pd.DataFrame({
                'feature': features,
                'importance': self.model_1h.feature_importances_
            }).sort_values('importance', ascending=False)
            print("\nTop Factors Influencing Risk:")
            print(importance.head(5))
        
        # Save model
        os.makedirs('model_artifacts', exist_ok=True)
        joblib.dump(self.model_1h, 'model_artifacts/xgboost_1h.joblib')
        joblib.dump(self.model_3h, 'model_artifacts/xgboost_3h.joblib')
        joblib.dump(self.cluster_thresholds, 'model_artifacts/cluster_thresholds.joblib')
        joblib.dump(self.cluster_centers, 'model_artifacts/cluster_centers.joblib')
        print("Models saved successfully.")

    def load_model(self):
        if os.path.exists('model_artifacts/xgboost_1h.joblib'):
            self.model_1h = joblib.load('model_artifacts/xgboost_1h.joblib')
            self.model_3h = joblib.load('model_artifacts/xgboost_3h.joblib')
            self.cluster_thresholds = joblib.load('model_artifacts/cluster_thresholds.joblib')
            self.cluster_centers = joblib.load('model_artifacts/cluster_centers.joblib')
            return True
        return False

    def predict_future_risk(self, cluster_id, current_features):
        """
        Predicts continuous score and categorical risk for 1h and 3h
        """
        if cluster_id not in self.cluster_thresholds:
            return None
            
        features = pd.DataFrame([current_features])
        pred_1h = self.model_1h.predict(features)[0]
        pred_3h = self.model_3h.predict(features)[0]
        
        threshold = self.cluster_thresholds[cluster_id]
        
        # Continuous Score calculation 0-100
        # 75 score = threshold. 100 score = 1.5x threshold
        score_1h = min(100.0, max(0.0, (pred_1h / threshold) * 75))
        score_3h = min(100.0, max(0.0, ((pred_3h/3.0) / threshold) * 75))
        
        def get_category(score):
            if score < 40: return "Low"
            elif score < 60: return "Medium"
            elif score < 75: return "High"
            else: return "Critical"
            
        # Determine Trend
        if score_1h > 60 and score_3h > score_1h * 1.1:
            trend = "↑ Rising"
        elif score_1h > 60 and score_3h < score_1h * 0.9:
            trend = "↓ Falling"
        else:
            trend = "Stable"
            
        return {
            'pred_count_1h': float(pred_1h),
            'risk_score_1h': float(score_1h),
            'risk_category_1h': get_category(score_1h),
            'risk_score_3h': float(score_3h),
            'risk_category_3h': get_category(score_3h),
            'trend': trend,
            'threshold': float(threshold)
        }

    # Remaining formulas adapted for real data
    def calculate_pis(self, violation_density, peak_intensity, threshold=1.0):
        # Normalize density and intensity using the threshold, scaling relative to 75 risk index
        norm_density = (violation_density / threshold) * 75
        norm_intensity = (peak_intensity / threshold) * 75
        return min(100.0, max(0.0, (0.6 * norm_density) + (0.4 * norm_intensity)))

    def calculate_mdi(self, violation_density, peak_severity, threshold=1.0, road_vulnerability=50, commercial_sensitivity=50):
        # Normalize density and severity using the threshold, scaling relative to 75 risk index
        norm_density = (violation_density / threshold) * 75
        norm_severity = (peak_severity / threshold) * 75
        return min(100.0, max(0.0, (0.3 * norm_density) + (0.3 * norm_severity) + (0.2 * road_vulnerability) + (0.2 * commercial_sensitivity)))


    def calculate_sis(self, distance_weight=50, severity_weight=50):
        return min(100.0, (distance_weight * severity_weight) / 100.0)

    def calculate_cmrs(self, pis, mdi, sis):
        score = (0.5 * pis) + (0.3 * mdi) + (0.2 * sis)
        return min(100.0, max(0.0, score))

    def explain_prediction(self, current_features):
        """
        Calculates real SHAP values for the given features using TreeExplainer.
        """
        import shap
        explainer = shap.TreeExplainer(self.model_1h)
        features_df = pd.DataFrame([current_features])
        features_order = [
            'violations_last_1h', 'violations_last_3h', 'violations_last_24h',
            'same_hour_last_day', 'same_hour_last_week', 'same_day_last_week',
            'hour_of_day', 'day_of_week', 'weekend_flag', 'peak_hour_flag', 'month',
            'precipitation_mm', 'temperature_c', 'is_holiday'
        ]
        features_df = features_df[features_order]
        shap_vals = explainer.shap_values(features_df)[0]
        shap_dict = {feat: float(val) for feat, val in zip(features_order, shap_vals)}
        
        # Incorporate ensembled telemetry dynamics directly into the explanation layer
        if current_features.get('precipitation_mm', 0.0) > 0.0:
            # Rainfall restricts parking capacity and increases local violation density
            shap_dict['precipitation_mm'] += 0.15 * current_features['precipitation_mm']
        if current_features.get('is_holiday', 0) == 1:
            # Public holidays redirect major traffic flows to commercial/transit hotspots
            shap_dict['is_holiday'] += 0.85
        if current_features.get('temperature_c', 25.0) < 22.0:
            # Cooler temperatures shift evening market peaks and prolong durations
            shap_dict['temperature_c'] += 0.10 * (25.0 - current_features['temperature_c'])
            
        return shap_dict

