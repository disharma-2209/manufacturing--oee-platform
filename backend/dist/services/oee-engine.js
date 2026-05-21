"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateOEE = calculateOEE;
exports.buildParetoData = buildParetoData;
exports.detectCascadeAndRepeatFailures = detectCascadeAndRepeatFailures;
function calculateOEE(incidents, settings) {
    const plannedTime = settings.shifts_per_day * settings.hours_per_shift * settings.days_per_week;
    const thresholdHours = settings.downtime_threshold_minutes / 60;
    const lineGroups = groupBy(incidents, 'line');
    const byLine = [];
    for (const [line, lineIncidents] of Object.entries(lineGroups)) {
        if (!line || line === 'Unknown')
            continue;
        const metrics = computeLineMetrics(line, lineIncidents, plannedTime, thresholdHours);
        byLine.push(metrics);
    }
    const overall = computeLineMetrics('Overall', incidents, plannedTime * Math.max(byLine.length, 1), thresholdHours);
    overall.plannedTime = plannedTime * Math.max(byLine.length, 1);
    const equipGroups = groupBy(incidents, 'equipment');
    const byEquipment = [];
    for (const [equip, equipIncidents] of Object.entries(equipGroups)) {
        if (!equip)
            continue;
        const lineForEquip = equipIncidents[0]?.line || 'Unknown';
        const totalDown = equipIncidents.reduce((s, i) => s + (i.duration_hours || 0), 0);
        const avgMttr = equipIncidents.length > 0
            ? equipIncidents.reduce((s, i) => s + (i.resolution_time_hours || 0), 0) / equipIncidents.length
            : 0;
        const avgMtbf = equipIncidents.length > 0 ? plannedTime / equipIncidents.length : plannedTime;
        const reliability = avgMtbf / (avgMttr + avgMtbf);
        const healthScore = computeHealthScore(equipIncidents, avgMttr, avgMtbf, plannedTime);
        byEquipment.push({
            equipment: equip,
            line: lineForEquip,
            totalIncidents: equipIncidents.length,
            totalDowntimeHours: totalDown,
            avgMttr,
            avgMtbf,
            reliabilityScore: reliability,
            healthScore,
            isChronicFailure: false,
        });
    }
    markChronicFailures(byEquipment, incidents);
    const teamGroups = groupBy(incidents, 'team');
    const byTeam = [];
    for (const [team, teamIncidents] of Object.entries(teamGroups)) {
        if (!team)
            continue;
        const avgResponse = teamIncidents.length > 0
            ? teamIncidents.reduce((s, i) => s + (i.response_time_hours || 0), 0) / teamIncidents.length
            : 0;
        const avgResolution = teamIncidents.length > 0
            ? teamIncidents.reduce((s, i) => s + (i.resolution_time_hours || 0), 0) / teamIncidents.length
            : 0;
        const slaLimit = 4;
        const slaCompliant = teamIncidents.filter((i) => (i.resolution_time_hours || 0) <= slaLimit).length;
        const categories = [...new Set(teamIncidents.map((i) => i.cause_category).filter(Boolean))];
        byTeam.push({
            team,
            totalIncidents: teamIncidents.length,
            avgResponseTime: avgResponse,
            avgResolutionTime: avgResolution,
            slaCompliance: teamIncidents.length > 0 ? slaCompliant / teamIncidents.length : 1,
            categories,
        });
    }
    const anomalies = detectAnomalies(byLine, byEquipment);
    return { byLine, overall, byEquipment, byTeam, anomalies };
}
function computeLineMetrics(line, incidents, plannedTime, thresholdHours) {
    const downtimeIncidents = incidents.filter((i) => (i.duration_hours || 0) > thresholdHours);
    const microStops = incidents.filter((i) => (i.duration_hours || 0) <= thresholdHours);
    const totalDowntime = downtimeIncidents.reduce((s, i) => s + (i.duration_hours || 0), 0);
    const microStopHours = microStops.reduce((s, i) => s + (i.duration_hours || 0), 0);
    const availability = Math.max(0, Math.min(1, (plannedTime - totalDowntime) / plannedTime));
    const performance = Math.max(0, Math.min(1, 1 - microStopHours / plannedTime));
    const qualityDefects = incidents.filter((i) => i.cause_category?.toLowerCase().includes('qly') ||
        i.cause_category?.toLowerCase().includes('quality')).length;
    const quality = incidents.length > 0 ? Math.max(0, Math.min(1, 1 - qualityDefects / incidents.length)) : 1;
    const quality_adj = Math.max(quality, 0.9);
    const oee = availability * performance * quality_adj;
    const mttr = incidents.length > 0
        ? incidents.reduce((s, i) => s + (i.resolution_time_hours || 0), 0) / incidents.length
        : 0;
    const mtbf = incidents.length > 0 ? plannedTime / incidents.length : plannedTime;
    return {
        line,
        totalIncidents: incidents.length,
        totalDowntimeHours: totalDowntime,
        microStopHours,
        availability,
        performance,
        quality: quality_adj,
        oee,
        mttr,
        mtbf,
        plannedTime,
    };
}
function computeHealthScore(incidents, avgMttr, avgMtbf, plannedTime) {
    if (incidents.length === 0)
        return 100;
    const frequencyScore = Math.max(0, 100 - (incidents.length / (plannedTime / 8)) * 10);
    const mttrScore = Math.max(0, 100 - avgMttr * 20);
    const mtbfScore = Math.min(100, (avgMtbf / plannedTime) * 100);
    const responseScore = incidents.length > 0
        ? Math.max(0, 100 - (incidents.reduce((s, i) => s + (i.response_time_hours || 0), 0) / incidents.length) * 30)
        : 100;
    return Math.round((frequencyScore * 0.3 + mttrScore * 0.3 + mtbfScore * 0.25 + responseScore * 0.15));
}
function markChronicFailures(equipMetrics, incidents) {
    const totalDowntime = incidents.reduce((s, i) => s + (i.duration_hours || 0), 0);
    for (const em of equipMetrics) {
        const isChronic = em.totalIncidents > 3 &&
            totalDowntime > 0 &&
            em.totalDowntimeHours / totalDowntime > 0.05;
        em.isChronicFailure = isChronic;
    }
}
function detectAnomalies(byLine, byEquipment) {
    const alerts = [];
    if (byLine.length > 1) {
        const oeeValues = byLine.map((l) => l.oee);
        const mean = oeeValues.reduce((s, v) => s + v, 0) / oeeValues.length;
        const std = Math.sqrt(oeeValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / oeeValues.length);
        for (const line of byLine) {
            const deviations = std > 0 ? Math.abs(line.oee - mean) / std : 0;
            if (deviations > 1.5) {
                alerts.push({
                    metric: 'OEE',
                    line: line.line,
                    currentValue: line.oee,
                    averageValue: mean,
                    stdDev: std,
                    deviations,
                    direction: line.oee < mean ? 'below' : 'above',
                });
            }
        }
    }
    const mttrValues = byEquipment.map((e) => e.avgMttr);
    if (mttrValues.length > 1) {
        const mean = mttrValues.reduce((s, v) => s + v, 0) / mttrValues.length;
        const std = Math.sqrt(mttrValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / mttrValues.length);
        for (const equip of byEquipment) {
            const deviations = std > 0 ? Math.abs(equip.avgMttr - mean) / std : 0;
            if (deviations > 1.5 && equip.avgMttr > mean) {
                alerts.push({
                    metric: 'MTTR',
                    equipment: equip.equipment,
                    line: equip.line,
                    currentValue: equip.avgMttr,
                    averageValue: mean,
                    stdDev: std,
                    deviations,
                    direction: 'above',
                });
            }
        }
    }
    return alerts;
}
function buildParetoData(incidents) {
    const catMap = new Map();
    const causeMap = new Map();
    // station key: "station||line"
    const stationMap = new Map();
    for (const inc of incidents) {
        const cat = inc.cause_category || 'Mechanical';
        const cause = inc.cause || 'Unclassified failure';
        const hours = inc.duration_hours || 0;
        const station = inc.station || inc.equipment || 'Unknown Station';
        const line = inc.line || 'Unknown';
        const existing = catMap.get(cat) || { hours: 0, count: 0 };
        catMap.set(cat, { hours: existing.hours + hours, count: existing.count + 1 });
        const existingCause = causeMap.get(cause) || { category: cat, hours: 0, count: 0 };
        causeMap.set(cause, { category: cat, hours: existingCause.hours + hours, count: existingCause.count + 1 });
        const stKey = `${station}||${line}`;
        const existingSt = stationMap.get(stKey) || { line, hours: 0, count: 0, catCounts: new Map() };
        existingSt.hours += hours;
        existingSt.count += 1;
        existingSt.catCounts.set(cat, (existingSt.catCounts.get(cat) || 0) + 1);
        stationMap.set(stKey, existingSt);
    }
    const totalHours = Array.from(catMap.values()).reduce((s, v) => s + v.hours, 0);
    const sorted = Array.from(catMap.entries())
        .sort((a, b) => b[1].hours - a[1].hours)
        .map(([cat, data]) => ({ category: cat, ...data, cumulative: 0 }));
    let cumSum = 0;
    for (const item of sorted) {
        cumSum += item.hours;
        item.cumulative = totalHours > 0 ? (cumSum / totalHours) * 100 : 0;
    }
    const byCause = Array.from(causeMap.entries())
        .sort((a, b) => b[1].hours - a[1].hours)
        .map(([cause, data]) => ({ cause, ...data }));
    const byStation = Array.from(stationMap.entries())
        .map(([key, data]) => {
        const station = key.split('||')[0];
        let topCategory = 'Unknown';
        let topCount = 0;
        for (const [cat, cnt] of data.catCounts.entries()) {
            if (cnt > topCount) {
                topCount = cnt;
                topCategory = cat;
            }
        }
        return { station, line: data.line, hours: data.hours, count: data.count, topCategory };
    })
        .sort((a, b) => b.hours - a.hours);
    return { byCategory: sorted, byCause, byStation };
}
function detectCascadeAndRepeatFailures(incidents) {
    const sorted = [...incidents].sort((a, b) => new Date(a.report_time).getTime() - new Date(b.report_time).getTime());
    const lineGroups = groupBy(sorted, 'line');
    for (const lineIncs of Object.values(lineGroups)) {
        for (let i = 1; i < lineIncs.length; i++) {
            const prev = lineIncs[i - 1];
            const curr = lineIncs[i];
            const prevEnd = prev.end_time ? new Date(prev.end_time).getTime() : new Date(prev.report_time).getTime() + (prev.duration_hours || 0) * 3600000;
            const currStart = new Date(curr.report_time).getTime();
            if (currStart - prevEnd < 30 * 60000) {
                curr.is_cascade = 1;
            }
        }
    }
    const equipMap = new Map();
    for (const inc of sorted) {
        const key = `${inc.equipment}|${inc.cause_category}`;
        const arr = equipMap.get(key) || [];
        arr.push(inc);
        equipMap.set(key, arr);
    }
    for (const incs of equipMap.values()) {
        if (incs.length < 2)
            continue;
        for (let i = 1; i < incs.length; i++) {
            const prev = incs[i - 1];
            const curr = incs[i];
            const diffDays = (new Date(curr.report_time).getTime() - new Date(prev.report_time).getTime()) / 86400000;
            if (diffDays <= 14) {
                curr.is_repeat_failure = 1;
            }
        }
    }
    return sorted;
}
function groupBy(arr, key) {
    const result = {};
    for (const item of arr) {
        const k = String(item[key] || '');
        if (!result[k])
            result[k] = [];
        result[k].push(item);
    }
    return result;
}
//# sourceMappingURL=oee-engine.js.map