CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS data_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_by INTEGER REFERENCES users(id),
  week_number INTEGER,
  year INTEGER,
  record_count INTEGER,
  lines_detected TEXT,
  date_range_start DATETIME,
  date_range_end DATETIME,
  status TEXT DEFAULT 'active',
  source TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS raw_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER REFERENCES data_uploads(id),
  line TEXT,
  equipment TEXT,
  status TEXT,
  cause_category TEXT,
  cause TEXT,
  product_code TEXT,
  team TEXT,
  remarks TEXT,
  repair_description TEXT,
  report_time DATETIME,
  report_by TEXT,
  dt_ack_time DATETIME,
  dt_ack_by TEXT,
  completed_time DATETIME,
  complete_by TEXT,
  end_time DATETIME,
  duration_hours REAL,
  response_time_hours REAL,
  resolution_time_hours REAL,
  week_number INTEGER,
  year INTEGER,
  shift TEXT,
  station TEXT,
  is_repeat_failure INTEGER DEFAULT 0,
  is_cascade INTEGER DEFAULT 0
);

-- Migration: add station column to existing databases
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);

-- Line-level OEE from timestamp files (one file per line per week)
CREATE TABLE IF NOT EXISTS line_oee_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_by INTEGER REFERENCES users(id),
  line TEXT NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_boards INTEGER,
  first_timestamp DATETIME,
  last_timestamp DATETIME,
  planned_hours REAL,
  availability REAL,
  performance REAL,
  quality REAL,
  oee REAL,
  status TEXT DEFAULT 'active'
);

-- Per-station OEE derived from timestamp files
CREATE TABLE IF NOT EXISTS line_oee_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER REFERENCES line_oee_uploads(id),
  station TEXT NOT NULL,
  total_boards INTEGER,
  produced_qty INTEGER,
  pass_boards INTEGER,
  fail_boards INTEGER,
  tested_boards INTEGER,
  first_timestamp DATETIME,
  last_timestamp DATETIME,
  span_hours REAL,
  actual_run_hours REAL,
  planned_hours REAL,
  available_hours REAL,
  stoppage_count INTEGER,
  stoppage_hours REAL,
  availability REAL,
  performance REAL,
  quality REAL,
  oee REAL,
  mttr REAL,
  mtbf REAL,
  ideal_cycle_time_sec REAL,
  actual_cycle_time_sec REAL,
  el_variant TEXT
);

-- Per-station manual QC rate overrides (injected into line-oee-parser at upload time)
CREATE TABLE IF NOT EXISTS station_quality_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line TEXT NOT NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  station_name TEXT NOT NULL,
  manual_qc_rate REAL NOT NULL CHECK(manual_qc_rate >= 0 AND manual_qc_rate <= 1),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(line, week_number, year, station_name)
);

CREATE TABLE IF NOT EXISTS action_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_number INTEGER,
  year INTEGER,
  line TEXT,
  area TEXT,
  description TEXT,
  action_required TEXT,
  due_date DATE,
  dri TEXT,
  status TEXT DEFAULT 'Open',
  priority INTEGER DEFAULT 3,
  remarks TEXT,
  ai_generated INTEGER DEFAULT 0,
  ai_confidence TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  source_upload_id INTEGER REFERENCES data_uploads(id)
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER REFERENCES data_uploads(id),
  analysis_type TEXT,
  week_number INTEGER,
  line TEXT,
  area TEXT,
  prompt_context TEXT,
  response TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  model_version TEXT
);

CREATE TABLE IF NOT EXISTS oee_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_name TEXT DEFAULT 'Manufacturing Plant',
  shifts_per_day INTEGER DEFAULT 3,
  hours_per_shift INTEGER DEFAULT 8,
  days_per_week INTEGER DEFAULT 5,
  oee_goal REAL DEFAULT 0.82,
  oee_minimum REAL DEFAULT 0.75,
  availability_goal REAL DEFAULT 0.90,
  performance_goal REAL DEFAULT 0.95,
  quality_goal REAL DEFAULT 0.995,
  downtime_threshold_minutes INTEGER DEFAULT 10,
  cost_per_hour_usd REAL DEFAULT 1000,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER REFERENCES users(id),
  username TEXT,
  action TEXT,
  resource TEXT,
  details TEXT,
  ip_address TEXT
);
