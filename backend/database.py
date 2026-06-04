import os
import sqlite3
import datetime

# Determine path to sqlite file dynamically (supports running app.py from any directory)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..', 'database'))
DB_PATH = os.path.join(DB_DIR, 'fraud_db.sqlite')

def get_db_connection():
    """Establish database connection with row factory enabled."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Create database tables if they do not exist yet."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Predictions Table Schema
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE NOT NULL,
        timestamp TEXT NOT NULL,
        merchant TEXT,
        category TEXT,
        amount REAL,
        gender TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        lat REAL,
        long REAL,
        city_pop INTEGER,
        job TEXT,
        merch_lat REAL,
        merch_long REAL,
        age INTEGER,
        distance REAL,
        hour INTEGER,
        day INTEGER,
        month INTEGER,
        prediction INTEGER NOT NULL, -- 0 for Genuine, 1 for Fraud
        probability REAL NOT NULL,  -- Model output probability
        status TEXT NOT NULL,       -- 'Genuine' or 'Fraud'
        risk_level TEXT NOT NULL    -- 'Low', 'Medium', 'High'
    )
    """)
    
    # Create index on transaction_id & prediction for speed
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_tx_id ON predictions (transaction_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_predictions_prediction ON predictions (prediction)")
    
    conn.commit()
    conn.close()
    print(f"Database initialized successfully at: {DB_PATH}")

def save_prediction(tx):
    """
    Saves a transaction and its model prediction into the SQLite database.
    tx: Dict containing transaction features and prediction results.
    """
    # Auto-generate transaction ID if missing
    tx_id = tx.get('transaction_id')
    if not tx_id:
        import uuid
        tx_id = f"TXN-{uuid.uuid4().hex[:8].upper()}"
        
    # Auto-generate timestamp if missing
    timestamp = tx.get('trans_date_trans_time') or tx.get('timestamp')
    if not timestamp:
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Dynamic hour, day, month extraction from timestamp for fallback (e.g. seeded data)
    try:
        dt = datetime.datetime.strptime(timestamp, "%Y-%m-%d %H:%M:%S")
    except Exception:
        try:
            dt = datetime.datetime.fromisoformat(timestamp)
        except Exception:
            dt = datetime.datetime.now()
            
    hour = tx.get('hour')
    if hour is None:
        hour = dt.hour
    day = tx.get('day')
    if day is None:
        day = dt.weekday()
    month = tx.get('month')
    if month is None:
        month = dt.month

    # Risk level determination based on probability
    prob = float(tx.get('probability', 0.0))
    if prob >= 0.70:
        risk_level = "High"
    elif prob >= 0.20:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
        INSERT OR REPLACE INTO predictions (
            transaction_id, timestamp, merchant, category, amount, gender,
            city, state, zip, lat, long, city_pop, job, merch_lat, merch_long,
            age, distance, hour, day, month, prediction, probability, status, risk_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tx_id,
            timestamp,
            tx.get('merchant'),
            tx.get('category'),
            float(tx.get('amt') or tx.get('amount') or 0.0),
            tx.get('gender'),
            tx.get('city'),
            tx.get('state'),
            str(tx.get('zip', '')),
            float(tx.get('lat') or 0.0),
            float(tx.get('long') or 0.0),
            int(tx.get('city_pop') or 0),
            tx.get('job'),
            float(tx.get('merch_lat') or 0.0),
            float(tx.get('merch_long') or 0.0),
            int(tx.get('age') or 0),
            float(tx.get('distance') or 0.0),
            int(hour),
            int(day),
            int(month),
            int(tx.get('prediction', 0)),
            prob,
            tx.get('status', 'Genuine'),
            risk_level
        ))
        conn.commit()
        # Return saved transaction ID and risk level
        return {
            "transaction_id": tx_id,
            "timestamp": timestamp,
            "risk_level": risk_level
        }
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_recent_transactions(limit=10):
    """Retrieve the most recent transaction predictions."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT transaction_id, timestamp, merchant, category, amount, status, probability, risk_level
        FROM predictions 
        ORDER BY timestamp DESC, id DESC 
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_alerts(limit=50):
    """Retrieve all flagged fraudulent transactions (prediction = 1)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT transaction_id, timestamp, merchant, category, amount, probability, risk_level,
               gender, city, state, age, job, distance
        FROM predictions 
        WHERE prediction = 1
        ORDER BY timestamp DESC, id DESC 
        LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_analytics_summary():
    """
    Computes analytical aggregations for total dashboard charts.
    Returns: KPI card metrics, category breakdowns, hourly patterns, and gender distributions.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. KPI Aggregations
    cursor.execute("""
        SELECT 
            COUNT(*) as total_count,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as fraud_count,
            SUM(CASE WHEN prediction = 0 THEN 1 ELSE 0 END) as genuine_count,
            AVG(amount) as avg_amount
        FROM predictions
    """)
    kpis = dict(cursor.fetchone())
    
    total = kpis['total_count'] or 0
    fraud = kpis['fraud_count'] or 0
    genuine = kpis['genuine_count'] or 0
    fraud_pct = (fraud / total * 100) if total > 0 else 0.0
    avg_amt = kpis['avg_amount'] or 0.0
    
    summary = {
        "kpi": {
            "total_transactions": total,
            "fraud_transactions": fraud,
            "genuine_transactions": genuine,
            "fraud_percentage": round(fraud_pct, 2),
            "average_amount": round(avg_amt, 2)
        },
        "category_breakdown": [],
        "hourly_trends": [],
        "gender_distribution": []
    }
    
    if total == 0:
        conn.close()
        return summary

    # 2. Category Breakdown
    cursor.execute("""
        SELECT 
            category,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as fraud,
            SUM(CASE WHEN prediction = 0 THEN 1 ELSE 0 END) as genuine
        FROM predictions
        GROUP BY category
        ORDER BY total DESC
    """)
    summary["category_breakdown"] = [dict(r) for r in cursor.fetchall()]

    # 3. Hourly Trends
    cursor.execute("""
        SELECT 
            hour,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as fraud
        FROM predictions
        GROUP BY hour
        ORDER BY hour ASC
    """)
    summary["hourly_trends"] = [dict(r) for r in cursor.fetchall()]

    # 4. Gender Distribution
    cursor.execute("""
        SELECT 
            gender,
            COUNT(*) as total,
            SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END) as fraud
        FROM predictions
        GROUP BY gender
    """)
    summary["gender_distribution"] = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return summary

def seed_sample_data():
    """Seeds some sample transactions into the database if empty, so dashboard analytics look alive at launch."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM predictions")
    count = cursor.fetchone()[0]
    conn.close()
    
    if count > 0:
        return
        
    print("Seeding sample transactions into database for dashboard visualization...")
    samples = [
        # Genuine Transactions
        {
            "transaction_id": "TXN-A57E81B2",
            "trans_date_trans_time": "2026-06-03 08:34:12",
            "merchant": "fraud_Krunck",
            "category": "grocery_pos",
            "amt": 58.42,
            "gender": "F",
            "city": "Phoenix",
            "state": "AZ",
            "zip": "85001",
            "lat": 33.4484,
            "long": -112.0740,
            "city_pop": 1600000,
            "job": "Software Engineer",
            "age": 34,
            "merch_lat": 33.4812,
            "merch_long": -112.1023,
            "distance": 0.04,
            "prediction": 0,
            "probability": 0.015,
            "status": "Genuine"
        },
        {
            "transaction_id": "TXN-C91E5B72",
            "trans_date_trans_time": "2026-06-03 09:12:45",
            "merchant": "fraud_Kilback",
            "category": "shopping_net",
            "amt": 12.99,
            "gender": "M",
            "city": "Denver",
            "state": "CO",
            "zip": "80202",
            "lat": 39.7392,
            "long": -104.9903,
            "city_pop": 715000,
            "job": "Teacher",
            "age": 42,
            "merch_lat": 39.8105,
            "merch_long": -104.9124,
            "distance": 0.10,
            "prediction": 0,
            "probability": 0.008,
            "status": "Genuine"
        },
        {
            "transaction_id": "TXN-D20F84C1",
            "trans_date_trans_time": "2026-06-03 10:45:00",
            "merchant": "fraud_Streich",
            "category": "gas_transport",
            "amt": 45.00,
            "gender": "F",
            "city": "Dallas",
            "state": "TX",
            "zip": "75201",
            "lat": 32.7767,
            "long": -96.7970,
            "city_pop": 1340000,
            "job": "Accountant",
            "age": 29,
            "merch_lat": 32.7950,
            "merch_long": -96.8210,
            "distance": 0.03,
            "prediction": 0,
            "probability": 0.002,
            "status": "Genuine"
        },
        # Fraud Transactions
        {
            "transaction_id": "TXN-F88B62A4",
            "trans_date_trans_time": "2026-06-03 02:15:30",
            "merchant": "fraud_Rippin",
            "category": "shopping_net",
            "amt": 985.50,
            "gender": "F",
            "city": "Phoenix",
            "state": "AZ",
            "zip": "85001",
            "lat": 33.4484,
            "long": -112.0740,
            "city_pop": 1600000,
            "job": "Software Engineer",
            "age": 34,
            "merch_lat": 35.1205,
            "merch_long": -110.1542,
            "distance": 2.50,
            "prediction": 1,
            "probability": 0.942,
            "status": "Fraud"
        },
        {
            "transaction_id": "TXN-F42C19E7",
            "trans_date_trans_time": "2026-06-03 03:55:12",
            "merchant": "fraud_Littel",
            "category": "entertainment",
            "amt": 670.00,
            "gender": "M",
            "city": "Denver",
            "state": "CO",
            "zip": "80202",
            "lat": 39.7392,
            "long": -104.9903,
            "city_pop": 715000,
            "job": "Teacher",
            "age": 42,
            "merch_lat": 41.2405,
            "merch_long": -103.1250,
            "distance": 2.38,
            "prediction": 1,
            "probability": 0.812,
            "status": "Fraud"
        }
    ]
    
    for s in samples:
        save_prediction(s)
    
    print("Database seeded with sample transactions successfully.")
