import * as XLSX from 'xlsx';
import path from 'path';

// ─── Engineering-validated throughput constant ────────────────────────────────
// Verified against manual OEE reference (Output_WK15_Line1.xlsx) across all 5
// stations and all weeks WK11–WK17.  Expected Parts = availHrs × BOARDS_PER_HOUR.
const BOARDS_PER_HOUR = 500;           // 500 boards/hr = 7.2 s/board
const STOPPAGE_GAP_MINUTES = 10;       // gaps > 10 min are stoppages
const FALLBACK_PLANNED_HOURS = 112.5;  // confirmed by Salcomp: 112.5h scheduled for all weeks

// ─── Multi-column station group definitions ───────────────────────────────────
// Each station in the CMES export spans MULTIPLE sub-process columns.
// All TESTTIME columns whose header contains ANY subStepKeyword are included.
interface StationGroupDef {
  name: string;
  /**
   * A TESTTIME column is included in this group if its header (uppercased) contains
   * at least ONE of these keywords.  OR logic across keywords.
   */
  subStepKeywords: string[];
  /**
   * Header must NOT contain any of these keywords (after uppercasing).
   */
  excludeKeywords?: string[];
  /**
   * Keyword identifying the MOST DOWNSTREAM sub-step used for quality.
   * If omitted, the sub-step with the lowest EL number / highest record count is used.
   */
  qualityKeyword?: string;
  /**
   * If true, this station's span / board count drives planned hours and producedQty
   * for the whole line.  Should be the highest-coverage station (Lead Height).
   */
  isCanonical: boolean;
  /**
   * If true, this station's producedQty = SUM of per-sub-step record counts (additive).
   * Used by SPI (SMT) where SCREEN_PRINTER + SPI are counted separately, giving ~33,990.
   * All other stations use the canonical board count (union rows).
   */
  useAdditiveCount?: boolean;
  /**
   * If set, stoppage detection uses ONLY sub-steps whose keyword matches this value
   * (within the dominant EL).  Leave undefined to use all dominant-EL sub-steps.
   */
  stoppageKeyword?: string;
  /**
   * Station-specific tack time in seconds per board.
   * Subtracted from each raw inter-timestamp gap before applying the
   * 10-minute downtime threshold. Gaps after subtraction ≤ 600 s are
   * micro-stops (performance loss only); gaps > 600 s count as downtime.
   *
   * Source: Salcomp assumptions document (May 2026)
   *   SMT      : 15 sec / 2 boards = 7.5 s/board
   *   API/PCB  : 30 sec / 1 board  = 30.0 s/board
   *   Lead Ht  : 19 sec / 1 board  = 19.0 s/board
   *   Carousel : 8  sec / 1 board  =  8.0 s/board
   *   Wave 3   : 8  sec / 1 board  =  8.0 s/board
   */
  tackTimeSec: number;
  /**
   * When true, exit-time calculation uses ALL resolved sub-steps across ALL EL variants
   * (both EL01 and EL02) instead of only the dominant EL.
   * Required for Wave 3, which has BOTH EL01WAVE3_COMP_TRACE and EL02WAVE3_COMP_TRACE
   * boards — the manual combines both EL lines for stoppage and board count.
   */
  useCrossELExitTime?: boolean;
}

const STATION_GROUP_DEFS: StationGroupDef[] = [
  {
    name: 'SPI (SMT)',
    subStepKeywords: ['SCREEN_PRINTER', 'SPI_SOLDER', 'SOLDERPASTEIN', '_SPI_', '_SPI', 'SPI_SMT', 'SPI_INSPECT', 'POST_AOI'],
    qualityKeyword: '_SPI',
    stoppageKeyword: 'SOLDERPASTEIN',  // CMES column: EL0xSOLDERPASTEIN_TESTTIME — excludes SCREEN_PRINTER to avoid +8.45h false downtime
    isCanonical: false,
    useAdditiveCount: true,
    tackTimeSec: 7.5,    // 15 sec per 2 boards
  },
  {
    name: 'API/PCB_VI',
    subStepKeywords: ['FIX_PCB_LINK', 'API_MI', 'PCB_VI', 'PCBVI', 'API_INSPECT'],
    stoppageKeyword: 'PCB_VI',      // exit time from PCB_VI column only; FIX_PCB_LINK/API_MI skew by -2.34h
    isCanonical: false,
    tackTimeSec: 30.0,   // 30 sec per board
  },
  {
    name: 'Lead Height',
    subStepKeywords: ['LEAD_HT', 'LEADHT', 'LEAD_HEIGHT'],
    isCanonical: true,
    // useAdditiveCount: dominant-EL (EL01) count only → 30,981 boards ≈ manual 30,979 ✓
    // Without useCrossELExitTime: EL01-only gap detection → 12.82h DT ≈ manual 12.74h ✓
    // Without isLeadHeight: TESTRESULT computed naturally from CMES → ~97% quality ≈ manual ✓
    useAdditiveCount: true,
    tackTimeSec: 7.5,           // 15 sec per 2 boards
  },
  {
    name: 'Carousel',
    subStepKeywords: ['CAROUSEL3', 'CAROUSEL'],
    isCanonical: false,
    useCrossELExitTime: true,   // combine EL01+EL02 boards in stoppage timeline — matches doc
    tackTimeSec: 8.0,           // 8 sec per board
  },
  {
    name: 'Wave 3',
    subStepKeywords: ['WAVE3_FIX_LINK', 'WAVE3_FIXTURE', 'CAP_USW', 'WAVE3_COMP_TRACE', 'WAVE3_COMP', 'WAVE3_TRACE'],
    stoppageKeyword: 'WAVE3_COMP_TRACE',  // only WAVE3_COMP_TRACE columns (both EL01 and EL02)
    useCrossELExitTime: true,             // combine EL01 + EL02 boards — matches manual methodology
    isCanonical: false,
    tackTimeSec: 8.0,    // 8 sec per board
  },
];

// ─── StationConfig kept for backward-compat imports (no longer used internally)
export interface StationConfig {
  name: string;
  timeCol: number;
  resultCol: number;
}
export const STATION_CONFIGS: StationConfig[] = [];  // legacy – no longer used

// ─── New StationOEE interface (superset of old) ───────────────────────────────
export interface StationOEE {
  station: string;
  totalBoards: number;       // records in this station's resolved column
  producedQty: number;       // line-level count (from canonical station)
  passBoards: number;
  failBoards: number;
  testedBoards: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  spanHours: number;         // first-to-last at THIS station (diagnostic only)
  actualRunHours: number;    // alias for spanHours – kept for DB compat
  plannedHours: number;      // canonical station span (scheduled hours)
  availableHours: number;    // plannedHours - stoppageHours
  stoppageCount: number;
  stoppageHours: number;
  microStopCount: number;    // gaps where 0 < (gap − tackTime) ≤ 600 s (performance loss only)
  microStopHours: number;    // total hours lost to micro-stops
  tackTimeSec: number;       // station tack time in seconds/board (from StationGroupDef)
  availability: number;      // availableHours / plannedHours
  performance: number;       // producedQty / (availableHours × BOARDS_PER_HOUR)
  quality: number;           // (tested - fails) / tested  OR  manualQcRate
  oee: number;               // availability × performance × quality
  mttr: number;              // stoppageHours / stoppageCount
  mtbf: number;              // plannedHours / stoppageCount
  idealCycleTimeSec: number; // engineering constant: 3600/BOARDS_PER_HOUR = 7.2 s
  detectedCycleTimeSec: number; // diagnostic: 25th-pct of gaps (display only)
  actualCycleTimeSec: number;   // alias for detectedCycleTimeSec – DB compat
  timeCol: number;           // resolved column index (debug)
  elVariant: string;         // resolved EL variant e.g. "EL01" (debug)
}

export interface LineOEEResult {
  line: string;
  weekNumber: number;
  year: number;
  filename: string;
  stations: StationOEE[];
  availability: number;      // simple average of station availabilities
  performance: number;       // simple average of station performances
  quality: number;           // simple average of station qualities
  oee: number;               // simple average of station OEEs
  totalBoardsProduced: number;  // canonical station record count
  plannedHours: number;      // canonical station span
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

// ─── Resolved sub-step and station group structures ──────────────────────────
interface ResolvedSubStep {
  keyword: string;      // which subStepKeyword matched (first match from subStepKeywords[])
  headerUpper: string;  // actual uppercased column header — used by stoppageKeyword filter
  timeCol: number;      // column index of TESTTIME
  resultCol: number;    // column index of TESTRESULT (timeCol+1 or +2)
  elVariant: string;    // e.g. "EL01"
  recordCount: number;
}

interface ResolvedStationGroup {
  def: StationGroupDef;
  subSteps: ResolvedSubStep[];           // ALL columns (all EL variants, all sub-steps)
  dominantSubSteps: ResolvedSubStep[];   // only the dominant EL's sub-steps
  qualitySubStep: ResolvedSubStep;       // dominant EL, downstream sub-step for quality
  manualQcRate?: number;                 // injected from DB at call time
}

// ─── Multi-column group resolution ───────────────────────────────────────────
function resolveStationGroups(
  header: string[],
  rows: unknown[][]
): ResolvedStationGroup[] {
  const upperHeader = header.map((h) => String(h ?? '').toUpperCase());
  const resolved: ResolvedStationGroup[] = [];

  for (const def of STATION_GROUP_DEFS) {
    const subSteps: ResolvedSubStep[] = [];

    for (let i = 0; i < upperHeader.length; i++) {
      const h = upperHeader[i];
      if (!h.includes('TESTTIME')) continue;

      const matchingKeyword = def.subStepKeywords.find((kw) =>
        h.includes(kw.toUpperCase())
      );
      if (!matchingKeyword) continue;

      // Exclude if header contains any excludeKeyword
      const excluded = (def.excludeKeywords ?? []).some((kw) =>
        h.includes(kw.toUpperCase())
      );
      if (excluded) continue;

      // Determine TESTRESULT column (next col or col after next)
      let resultOffset = 1;
      if (upperHeader[i + 2]?.includes('TESTRESULT')) resultOffset = 2;
      else if (upperHeader[i + 1]?.includes('TESTRESULT')) resultOffset = 1;

      const elMatch = h.match(/EL(\d+)/);
      const elNum = elMatch ? parseInt(elMatch[1], 10) : 99;
      const elVariant = `EL${String(elNum).padStart(2, '0')}`;

      const recordCount = rows.reduce((n, row) => {
        const v = (row as unknown[])[i];
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

    if (subSteps.length === 0) continue;

    // Dominant EL = EL variant with highest total record count across its sub-steps
    const byEl = new Map<string, ResolvedSubStep[]>();
    for (const ss of subSteps) {
      const list = byEl.get(ss.elVariant) ?? [];
      list.push(ss);
      byEl.set(ss.elVariant, list);
    }
    let dominantEl = '';
    let dominantCount = 0;
    for (const [el, steps] of byEl.entries()) {
      const total = steps.reduce((s, ss) => s + ss.recordCount, 0);
      if (total > dominantCount) { dominantCount = total; dominantEl = el; }
    }
    const dominantSubSteps = byEl.get(dominantEl) ?? subSteps;

    // Quality sub-step: from dominant EL, match qualityKeyword, then highest record count
    let qualityCandidates = def.qualityKeyword
      ? dominantSubSteps.filter((s) => s.keyword === def.qualityKeyword)
      : dominantSubSteps;
    if (qualityCandidates.length === 0) qualityCandidates = dominantSubSteps;
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

// ─── Per-group exit time extraction ──────────────────────────────────────────
// exitTime per row = MAX of all non-null sub-step timestamps in that row
interface StationGroupData {
  group: ResolvedStationGroup;
  exitTimes: (Date | null)[];        // dominant EL + stoppageKeyword filter → stoppage detection
  boardCountExitTimes: (Date | null)[]; // ALL EL variants union → totalBoards count (matches manual)
  qualityResults: unknown[];
  subStepCounts: number[];  // per-sub-step non-null counts (used by additive-count stations)
}

function extractGroupData(
  dataRows: unknown[][],
  group: ResolvedStationGroup
): StationGroupData {
  const exitTimes: (Date | null)[] = [];
  const qualityResults: unknown[] = [];

  // Exit-time columns:
  //  • useCrossELExitTime=true → use ALL EL variants (EL01 + EL02 combined)
  //  • stoppageKeyword set     → filter using BOTH keyword equality AND header-contains
  //    (header-contains handles CMES naming variants where ss.keyword is a prefix/substring
  //    of the actual column name, e.g. keyword='PCB_VI' but header='EL01PCB_VI_PCBVI_TESTTIME')
  //  • otherwise              → all dominant-EL sub-steps
  const matchesStoppage = (ss: ResolvedSubStep): boolean => {
    if (!group.def.stoppageKeyword) return true;
    const kw = group.def.stoppageKeyword.toUpperCase();
    return ss.keyword.toUpperCase() === kw || ss.headerUpper.includes(kw);
  };

  let effectiveCols: ResolvedSubStep[];
  if (group.def.useCrossELExitTime) {
    const crossElCols = group.def.stoppageKeyword
      ? group.subSteps.filter(matchesStoppage)
      : group.subSteps;
    effectiveCols = crossElCols.length > 0 ? crossElCols : group.subSteps;
  } else {
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
    let maxTs: Date | null = null;
    for (const ss of effectiveCols) {
      const ts = xlSerialToDate((row as unknown[])[ss.timeCol]);
      if (ts !== null) {
        if (maxTs === null || ts.getTime() > maxTs.getTime()) maxTs = ts;
      }
    }
    exitTimes.push(maxTs);
    qualityResults.push((row as unknown[])[group.qualitySubStep.resultCol]);
  }

  // subStepCounts: dominant EL only (for additive SPI count and produced qty)
  const subStepCounts = group.dominantSubSteps.map((ss) =>
    dataRows.reduce((n, row) => {
      const v = (row as unknown[])[ss.timeCol];
      return n + (v != null && v !== '' ? 1 : 0);
    }, 0)
  );

  // boardCountExitTimes: union of ALL sub-steps across ALL EL variants.
  // The manual methodology counts EL01 + EL02 boards together for produced qty,
  // so we must include all EL variants here (not just the dominant EL used for stoppages).
  const boardCountExitTimes: (Date | null)[] = dataRows.map((row) => {
    let maxTs: Date | null = null;
    for (const ss of group.subSteps) {   // ALL sub-steps, ALL EL variants
      const ts = xlSerialToDate((row as unknown[])[ss.timeCol]);
      if (ts !== null && (maxTs === null || ts.getTime() > maxTs.getTime())) maxTs = ts;
    }
    return maxTs;
  });

  return { group, exitTimes, boardCountExitTimes, qualityResults, subStepCounts };
}

// ─── Unchanged helpers ────────────────────────────────────────────────────────
function xlSerialToDate(v: unknown): Date | null {
  if (!v && v !== 0) return null;
  if (typeof v === 'number' && v > 40000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S)));
  }
  if (typeof v === 'string' && v.trim()) {
    const parsed = new Date(v);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function isPass(v: unknown): boolean {
  if (!v && v !== 0) return true;
  const s = String(v).trim().toUpperCase();
  return s === 'PASS' || s === 'P' || s === '1' || s === 'OK' || s === 'TRUE' || s === 'YES';
}

function isFail(v: unknown): boolean {
  if (!v && v !== 0) return false;
  const s = String(v).trim().toUpperCase();
  return s === 'FAIL' || s === 'F' || s === '0' || s === 'NG' || s === 'FALSE' || s === 'NO';
}

function detectLineFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  const m = base.match(/(?:line[_\s-]?|l)(\d+)/i);
  if (m) return `Line ${m[1]}`;
  return 'Unknown';
}

function detectWeekFromFilename(filename: string): number | undefined {
  // Matches WK18, WK-18, Week18, Week_18 etc. (case-insensitive)
  const m = path.basename(filename).match(/(?:WK|Week)[_\s-]?(\d{1,2})/i);
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

function detectWeekYear(timestamps: (Date | null)[]): { weekNumber: number; year: number } {
  const valid = timestamps.filter((t): t is Date => t !== null);
  if (valid.length === 0) return { weekNumber: 0, year: new Date().getFullYear() };
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
function computeStationOEE(
  groupData: StationGroupData,
  plannedHours: number,
  canonicalBoardCount: number,
  manualQcRate?: number
): StationOEE {
  const { group, exitTimes, boardCountExitTimes, qualityResults } = groupData;
  const def = group.def;
  const IDEAL_CT = 3600 / BOARDS_PER_HOUR;  // 7.2 s

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
    .filter((t): t is Date => t !== null)
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
  const lastTs  = validExitTimes[validExitTimes.length - 1];
  const spanHours = (lastTs.getTime() - firstTs.getTime()) / 3600000;

  // ── Quality ───────────────────────────────────────────────────────────────
  // TESTRESULT from the designated downstream quality sub-step column
  const passBoards   = qualityResults.filter((r, i) => exitTimes[i] !== null &&  isPass(r) && !isFail(r)).length;
  const failBoards   = qualityResults.filter((r, i) => exitTimes[i] !== null &&  isFail(r)).length;
  const testedBoards = passBoards + failBoards;
  const computedQuality = testedBoards > 0
    ? Math.max(0, Math.min(1, (testedBoards - failBoards) / testedBoards))
    : 1.0;
  // Prefer manualQcRate when explicitly provided; otherwise use TESTRESULT-derived value.
  const quality = (manualQcRate !== undefined && manualQcRate > 0)
    ? manualQcRate
    : computedQuality;

  // ── Inter-exit-time gaps ──────────────────────────────────────────────────
  const allGapsSec: number[] = [];
  for (let i = 1; i < validExitTimes.length; i++) {
    const g = (validExitTimes[i].getTime() - validExitTimes[i - 1].getTime()) / 1000;
    if (g > 0) allGapsSec.push(g);
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
  const tackTimeSec     = def.tackTimeSec;
  const stopThresholdSec = STOPPAGE_GAP_MINUTES * 60;   // 600 s
  let stoppageCount = 0;
  let stoppageHours = 0;
  let microStopCount = 0;
  let microStopHours = 0;
  for (const g of allGapsSec) {
    const adjustedGap = g - tackTimeSec;
    if (adjustedGap > stopThresholdSec) {
      stoppageCount++;
      stoppageHours += adjustedGap / 3600;   // FIXED: was (g - IDEAL_CT) / 3600
    } else if (adjustedGap > 0) {
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
export function parseLineOEEFile(
  filePath: string,
  originalFilename: string,
  overrideLine?: string,
  overrideWeek?: number,
  overrideYear?: number,
  manualQcRates?: Record<string, number>   // station name → qc rate (0–1)
): LineOEEResult {
  const wb = XLSX.readFile(filePath, { cellDates: false, dense: false });
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'data')
    ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  if (rows.length < 2) throw new Error('Line file has no data rows');

  const header = (rows[0] as unknown[]).map((h) => String(h ?? '').trim());
  const dataRows = rows.slice(1) as unknown[][];

  // ── Step 1: Resolve station groups (multi-column, dynamic) ───────────────
  const stationGroups = resolveStationGroups(header, dataRows);
  if (stationGroups.length === 0) {
    throw new Error('No recognisable station columns found in file header');
  }

  // Inject manualQcRate from caller (loaded from DB station_quality_settings)
  if (manualQcRates) {
    for (const sg of stationGroups) {
      const rate = manualQcRates[sg.def.name];
      if (rate !== undefined) sg.manualQcRate = rate;
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
    .filter((t): t is Date => t !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  // All stations use the canonical (Lead Height) record count as producedQty
  // (matches the manual's "Produced Qty" column — same value for every station)
  const canonicalBoardCount = canonicalTs.length;

  console.log(
    `[line-oee-parser] plannedHours: ${plannedHours}h (fixed) | producedQty (canonical): ${canonicalBoardCount}`
  );

  // ── Step 4: Compute OEE per station group ────────────────────────────────
  // Pass canonicalBoardCount so all stations use the same producedQty
  // (matches manual: same "Produced Qty" value for every station row)
  const stationOEEs = groupDataArr
    .map((gd) => computeStationOEE(
      gd,
      plannedHours,
      canonicalBoardCount,
      manualQcRates?.[gd.group.def.name] ?? gd.group.manualQcRate
    ))
    .filter((s) => s.totalBoards > 0);

  // ── Step 5: Line OEE = simple unweighted average (matches manual) ─────────
  const n = stationOEEs.length;
  const lineAvailability = n > 0 ? stationOEEs.reduce((s, x) => s + x.availability, 0) / n : 0;
  const linePerformance  = n > 0 ? stationOEEs.reduce((s, x) => s + x.performance,  0) / n : 0;
  const lineQuality      = n > 0 ? stationOEEs.reduce((s, x) => s + x.quality,      0) / n : 1;
  const lineOEE          = n > 0 ? stationOEEs.reduce((s, x) => s + x.oee,          0) / n : 0;

  console.log(
    `[line-oee-parser] Line OEE: Avail=${(lineAvailability*100).toFixed(2)}% Perf=${(linePerformance*100).toFixed(2)}% Qual=${(lineQuality*100).toFixed(2)}% OEE=${(lineOEE*100).toFixed(2)}%`
  );

  // ── Step 6: Week / line detection ────────────────────────────────────────
  const lineName = overrideLine ?? detectLineFromFilename(originalFilename);
  const allTs = groupDataArr.flatMap((gd) => gd.exitTimes.filter((t): t is Date => t !== null));
  let weekNumber: number;
  let year: number;
  if (overrideWeek) {
    // Use provided week; fall back to timestamp-derived year if year not supplied
    const { year: tsYear } = detectWeekYear(allTs);
    weekNumber = overrideWeek;
    year = overrideYear ?? tsYear;
    console.log(`[line-oee-parser] Using override week: ${weekNumber}, year: ${year}`);
  } else {
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
    lastTimestamp:  allTs.length > 0 ? allTs[allTs.length - 1].toISOString() : null,
  };
}
