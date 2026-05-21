"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pearsonCorrelation = pearsonCorrelation;
exports.buildCorrelationMatrix = buildCorrelationMatrix;
exports.buildProductFailureCorrelation = buildProductFailureCorrelation;
exports.buildShiftAnalysis = buildShiftAnalysis;
exports.buildDayHourHeatmap = buildDayHourHeatmap;
function pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2)
        return 0;
    const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
        const ex = x[i] - mx;
        const ey = y[i] - my;
        num += ex * ey;
        dx += ex * ex;
        dy += ey * ey;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? 0 : num / denom;
}
function buildCorrelationMatrix(byLine) {
    const metrics = ['oee', 'totalDowntimeHours', 'mttr', 'mtbf', 'totalIncidents'];
    const labels = ['OEE', 'Downtime Hours', 'MTTR', 'MTBF', 'Incident Count'];
    const vectors = metrics.map((m) => byLine.map((l) => l[m]));
    const n = metrics.length;
    const matrix = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            matrix[i][j] = i === j ? 1 : pearsonCorrelation(vectors[i], vectors[j]);
        }
    }
    const insights = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const r = matrix[i][j];
            const absR = Math.abs(r);
            let significance = 'negligible';
            if (absR >= 0.7)
                significance = 'strong';
            else if (absR >= 0.4)
                significance = 'moderate';
            else if (absR >= 0.2)
                significance = 'weak';
            if (absR >= 0.4) {
                insights.push({
                    metric1: labels[i],
                    metric2: labels[j],
                    correlation: r,
                    significance,
                });
            }
        }
    }
    return { labels, matrix, insights };
}
function buildProductFailureCorrelation(incidents) {
    const map = new Map();
    for (const inc of incidents) {
        const key = `${inc.product_code}||${inc.cause_category}`;
        const existing = map.get(key) || { hours: 0, count: 0 };
        map.set(key, {
            hours: existing.hours + (inc.duration_hours || 0),
            count: existing.count + 1,
        });
    }
    return Array.from(map.entries())
        .map(([key, val]) => {
        const [product, category] = key.split('||');
        return { product, category, ...val };
    })
        .sort((a, b) => b.hours - a.hours);
}
function buildShiftAnalysis(incidents) {
    const map = new Map();
    for (const inc of incidents) {
        const key = `${inc.shift}||${inc.line}`;
        const existing = map.get(key) || { count: 0, totalHours: 0, resolutionHours: 0 };
        map.set(key, {
            count: existing.count + 1,
            totalHours: existing.totalHours + (inc.duration_hours || 0),
            resolutionHours: existing.resolutionHours + (inc.resolution_time_hours || 0),
        });
    }
    return Array.from(map.entries()).map(([key, val]) => {
        const [shift, line] = key.split('||');
        return {
            shift,
            line,
            count: val.count,
            totalHours: val.totalHours,
            avgResolution: val.count > 0 ? val.resolutionHours / val.count : 0,
        };
    });
}
function buildDayHourHeatmap(incidents) {
    const map = new Map();
    for (const inc of incidents) {
        if (!inc.report_time)
            continue;
        const d = new Date(inc.report_time);
        const day = d.getDay();
        const hour = d.getHours();
        const key = `${day}-${hour}`;
        map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).map(([key, count]) => {
        const [day, hour] = key.split('-').map(Number);
        return { day, hour, count };
    });
}
//# sourceMappingURL=correlation.js.map