import { RawIncident, LineMetrics, CorrelationInsight } from '../types';
export declare function pearsonCorrelation(x: number[], y: number[]): number;
export declare function buildCorrelationMatrix(byLine: LineMetrics[]): {
    labels: string[];
    matrix: number[][];
    insights: CorrelationInsight[];
};
export declare function buildProductFailureCorrelation(incidents: RawIncident[]): {
    product: string;
    category: string;
    hours: number;
    count: number;
}[];
export declare function buildShiftAnalysis(incidents: RawIncident[]): {
    shift: string;
    line: string;
    count: number;
    totalHours: number;
    avgResolution: number;
}[];
export declare function buildDayHourHeatmap(incidents: RawIncident[]): {
    day: number;
    hour: number;
    count: number;
}[];
//# sourceMappingURL=correlation.d.ts.map