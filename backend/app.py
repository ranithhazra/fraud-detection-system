import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import datetime
import traceback

import database
import predict

# Define static folders relative to this script
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..', 'frontend'))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)  # Enable Cross-Origin Resource Sharing for all routes

# Initialize database and seed sample data on app startup
try:
    database.init_db()
    database.seed_sample_data()
except Exception as e:
    print(f"Warning: Failed to initialize or seed database: {e}")

# ==========================================
# FRONTEND STATIC ROUTES
# ==========================================

@app.route('/')
def home():
    """Serves the main dashboard page."""
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/dashboard')
def dashboard():
    """Serves the main dashboard page (alias)."""
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/analytics')
def analytics_page():
    """Serves the analytics page."""
    return send_from_directory(FRONTEND_DIR, 'analytics.html')

@app.route('/alerts')
def alerts_page():
    """Serves the alerts page."""
    return send_from_directory(FRONTEND_DIR, 'alerts.html')

# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "model_loaded": predict._MODEL is not None,
        "scaler_loaded": predict._SCALER is not None,
        "encoders_loaded": predict._ENCODERS is not None
    }), 200

@app.route('/predict', methods=['POST'])
def run_predict():
    """
    Accepts transaction JSON, validates fields, runs prediction,
    stores result in database, and returns prediction statistics.
    """
    data = request.get_json()
    if not data:
        return jsonify({
            "status": "error",
            "message": "Invalid Request: No JSON body provided"
        }), 400

    # 1. Input Validation
    required_fields = ['merchant', 'category', 'amt', 'gender', 'city', 'state', 
                       'zip', 'lat', 'long', 'city_pop', 'job', 'dob', 'merch_lat', 'merch_long']
    
    missing_fields = [f for f in required_fields if f not in data]
    if missing_fields:
        return jsonify({
            "status": "error",
            "message": f"Validation Error: Missing required fields: {', '.join(missing_fields)}"
        }), 400

    # 2. Check input types/values are parseable
    try:
        float(data['amt'])
        float(data['lat'])
        float(data['long'])
        float(data['merch_lat'])
        float(data['merch_long'])
        int(data['city_pop'])
        int(data['zip'])
    except ValueError as val_err:
        return jsonify({
            "status": "error",
            "message": f"Validation Error: Numeric fields failed validation: {str(val_err)}"
        }), 400

    # 3. Preprocess & Predict
    try:
        # Preprocess and execute model inference
        result = predict.preprocess_and_predict(data)
        
        # Save to database
        db_info = database.save_prediction(result)
        
        # Standardized API response
        return jsonify({
            "status": "success",
            "data": {
                "transaction_id": db_info["transaction_id"],
                "timestamp": db_info["timestamp"],
                "amount": float(result["amt"]),
                "prediction": int(result["prediction"]),
                "probability": float(result["probability"]),
                "status": result["status"],
                "risk_level": db_info["risk_level"],
                "engineered_features": {
                    "age": int(result["age"]),
                    "distance": float(result["distance"]),
                    "hour": int(result["hour"]),
                    "day_of_week": int(result["day"]),
                    "month": int(result["month"])
                }
            }
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": f"Prediction Failure: {str(e)}"
        }), 500

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    """Fetches KPI stats and aggregated charts data from SQLite."""
    try:
        analytics_data = database.get_analytics_summary()
        return jsonify({
            "status": "success",
            "data": analytics_data
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": f"Database Retrieval Failure: {str(e)}"
        }), 500

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """Fetches high-risk alerts flagged by the model."""
    try:
        limit = request.args.get('limit', default=50, type=int)
        alerts_data = database.get_alerts(limit=limit)
        return jsonify({
            "status": "success",
            "count": len(alerts_data),
            "data": alerts_data
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": f"Database Retrieval Failure: {str(e)}"
        }), 500

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Fetches recent transaction predictions."""
    try:
        limit = request.args.get('limit', default=10, type=int)
        tx_data = database.get_recent_transactions(limit=limit)
        return jsonify({
            "status": "success",
            "count": len(tx_data),
            "data": tx_data
        }), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": f"Database Retrieval Failure: {str(e)}"
        }), 500

# Error Handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({
        "status": "error",
        "message": "Resource not found"
    }), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({
        "status": "error",
        "message": "Internal server error"
    }), 500

if __name__ == '__main__':
    # Run server locally on default Flask port (5000)
    app.run(host='127.0.0.1', port=5000, debug=True)
