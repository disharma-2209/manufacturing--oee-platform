export interface User {
    id: number;
    username: string;
    role: 'admin' | 'analyst' | 'viewer';
    created_at: string;
    last_login?: string;
    is_active: number;
}
export interface DataUpload {
    id: number;
    filename: string;
    original_filename: string;
    upload_time: string;
    uploaded_by: number;
    week_number: number;
    year: number;
    record_count: number;
    lines_detected: string;
    date_range_start: string;
    date_range_end: string;
    status: string;
    source: string;
}
export interface RawIncident {
    id?: number;
    upload_id: number;
    line: string;
    equipment: string;
    status: string;
    cause_category: string;
    cause: string;
    product_code: string;
    team: string;
    remarks: string;
    repair_description: string;
    report_time: string;
    report_by: string;
    dt_ack_time: string;
    dt_ack_by: string;
    completed_time: string;
    complete_by: string;
    end_time: string;
    duration_hours: number;
    response_time_hours: number;
    resolution_time_hours: number;
    week_number: number;
    year: number;
    shift: string;
    station: string;
    is_repeat_failure: number;
    is_cascade: number;
}
export interface ActionPlan {
    id?: number;
    week_number: number;
    year: number;
    line: string;
    area: string;
    description: string;
    action_required: string;
    due_date: string;
    dri: string;
    status: string;
    priority: number;
    remarks: string;
    ai_generated: number;
    ai_confidence?: string;
    created_by?: number;
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
    cost_per_hour_usd: number;
    updated_at?: string;
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
export interface TrendData {
    weekNumber: number;
    year: number;
    avgOEE: number;
    totalDowntimeHours: number;
    totalIncidents: number;
    avgMTTR: number;
    avgMTBF: number;
    byLine: {
        line: string;
        oee: number;
    }[];
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
export interface AnalysisContext {
    weekNumber: number;
    plant: string;
    summary: {
        totalIncidents: number;
        totalDowntimeHours: number;
        avgOEE: number;
        avgMTTR: number;
        avgMTBF: number;
        topFailureCategories: {
            category: string;
            hours: number;
            count: number;
        }[];
    };
    byLine: LineMetrics[];
    byEquipment: EquipmentMetrics[];
    byTeam: TeamMetrics[];
    trends: TrendData[];
    correlations: CorrelationInsight[];
    anomalies: AnomalyAlert[];
    historicalContext: string;
}
export interface JWTPayload {
    userId: number;
    username: string;
    role: string;
    iat?: number;
    exp?: number;
}
export interface AuthenticatedRequest extends Express.Request {
    user?: JWTPayload;
}
declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}
//# sourceMappingURL=index.d.ts.map