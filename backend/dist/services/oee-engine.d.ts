import { RawIncident, LineMetrics, EquipmentMetrics, TeamMetrics, OEESettings, AnomalyAlert } from '../types';
export declare function calculateOEE(incidents: RawIncident[], settings: OEESettings): {
    byLine: LineMetrics[];
    overall: LineMetrics;
    byEquipment: EquipmentMetrics[];
    byTeam: TeamMetrics[];
    anomalies: AnomalyAlert[];
};
export declare function buildParetoData(incidents: RawIncident[]): {
    byCategory: {
        category: string;
        hours: number;
        count: number;
        cumulative: number;
    }[];
    byCause: {
        cause: string;
        category: string;
        hours: number;
        count: number;
    }[];
    byStation: {
        station: string;
        line: string;
        hours: number;
        count: number;
        topCategory: string;
    }[];
};
export declare function detectCascadeAndRepeatFailures(incidents: RawIncident[]): RawIncident[];
//# sourceMappingURL=oee-engine.d.ts.map