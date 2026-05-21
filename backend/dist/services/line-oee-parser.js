"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATION_CONFIGS = void 0;
exports.parseLineOEEFile = parseLineOEEFile;
const XLSX = __importStar(require("xlsx"));
const path_1 = __importDefault(require("path"));
// ─── Engineering-validated throughput constant ────────────────────────────────
// Verified against manual OEE reference (Output_WK15_Line1.xlsx) across all 5
// stations and all weeks WK11–WK17.  Expected Parts = availHrs × BOARDS_PER_HOUR.
const BOARDS_PER_HOUR = 500; // 500 boards/hr = 7.2 s/board
const STOPPAGE_GAP_MINUTES = 10; // gaps > 10 min are stoppages
const FALLBACK_PLANNED_HOURS = 112.5; // confirmed by Salcomp: 112.5h scheduled for all weeks
const STATION_GROUP_DEFS = [
    {
        name: 'SPI (SMT)',
        subStepKeywords: ['SCREEN_PRINTER', 'SPI_SOLDER', 'SOLDERPASTEIN', '_SPI_', '_SPI', 'SPI_SMT', 'SPI_INSPECT', 'POST_AOI'],
        qualityKeyword: '_SPI',
        stoppageKeyword: 'SOLDERPASTEIN', // CMES column: EL0xSOLDERPASTEIN_TESTTIME — excludes SCREEN_PRINTER to avoid +8.45h false downtime
        isCanonical: false,
        useAdditiveCount: true,
        tackTimeSec: 7.5, // 15 sec per 2 boards
    },
    {
        name: 'API/PCB_VI',
        subStepKeywords: ['FIX_PCB_LINK', 'API_MI', 'PCB_VI', 'PCBVI', 'API_INSPECT'],
        stoppageKeyword: 'PCB_VI', // exit time from PCB_VI column only; FIX_PCB_LINK/API_MI skew by -2.34h
        isCanonical: false,
        tackTimeSec: 30.0, // 30 sec per board
    },
    {
        name: 'Lead Height',
        subStepKeywords: ['LEAD_HT', 'LEADHT', 'LEAD_HEIGHT'],
        isCanonical: true,
        // useAdditiveCount: dominant-EL (EL01) count only → 30,981 boards ≈ manual 30,979 ✓
        // Without useCrossELExitTime: EL01-only gap detection → 12.82h DT ≈ manual 12.74h ✓
        // Without isLeadHeight: TESTRESULT computed naturally from CMES → ~97% quality ≈ manual ✓
        useAdditiveCount: true,
        tackTimeSec: 7.5, // 15 sec per 2 boards
    },
    {
        name: 'Carousel',
        subStepKeywords: ['CAROUSEL3', 'CAROUSEL'],
        isCanonical: false,
        useCrossELExitTime: true, // combine EL01+EL02 boards in stoppage timeline — matches doc
        tackTimeSec: 8.0, // 8 sec per board
    },
    {
        name: 'Wave 3',
        subStepKeywords: ['WAVE3_FIX_LINK', 'WAVE3_FIXTURE', 'CAP_USW', 'WAVE3_COMP_TRACE', 'WAVE3_COMP', 'WAVE3_TRACE'],
        stoppageKeyword: 'WAVE3_COMP_TRACE', // only WAVE3_COMP_TRACE columns (both EL01 and EL02)
        useCrossELExitTime: true, // combine EL01 + EL02 boards — matches manual methodology
        isCanonical: false,
        tackTimeSec: 8.0, // 8 sec per board
    },
];
exports.STATION_CONFIGS = []; // legacy – no longer used
// ─── Multi-column group resolution ───────────────────────────────────────────
function resolveStationGroups(header, rows) {
    const upperHeader = header.map((h) => String(h ?? '').toUpperCase());
    const resolved = [];
    for (const def of STATION_GROUP_DEFS) {
        const subSteps = [];
        for (let i = 0; i < upperHeader.length; i++) {
            const h = upperHeader[i];
            if (!h.includes('TESTTIME'))
                continue;
            const matchingKeyword = def.subStepKeywords.find((kw) => h.includes(kw.toUpperCase()));
            if (!matchingKeyword)
                continue;
            // Exclude if header contains any excludeKeyword
            const excluded = (def.excludeKeywords ?? []).some((kw) => h.includes(kw.toUpperCase()));
            if (excluded)
                continue;
            // Determine TESTRESULT column (next col or col after next)
            let resultOffset = 1;
            if (upperHeader[i + 2]?.includes('TESTRESULT'))
                resultOffset = 2;
            else if (upperHeader[i + 1]?.includes('TESTRESULT'))
                resultOffset = 1;
            const elMatch = h.match(/EL(\d+)/);
            const elNum = elMatch ? parseInt(elMatch[1], 10) : 99;
            const elVariant = `EL${String(elNum).padStart(2, '0')}`;
            const recordCount = rows.reduce((n, row) => {
                const v = row[i];
                return n + (v != null && v !== '' ? 1 : 0);
            }, 0);
            subSteps.push({
                keyword: matchingKeyword,
                headerUpper: h,
                timeCol: i,
                resultCol: i + resultOffset,
                elVariant,
                recordCount,
            });
        }
        if (subSteps.length === 0)
            continue;
        // Dominant EL = EL variant with highest total record count across its sub-steps
        const byEl = new Map();
        for (const ss of subSteps) {
            const list = byEl.get(ss.elVariant) ?? [];
            list.push(ss);
            byEl.set(ss.elVariant, list);
        }
        let dominantEl = '';
        let dominantCount = 0;
        for (const [el, steps] of byEl.entries()) {
            const total = steps.reduce((s, ss) => s + ss.recordCount, 0);
            if (total > dominantCount) {
                dominantCount = total;
                dominantEl = el;
            }
        }
        const dominantSubSteps = byEl.get(dominantEl) ?? subSteps;
        // Quality sub-step: from dominant EL, match qualityKeyword, then highest record count
        let qualityCandidates = def.qualityKeyword
            ? dominantSubSteps.filter((s) => s.keyword === def.qualityKeyword)
            : dominantSubSteps;
        if (qualityCandidates.length === 0)
            qualityCandidates = dominantSubSteps;
        qualityCandidates = [...qualityCandidates].sort((a, b) => b.recordCount - a.recordCount);
        const qualitySubStep = qualityCandidates[0];
        resolved.push({ def, subSteps, dominantSubSteps, qualitySubStep });
        // Debug log per group
        console.log(`[line-oee-parser] Station group: ${def.name} | dominantEL: ${dominantEl} (${dominantCount} records)`);
        for (const ss of subSteps) {
            const marker = ss.elVariant === dominantEl ? '*' : ' ';
            console.log(`  ${marker}${ss.elVariant} ${ss.keyword} → timeCol=${ss.timeCol} resultCol=${ss.resultCol} records=${ss.recordCount}`);
        }
    }
    return resolved;
}
function extractGroupData(dataRows, group) {
    const exitTimes = [];
    const qualityResults = [];
    // Exit-time columns:
    //  • useCrossELExitTime=true → use ALL EL variants (EL01 + EL02 combined)
    //  • stoppageKeyword set     → filter using BOTH keyword equality AND header-contains
    //    (header-contains handles CMES naming variants where ss.keyword is a prefix/substring
    //    of the actual column name, e.g. keyword='PCB_VI' but header='EL01PCB_VI_PCBVI_TESTTIME')
    //  • otherwise              → all dominant-EL sub-steps
    const matchesStoppage = (ss) => {
        if (!group.def.stoppageKeyword)
            return true;
        const kw = group.def.stoppageKeyword.toUpperCase();
        return ss.keyword.toUpperCase() === kw || ss.headerUpper.includes(kw);
    };
    let effectiveCols;
    if (group.def.useCrossELExitTime) {
        const crossElCols = group.def.stoppageKeyword
            ? group.subSteps.filter(matchesStoppage)
            : group.subSteps;
        effectiveCols = crossElCols.length > 0 ? crossElCols : group.subSteps;
    }
    else {
        const stoppageCols = group.def.stoppageKeyword
            ? group.dominantSubSteps.filter(matchesStoppage)
            : group.dominantSubSteps;
        effectiveCols = stoppageCols.length > 0 ? stoppageCols : group.dominantSubSteps;
    }
    // Debug: log which columns are used for stoppage detection
    if (group.def.stoppageKeyword) {
        console.log(`[line-oee-parser] ${group.def.name} stoppageKeyword='${group.def.stoppageKeyword}' → effectiveCols: [${effectiveCols.map(s => `${s.elVariant}:${s.keyword}`).join(', ')}] (from ${group.def.useCrossELExitTime ? 'ALL EL' : 'dominant EL'} pool)`);
        if (effectiveCols.length === 0) {
            console.warn(`[line-oee-parser] WARNING: stoppageKeyword '${group.def.stoppageKeyword}' matched NO sub-steps for ${group.def.name} — falling back to all dominant sub-steps. Check CMES column headers.`);
        }
    }
    for (const row of dataRows) {
        // Exit time = MAX across dominant EL's effective (stoppage) sub-steps
        let maxTs = null;
        for (const ss of effectiveCols) {
            const ts = xlSerialToDate(row[ss.timeCol]);
            if (ts !== null) {
                if (maxTs === null || ts.getTime() > maxTs.getTime())
                    maxTs = ts;
            }
        }
        exitTimes.push(maxTs);
        qualityResults.push(row[group.qualitySubStep.resultCol]);
    }
    // subStepCounts: dominant EL only (for additive SPI count and produced qty)
    const subStepCounts = group.dominantSubSteps.map((ss) => dataRows.reduce((n, row) => {
        const v = row[ss.timeCol];
        return n + (v != null && v !== '' ? 1 : 0);
    }, 0));
    // boardCountExitTimes: union of ALL sub-steps across ALL EL variants.
    // The manual methodology counts EL01 + EL02 boards together for produced qty,
    // so we must include all EL variants here (not just the dominant EL used for stoppages).
    const boardCountExitTimes = dataRows.map((row) => {
        let maxTs = null;
        for (const ss of group.subSteps) { // ALL sub-steps, ALL EL variants
            const ts = xlSerialToDate(row[ss.timeCol]);
            if (ts !== null && (maxTs === null || ts.getTime() > maxTs.getTime()))
                maxTs = ts;
        }
        return maxTs;
    });
    return { group, exitTimes, boardCountExitTimes, qualityResults, subStepCounts };
}
// ─── Unchanged helpers ────────────────────────────────────────────────────────
function xlSerialToDate(v) {
    if (!v && v !== 0)
        return null;
    if (typeof v === 'number' && v > 40000) {
        const d = XLSX.SSF.parse_date_code(v);
        if (!d)
            return null;
        return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S)));
    }
    if (typeof v === 'string' && v.trim()) {
        const parsed = new Date(v);
        if (!isNaN(parsed.getTime()))
            return parsed;
    }
    return null;
}
function isPass(v) {
    if (!v && v !== 0)
        return true;
    const s = String(v).trim().toUpperCase();
    return s === 'PASS' || s === 'P' || s === '1' || s === 'OK' || s === 'TRUE' || s === 'YES';
}
function isFail(v) {
    if (!v && v !== 0)
        return false;
    const s = String(v).trim().toUpperCase();
    return s === 'FAIL' || s === 'F' || s === '0' || s === 'NG' || s === 'FALSE' || s === 'NO';
}
function detectLineFromFilename(filename) {
    const base = path_1.default.basename(filename, path_1.default.extname(filename));
    const m = base.match(/(?:line[_\s-]?|l)(\d+)/i);
    if (m)
        return `Line ${m[1]}`;
    return 'Unknown';
}
function detectWeekFromFilename(filename) {
    // Matches WK18, WK-18, Week18, Week_18 etc. (case-insensitive)
    const m = path_1.default.basename(filename).match(/(?:WK|Week)[_\s-]?(\d{1,2})/i);
    if (!m) {
        // Also check parent folder name embedded in path (e.g. "WK18/Line 2.xlsx")
        const pathM = filename.replace(/\\/g, '/').match(/(?:WK|Week)[_\s-]?(\d{1,2})/i);
        if (pathM) {
            console.log(`[line-oee-parser] Week detected from path: ${pathM[1]} from ${filename}`);
            return parseInt(pathM[1], 10);
        }
    }
    const result = m ? parseInt(m[1], 10) : undefined;
    console.log(`[line-oee-parser] Week detection from filename "${filename}": ${result}`);
    return result;
}
function detectWeekYear(timestamps) {
    const valid = timestamps.filter((t) => t !== null);
    if (valid.length === 0)
        return { weekNumber: 0, year: new Date().getFullYear() };
    valid.sort((a, b) => a.getTime() - b.getTime());
    const mid = valid[Math.floor(valid.length / 2)];
    const year = mid.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const startOfWeek1 = new Date(jan4);
    startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const weekNumber = Math.ceil(((mid.getTime() - startOfWeek1.getTime()) / 86400000 + 1) / 7);
    return { weekNumber: Math.max(1, Math.min(53, weekNumber)), year };
}
// ─── Per-station OEE computation (multi-column group) ────────────────────────
function computeStationOEE(groupData, plannedHours, canonicalBoardCount, manualQcRate) {
    const { group, exitTimes, boardCountExitTimes, qualityResults } = groupData;
    const def = group.def;
    const IDEAL_CT = 3600 / BOARDS_PER_HOUR; // 7.2 s
    // ── Board count ───────────────────────────────────────────────────────────
    // totalBoards = rows with any non-null exit time across ALL EL variants (union count).
    // This matches the manual methodology which counts EL01 + EL02 boards together.
    // exitTimes (dominant EL + stoppageKeyword) is used only for stoppage/gap detection.
    // producedQty = numerator for this station's Performance calculation:
    //   • SPI (additive): sum of ScreenPrinter count + SPI count (manual methodology)
    //   • All others: this station's own totalBoards (EL01+EL02 union).
    const totalBoards = boardCountExitTimes.filter((t) => t !== null).length;
    const producedQty = def.useAdditiveCount
        ? groupData.subStepCounts.reduce((s, c) => s + c, 0)
        : totalBoards;
    // ── Exit-time sequence for downtime detection ─────────────────────────────
    const validExitTimes = exitTimes
        .filter((t) => t !== null)
        .sort((a, b) => a.getTime() - b.getTime());
    if (validExitTimes.length === 0) {
        const tc = group.qualitySubStep.timeCol;
        const ev = group.qualitySubStep.elVariant;
        return {
            station: def.name, totalBoards: 0, producedQty: 0, passBoards: 0,
            failBoards: 0, testedBoards: 0, firstTimestamp: null, lastTimestamp: null,
            spanHours: 0, actualRunHours: 0, plannedHours, availableHours: 0,
            stoppageCount: 0, stoppageHours: 0,
            microStopCount: 0, microStopHours: 0, tackTimeSec: def.tackTimeSec,
            availability: 0, performance: 0, quality: 1, oee: 0,
            mttr: 0, mtbf: plannedHours,
            idealCycleTimeSec: IDEAL_CT, detectedCycleTimeSec: IDEAL_CT,
            actualCycleTimeSec: IDEAL_CT, timeCol: tc, elVariant: ev,
        };
    }
    const firstTs = validExitTimes[0];
    const lastTs = validExitTimes[validExitTimes.length - 1];
    const spanHours = (lastTs.getTime() - firstTs.getTime()) / 3600000;
    // ── Quality ───────────────────────────────────────────────────────────────
    // TESTRESULT from the designated downstream quality sub-step column
    const passBoards = qualityResults.filter((r, i) => exitTimes[i] !== null && isPass(r) && !isFail(r)).length;
    const failBoards = qualityResults.filter((r, i) => exitTimes[i] !== null && isFail(r)).length;
    const testedBoards = passBoards + failBoards;
    const computedQuality = testedBoards > 0
        ? Math.max(0, Math.min(1, (testedBoards - failBoards) / testedBoards))
        : 1.0;
    // Prefer manualQcRate when explicitly provided; otherwise use TESTRESULT-derived value.
    const quality = (manualQcRate !== undefined && manualQcRate > 0)
        ? manualQcRate
        : computedQuality;
    // ── Inter-exit-time gaps ──────────────────────────────────────────────────
    const allGapsSec = [];
    for (let i = 1; i < validExitTimes.length; i++) {
        const g = (validExitTimes[i].getTime() - validExitTimes[i - 1].getTime()) / 1000;
        if (g > 0)
            allGapsSec.push(g);
    }
    // Diagnostic cycle time (25th-pct) — display only, NOT used in OEE math
    let detectedCycleTimeSec = IDEAL_CT;
    if (allGapsSec.length >= 10) {
        const sorted = [...allGapsSec].sort((a, b) => a - b);
        detectedCycleTimeSec = Math.max(1, sorted[Math.floor(sorted.length * 0.25)]);
    }
    // ── Stoppage detection with tack time subtraction ─────────────────────────
    // Methodology confirmed by Salcomp (meeting May 7, 2026):
    //   Step 1: adjustedGap = rawGap - tackTimeSec  (remove normal cycle time)
    //   Step 2: adjustedGap > 600 s → DOWNTIME (counted against Availability)
    //           0 < adjustedGap ≤ 600 s → MICRO-STOP (performance loss only, NOT downtime)
    //           adjustedGap ≤ 0 → normal production, ignored
    const tackTimeSec = def.tackTimeSec;
    const stopThresholdSec = STOPPAGE_GAP_MINUTES * 60; // 600 s
    let stoppageCount = 0;
    let stoppageHours = 0;
    let microStopCount = 0;
    let microStopHours = 0;
    for (const g of allGapsSec) {
        const adjustedGap = g - tackTimeSec;
        if (adjustedGap > stopThresholdSec) {
            stoppageCount++;
            stoppageHours += adjustedGap / 3600; // FIXED: was (g - IDEAL_CT) / 3600
        }
        else if (adjustedGap > 0) {
            microStopCount++;
            microStopHours += adjustedGap / 3600;
        }
    }
    // ── Availability ─────────────────────────────────────────────────────────
    const availableHours = Math.max(0, plannedHours - stoppageHours);
    const availability = plannedHours > 0
        ? Math.max(0, Math.min(1, availableHours / plannedHours))
        : 0;
    // ── Performance ──────────────────────────────────────────────────────────
    // Expected Parts = Available Time × BOARDS_PER_HOUR
    // Produced Qty   = this station's own count (additive or union)
    const expectedParts = availableHours * BOARDS_PER_HOUR;
    const performance = expectedParts > 0
        ? Math.max(0, Math.min(1, producedQty / expectedParts))
        : (producedQty > 0 ? 1 : 0);
    const oee = availability * performance * quality;
    const mttr = stoppageCount > 0 ? stoppageHours / stoppageCount : 0;
    const mtbf = stoppageCount > 0 ? plannedHours / stoppageCount : plannedHours;
    return {
        station: def.name, totalBoards, producedQty, passBoards, failBoards, testedBoards,
        firstTimestamp: firstTs.toISOString(), lastTimestamp: lastTs.toISOString(),
        spanHours, actualRunHours: spanHours,
        plannedHours, availableHours,
        stoppageCount, stoppageHours,
        microStopCount, microStopHours, tackTimeSec,
        availability, performance, quality, oee,
        mttr, mtbf,
        idealCycleTimeSec: IDEAL_CT, detectedCycleTimeSec,
        actualCycleTimeSec: detectedCycleTimeSec,
        timeCol: group.qualitySubStep.timeCol,
        elVariant: group.qualitySubStep.elVariant,
    };
}
// ─── Main parse function ──────────────────────────────────────────────────────
function parseLineOEEFile(filePath, originalFilename, overrideLine, overrideWeek, overrideYear, manualQcRates // station name → qc rate (0–1)
) {
    const wb = XLSX.readFile(filePath, { cellDates: false, dense: false });
    const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'data')
        ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (rows.length < 2)
        throw new Error('Line file has no data rows');
    const header = rows[0].map((h) => String(h ?? '').trim());
    const dataRows = rows.slice(1);
    // ── Step 1: Resolve station groups (multi-column, dynamic) ───────────────
    const stationGroups = resolveStationGroups(header, dataRows);
    if (stationGroups.length === 0) {
        throw new Error('No recognisable station columns found in file header');
    }
    // Inject manualQcRate from caller (loaded from DB station_quality_settings)
    if (manualQcRates) {
        for (const sg of stationGroups) {
            const rate = manualQcRates[sg.def.name];
            if (rate !== undefined)
                sg.manualQcRate = rate;
        }
    }
    // ── Step 2: Extract per-group exit times ─────────────────────────────────
    const groupDataArr = stationGroups.map((g) => extractGroupData(dataRows, g));
    // ── Step 3: Planned hours (fixed) + canonical board count ───────────────────
    //
    // Always use fixed 120h scheduled week.  The actual first-to-last span varies
    // slightly per file/line due to shift start/end offsets; the manual reference
    // standardises to exactly 120 scheduled hours for all lines and all weeks.
    //
    // canonicalTs is kept for (a) canonicalBoardCount and (b) week/year detection.
    const plannedHours = FALLBACK_PLANNED_HOURS;
    const canonicalGroupData = groupDataArr.find((gd) => gd.group.def.isCanonical)
        ?? groupDataArr.reduce((best, gd) => {
            const count = gd.exitTimes.filter((t) => t !== null).length;
            const bestCount = best.exitTimes.filter((t) => t !== null).length;
            return count > bestCount ? gd : best;
        });
    const canonicalTs = canonicalGroupData.exitTimes
        .filter((t) => t !== null)
        .sort((a, b) => a.getTime() - b.getTime());
    // All stations use the canonical (Lead Height) record count as producedQty
    // (matches the manual's "Produced Qty" column — same value for every station)
    const canonicalBoardCount = canonicalTs.length;
    console.log(`[line-oee-parser] plannedHours: ${plannedHours}h (fixed) | producedQty (canonical): ${canonicalBoardCount}`);
    // ── Step 4: Compute OEE per station group ────────────────────────────────
    // Pass canonicalBoardCount so all stations use the same producedQty
    // (matches manual: same "Produced Qty" value for every station row)
    const stationOEEs = groupDataArr
        .map((gd) => computeStationOEE(gd, plannedHours, canonicalBoardCount, manualQcRates?.[gd.group.def.name] ?? gd.group.manualQcRate))
        .filter((s) => s.totalBoards > 0);
    // ── Step 5: Line OEE = simple unweighted average (matches manual) ─────────
    const n = stationOEEs.length;
    const lineAvailability = n > 0 ? stationOEEs.reduce((s, x) => s + x.availability, 0) / n : 0;
    const linePerformance = n > 0 ? stationOEEs.reduce((s, x) => s + x.performance, 0) / n : 0;
    const lineQuality = n > 0 ? stationOEEs.reduce((s, x) => s + x.quality, 0) / n : 1;
    const lineOEE = n > 0 ? stationOEEs.reduce((s, x) => s + x.oee, 0) / n : 0;
    console.log(`[line-oee-parser] Line OEE: Avail=${(lineAvailability * 100).toFixed(2)}% Perf=${(linePerformance * 100).toFixed(2)}% Qual=${(lineQuality * 100).toFixed(2)}% OEE=${(lineOEE * 100).toFixed(2)}%`);
    // ── Step 6: Week / line detection ────────────────────────────────────────
    const lineName = overrideLine ?? detectLineFromFilename(originalFilename);
    const allTs = groupDataArr.flatMap((gd) => gd.exitTimes.filter((t) => t !== null));
    let weekNumber;
    let year;
    if (overrideWeek) {
        // Use provided week; fall back to timestamp-derived year if year not supplied
        const { year: tsYear } = detectWeekYear(allTs);
        weekNumber = overrideWeek;
        year = overrideYear ?? tsYear;
        console.log(`[line-oee-parser] Using override week: ${weekNumber}, year: ${year}`);
    }
    else {
        const { weekNumber: tsWeek, year: tsYear } = detectWeekYear(allTs);
        const filenameWeek = detectWeekFromFilename(originalFilename);
        console.log(`[line-oee-parser] Week resolution - filename: ${filenameWeek}, timestamp: ${tsWeek}, final: ${filenameWeek ?? tsWeek}`);
        weekNumber = filenameWeek ?? tsWeek;
        year = tsYear;
    }
    allTs.sort((a, b) => a.getTime() - b.getTime());
    return {
        line: lineName,
        weekNumber,
        year,
        filename: originalFilename,
        stations: stationOEEs,
        availability: lineAvailability,
        performance: linePerformance,
        quality: lineQuality,
        oee: lineOEE,
        totalBoardsProduced: canonicalBoardCount,
        plannedHours,
        firstTimestamp: allTs.length > 0 ? allTs[0].toISOString() : null,
        lastTimestamp: allTs.length > 0 ? allTs[allTs.length - 1].toISOString() : null,
    };
}
//# sourceMappingURL=line-oee-parser.js.map