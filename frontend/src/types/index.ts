export interface User {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  role: 'admin' | 'analyst' | 'viewer';
  created_at: string;
  last_login?: string;
  last_activity?: string;
  is_active: number;
}

export interface UserRequest {
  id: number;
  username: string;
  email: string;
  full_name: string;
  requested_role: 'analyst' | 'viewer';
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  requested_at: string;
  reviewed_at?: string;
  reviewed_by?: number;
}

export interface DataUpload {
  id: number;
  filename: string;
  original_filename: string;
  upload_time: string;
  uploaded_by: number;
  uploaded_by_name?: string;
  week_number: number;
  year: number;
  record_count: number;
  lines_detected: string;
  date_range_start: string;
  date_range_end: string;
  status: string;
  source: string;
}

export interface LineMetrics {
  line: string;
  totalIncidents: number;
  totalDowntimeHours: number;
  microStopHours: number;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  mttr: number;
  mtbf: number;
  plannedTime: number;
  oeeSource?: 'line_file' | 'incident_file';
}

export interface EquipmentMetrics {
  equipment: string;
  line: string;
  totalIncidents: number;
  totalDowntimeHours: number;
  avgMttr: number;
  avgMtbf: number;
  reliabilityScore: number;
  healthScore: number;
  isChronicFailure: boolean;
}

export interface TeamMetrics {
  team: string;
  totalIncidents: number;
  avgResponseTime: number;
  avgResolutionTime: number;
  slaCompliance: number;
  categories: string[];
}

export interface ParetoItem {
  category: string;
  hours: number;
  count: number;
  cumulative: number;
}

export interface CorrelationInsight {
  metric1: string;
  metric2: string;
  correlation: number;
  significance: string;
}

export interface AnomalyAlert {
  metric: string;
  line?: string;
  equipment?: string;
  currentValue: number;
  averageValue: number;
  stdDev: number;
  deviations: number;
  direction: 'above' | 'below';
}

export interface AnalysisSummary {
  totalIncidents: number;
  totalDowntimeHours: number;
  avgOEE: number;
  avgMTTR: number;
  avgMTBF: number;
  topFailureCategories: { category: string; hours: number; count: number }[];
  cascadeCount: number;
  repeatFailureCount: number;
  lineFileCount?: number;
}

export interface FullAnalysis {
  summary: AnalysisSummary;
  byLine: LineMetrics[];
  overall: LineMetrics;
  byEquipment: EquipmentMetrics[];
  byTeam: TeamMetrics[];
  pareto: {
    byCategory: ParetoItem[];
    byCause: { cause: string; category: string; hours: number; count: number }[];
    byStation: { station: string; line: string; hours: number; count: number; topCategory: string }[];
  };
  correlation: {
    labels: string[];
    matrix: number[][];
    insights: CorrelationInsight[];
  };
  shiftAnalysis: { shift: string; line: string; count: number; totalHours: number; avgResolution: number }[];
  heatmap: { day: number; hour: number; count: number }[];
  productCorrelation: { product: string; category: string; hours: number; count: number }[];
  anomalies: AnomalyAlert[];
  settings: OEESettings;
  empty?: boolean;
  message?: string;
}

export interface TrendData {
  weekNumber: number;
  year: number;
  uploadId: number;
  avgOEE: number;
  availability: number;
  performance: number;
  quality: number;
  totalDowntimeHours: number;
  totalIncidents: number;
  avgMTTR: number;
  avgMTBF: number;
  lineFileCount?: number;
  byLine: { line: string; oee: number; availability: number; oeeSource?: 'line_file' | 'incident_file' }[];
}

export interface OEETransparencyStation {
  station: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  totalBoards: number;
  producedQty: number;
  stoppageHours: number;
  stoppageCount: number;
  microStopCount: number;
  microStopHours: number;
  tackTimeSec: number;
  plannedHours: number;
  mttr: number;
  mtbf: number;
  elVariant: string;
}

export interface OEETransparencyLine {
  line: string;
  oeeSource: 'line_file' | 'incident_file';
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  incidentOEE: number;
  incidentAvailability: number;
  incidentPerformance: number;
  incidentQuality: number;
  incidentDowntimeHours: number;
  incidentCount: number;
  stations: OEETransparencyStation[];
  totalBoardsProduced: number;
  formula: {
    method: string;
    targetUPH?: number;
    plannedHours: number;
    stationAverage?: string;
    availability: string;
    performance: string;
    quality: string;
  };
}

export interface OEETransparency {
  lines: OEETransparencyLine[];
  settings: OEESettings;
}

export interface ActionPlan {
  id?: number;
  week_number: number;
  year: number;
  line: string;
  area: string;
  description: string;
  action_required: string;
  due_date?: string;
  dri?: string;
  status: 'Open' | 'In Progress' | 'Completed' | 'Overdue' | 'Cancelled';
  priority: 1 | 2 | 3 | 4 | 5;
  remarks?: string;
  ai_generated: number;
  ai_confidence?: string;
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
  source_upload_id?: number;
}

export interface OEESettings {
  id?: number;
  plant_name: string;
  shifts_per_day: number;
  hours_per_shift: number;
  days_per_week: number;
  oee_goal: number;
  oee_minimum: number;
  availability_goal: number;
  performance_goal: number;
  quality_goal: number;
  downtime_threshold_minutes: number;
  downtime_threshold_warning?: number;
  downtime_threshold_critical?: number;
  mttr_target?: number;
  mtbf_target?: number;
  cost_per_hour_usd: number;
  updated_at?: string;
}

export interface AIAnalysis {
  id: number;
  analysis_type: string;
  week_number: number;
  line?: string;
  area?: string;
  created_at: string;
  model_version: string;
  created_by_name?: string;
  response?: string;
}

export interface ManagedUser {
  id: number;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  full_name?: string;
}


export interface TimelineItem {
  id: number;
  line: string;
  equipment: string;
  cause_category: string;
  cause: string;
  report_time: string;
  end_time: string;
  duration_hours: number;
  team: string;
  remarks: string;
  shift: string;
  is_cascade: number;
  is_repeat_failure: number;
}
