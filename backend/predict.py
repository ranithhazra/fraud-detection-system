import os
import math
import datetime
import numpy as np
import pandas as pd
import joblib

# Determine absolute model paths dynamically
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(CURRENT_DIR, '..', 'models', 'fraud_model.pkl')
SCALER_PATH = os.path.join(CURRENT_DIR, '..', 'models', 'scaler.pkl')
ENCODERS_PATH = os.path.join(CURRENT_DIR, '..', 'models', 'label_encoders.pkl')

# Global variables to cache models in memory
_MODEL = None
_SCALER = None
_ENCODERS = None

def load_resources():
    """Load the model, scaler, and label encoders once into memory."""
    global _MODEL, _SCALER, _ENCODERS
    
    if _MODEL is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Model file not found at: {MODEL_PATH}")
        _MODEL = joblib.load(MODEL_PATH)
        print("XGBoost model loaded successfully.")

    if _SCALER is None:
        if not os.path.exists(SCALER_PATH):
            raise FileNotFoundError(f"Scaler file not found at: {SCALER_PATH}")
        _SCALER = joblib.load(SCALER_PATH)
        print("StandardScaler loaded successfully.")

    if _ENCODERS is None:
        if not os.path.exists(ENCODERS_PATH):
            raise FileNotFoundError(f"Label encoders file not found at: {ENCODERS_PATH}")
        _ENCODERS = joblib.load(ENCODERS_PATH)
        print("Label encoders loaded successfully.")
        
    return _MODEL, _SCALER, _ENCODERS

def preprocess_and_predict(tx_raw):
    """
    Takes raw transaction data, preprocesses it, engineers features, 
    and returns predictions.
    tx_raw: Dictionary of transaction details.
    """
    # 1. Ensure resources are loaded
    model, scaler, encoders = load_resources()
    
    # Create a local copy to avoid mutating input dict
    tx = tx_raw.copy()
    
    # 2. Handle aliases & standardize inputs
    # amount alias
    amt = float(tx.get('amt') or tx.get('amount') or 0.0)
    tx['amt'] = amt
    
    # timestamp alias
    timestamp_str = tx.get('trans_date_trans_time') or tx.get('timestamp')
    if not timestamp_str:
        timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        timestamp = pd.to_datetime(timestamp_str)
    except Exception:
        timestamp = pd.to_datetime('now')
    
    # dob alias
    dob_str = tx.get('dob')
    if not dob_str:
        # Default to 30 years ago if dob is missing
        dob_str = (datetime.datetime.now() - datetime.timedelta(days=30*365)).strftime("%Y-%m-%d")
        
    try:
        dob = pd.to_datetime(dob_str)
    except Exception:
        dob = pd.to_datetime('now') - pd.offsets.DateOffset(years=30)

    # 3. Engineer datetime features
    tx['hour'] = int(timestamp.hour)
    tx['day'] = int(timestamp.dayofweek)
    tx['month'] = int(timestamp.month)
    tx['day_of_year'] = int(timestamp.dayofyear)
    
    # 4. Engineer cardholder age
    # age relative to 'today' (consistent with notebook preprocessing)
    today = pd.to_datetime('today')
    tx['age'] = int((today - dob).days // 365)
    
    # 5. Engineer distance between cardholder and merchant
    lat = float(tx.get('lat') or 0.0)
    lon = float(tx.get('long') or tx.get('lon') or 0.0)
    merch_lat = float(tx.get('merch_lat') or 0.0)
    merch_long = float(tx.get('merch_long') or tx.get('merch_lon') or 0.0)
    
    distance = math.sqrt((lat - merch_lat)**2 + (lon - merch_long)**2)
    tx['distance'] = distance
    tx['lat'] = lat
    tx['long'] = lon
    tx['merch_lat'] = merch_lat
    tx['merch_long'] = merch_long
    
    # 6. Scale amount
    # StandardScaler was fit on X_train[['amt']], so it expects shape (N, 1)
    scaled_amt = float(scaler.transform([[amt]])[0][0])
    
    # 7. Encode categoricals with unseen fallback handling
    encoded_features = {}
    cat_cols = ['merchant', 'category', 'gender', 'city', 'state', 'job']
    for col in cat_cols:
        val = str(tx.get(col, 'Unknown'))
        encoder = encoders[col]
        # Robust check if category is in trained classes; if not, fallback to the first known class
        if val not in encoder.classes_:
            val = encoder.classes_[0]
        encoded_features[col] = int(encoder.transform([val])[0])


    # 8. Align the 19 features in the exact training sequence
    # Expected columns: ['merchant', 'category', 'amt', 'gender', 'city', 'state', 'zip', 'lat', 'long',
    #                    'city_pop', 'job', 'merch_lat', 'merch_long', 'hour', 'day', 'month', 'day_of_year',
    #                    'age', 'distance']
    
    feature_dict = {
        'merchant': encoded_features['merchant'],
        'category': encoded_features['category'],
        'amt': scaled_amt,
        'gender': encoded_features['gender'],
        'city': encoded_features['city'],
        'state': encoded_features['state'],
        'zip': int(tx.get('zip') or 0),
        'lat': lat,
        'long': lon,
        'city_pop': int(tx.get('city_pop') or 0),
        'job': encoded_features['job'],
        'merch_lat': merch_lat,
        'merch_long': merch_long,
        'hour': tx['hour'],
        'day': tx['day'],
        'month': tx['month'],
        'day_of_year': tx['day_of_year'],
        'age': tx['age'],
        'distance': distance
    }
    
    # Convert to DataFrame
    df = pd.DataFrame([feature_dict])
    
    # 9. Perform prediction
    pred = int(model.predict(df)[0])
    prob = float(model.predict_proba(df)[0][1])
    
    status = 'Fraud' if pred == 1 else 'Genuine'
    
    # Return both predictions and engineered inputs for saving to sqlite
    result = tx.copy()
    result.update({
        'prediction': pred,
        'probability': prob,
        'status': status,
        'age': tx['age'],
        'distance': distance
    })
    
    return result

# Pre-load resources on import to warm up server
try:
    load_resources()
except Exception as e:
    print(f"Warning: Resources could not be loaded at module import: {e}")
