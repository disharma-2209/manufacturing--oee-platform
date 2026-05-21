import * as XLSX from 'xlsx';
import path from 'path';
import { RawIncident } from '../types';

const LINE_MAP: Record<string, string> = {
  'PRDLN-00': 'Line 1',
  'PRDLN-02': 'Line 2',
  'PRDLN-03': 'Line 3',
  'PRDLN-04': 'Line 4',
  'PRDLN-05': 'Line 5',
  'PRDLN-06': 'Line 6',
  'PRDLN-07': 'Line 7',
  'PRDLN-R04': 'Line R4',
};

function timeStringToHours(timeStr: string | number | undefined): number {
  if (!timeStr) return 0;
  if (typeof timeStr === 'number') {
    return timeStr * 24;
  }
  const str = String(timeStr).trim();
  const parts = str.split(':');
  if (parts.length === 3) {
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h + m / 60 + s / 3600;
  }
  return 0;
}

function parseExcelDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const d = new Date(Date.UTC(date.y, date.m - 1, date.d, date.H, date.M, date.S));
      return d.toISOString();
    }
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function deriveShift(reportTime: string | null): string {
  if (!reportTime) return 'Unknown';
  const d = new Date(reportTime);
  const hour = d.getHours();
  if (hour >= 6 && hour < 14) return 'Morning';
  if (hour >= 14 && hour < 22) return 'Afternoon';
  return 'Night';
}

function getWeekNumber(dateStr: string | null): { week: number; year: number } {
  if (!dateStr) return { week: 0, year: new Date().getFullYear() };
  const d = new Date(dateStr);
  // ISO 8601: week starts Monday, week 1 = week containing first Thursday.
  // Anchor on the Thursday of the same week as `d`, then find which week of
  // that Thursday's year it falls in.
  const dayOfWeek = d.getUTCDay() || 7; // Sun=7, Mon=1 … Sat=6
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - dayOfWeek));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: thursday.getUTCFullYear() };
}

export interface ParsedExcelData {
  incidents: Omit<RawIncident, 'id' | 'upload_id' | 'is_repeat_failure' | 'is_cascade'>[];
  metadata: {
    recordCount: number;
    linesDetected: string[];
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
    weekNumber: number;
    year: number;
    sheets: string[];
  };
}

// Standard root cause categories — specific named buckets, no catch-all "GT" or "Others"
// Order matters: more specific rules first
const ROOT_CAUSE_RULES: Array<{ keywords: string[]; category: string; cause: string }> = [
  // ── SMT ──────────────────────────────────────────────────────────────────────
  { keywords: ['solder paste', 'stencil', 'squeegee', 'paste print', 'misprint', 'paste bridging', 'paste volume'], category: 'SMT', cause: 'Solder paste / stencil issue' },
  { keywords: ['reflow', 'reflow oven', 'soldering profile', 'thermal profile', 'heating zone', 'conveyor speed reflow'], category: 'SMT', cause: 'Reflow oven issue' },
  { keywords: ['pick and place', 'pick & place', 'p&p', 'nozzle', 'feeder jam', 'feeder error', 'component placement', 'misplace', 'missed component'], category: 'SMT', cause: 'Pick & Place issue' },
  { keywords: ['smt', 'surface mount', 'screen printer'], category: 'SMT', cause: 'SMT process issue' },
  // ── Wave Solder ──────────────────────────────────────────────────────────────
  { keywords: ['wave solder', 'wave soldering', 'solder pot', 'flux level', 'flux density', 'solder wave', 'dross', 'finger conveyor'], category: 'Wave Solder', cause: 'Wave solder issue' },
  { keywords: ['wave', 'selective solder', 'thru hole solder'], category: 'Wave Solder', cause: 'Wave solder issue' },
  // ── ICT ───────────────────────────────────────────────────────────────────────
  { keywords: ['ict', 'in-circuit test', 'in circuit test', 'bed of nails', 'ict fixture', 'ict probe', 'bed-of-nails'], category: 'ICT', cause: 'ICT test failure' },
  // ── FT ────────────────────────────────────────────────────────────────────────
  { keywords: ['functional test', 'function test', 'ft station', 'ft fail', 'functional fail', 'test fail', 'testing fail', 'board test fail'], category: 'FT', cause: 'Functional test failure' },
  // ── AOI ───────────────────────────────────────────────────────────────────────
  { keywords: ['aoi', 'automated optical', 'optical inspection', 'vision system', 'camera inspection', 'x-ray', 'xray', 'spi'], category: 'AOI', cause: 'AOI inspection failure' },
  // ── API ───────────────────────────────────────────────────────────────────────
  { keywords: ['api', 'auto insertion', 'axial insertion', 'radial insertion', 'through hole insertion', 'thru hole insertion', 'dip insertion'], category: 'API', cause: 'API insertion issue' },
  // ── Carousel / Conveyor ───────────────────────────────────────────────────────
  { keywords: ['carousel', 'conveyor', 'belt conveyor', 'transport belt', 'board transfer', 'indexer', 'chain conveyor', 'loader', 'unloader', 'magazine'], category: 'Carousel', cause: 'Conveyor / transport issue' },
  // ── HT ────────────────────────────────────────────────────────────────────────
  { keywords: ['hi-pot', 'hipot', 'high potential', 'high voltage test', 'dielectric', 'ht test', 'hi pot'], category: 'HT', cause: 'HT test failure' },
  // ── QLY (Quality) ─────────────────────────────────────────────────────────────
  { keywords: ['quality', 'defect', 'cosmetic defect', 'reject', 'scrap', 'rework', 'qlty', 'qly', 'cosmetic', 'soldering defect', 'tombstone', 'bridging', 'open circuit defect', 'cold joint'], category: 'QLY', cause: 'Quality defect' },
  // ── Changeover ────────────────────────────────────────────────────────────────
  { keywords: ['changeover', 'change over', 'model change', 'product change', 'tooling change', 'format change', 'line change', 'changeover time', 'setup time'], category: 'Changeover', cause: 'Changeover / setup' },
  { keywords: ['setup', 'set up', 'set-up', 'initial setup', 'machine setup', 'program change'], category: 'Changeover', cause: 'Setup / programming change' },
  // ── Mechanical ────────────────────────────────────────────────────────────────
  { keywords: ['mechanical', 'mechanical failure', 'worn part', 'worn out', 'broken part', 'part broken', 'jam', 'jammed', 'stuck', 'gear', 'bearing', 'motor fail', 'spindle', 'actuator', 'pneumatic', 'cylinder', 'spring', 'belt wear', 'chain break', 'coupling'], category: 'Mechanical', cause: 'Mechanical failure' },
  // ── Electrical ────────────────────────────────────────────────────────────────
  { keywords: ['electrical', 'electrical failure', 'power fail', 'power loss', 'voltage drop', 'voltage fault', 'current fault', 'short circuit', 'wiring fault', 'connector fault', 'cable fault', 'fuse', 'relay', 'breaker', 'power supply', 'inverter', 'servo drive', 'electric'], category: 'Electrical', cause: 'Electrical failure' },
  // ── Software / Controls ───────────────────────────────────────────────────────
  { keywords: ['software', 'firmware', 'program error', 'error code', 'alarm', 'plc', 'controller fault', 'communication error', 'network', 'ethernet', 'robot program', 'parameter', 'configuration', 'hmi', 'scada', 'system crash', 'software hang'], category: 'Software/Controls', cause: 'Software / controls issue' },
  // ── Material / Supply ─────────────────────────────────────────────────────────
  { keywords: ['no material', 'material shortage', 'component shortage', 'waiting material', 'parts shortage', 'supply shortage', 'out of stock', 'material delay', 'feeder empty', 'component run out', 'bom shortage'], category: 'Material', cause: 'Material / component shortage' },
  // ── Planned Maintenance ───────────────────────────────────────────────────────
  { keywords: ['preventive maintenance', 'planned maintenance', 'pm activity', 'scheduled maintenance', 'maintenance window', 'lubrication', 'calibration', 'periodic service', 'pm schedule'], category: 'Planned Maint.', cause: 'Planned maintenance' },
  // ── Operator / Human Error ────────────────────────────────────────────────────
  { keywords: ['operator error', 'human error', 'mishandle', 'accident', 'dropped', 'wrong setting', 'wrong program', 'operator mistake', 'wrong product', 'incorrect setup', 'mis-load', 'misload'], category: 'Operator Error', cause: 'Operator / human error' },
  // ── Unplanned Downtime (catch-last before true fallback) ──────────────────────
  { keywords: ['breakdown', 'machine down', 'unplanned', 'unexpected stop', 'sudden stop', 'line stop', 'halt', 'fault'], category: 'Mechanical', cause: 'Unplanned breakdown' },
];

// Categories that are too vague and must be re-derived from text
const VAGUE_CATEGORIES = new Set(['gt', 'unknown', 'others', 'other', 'n/a', 'na', 'misc', 'miscellaneous', 'unclassified', '']);

export function deriveRootCauseCategory(
  causeCategory: string,
  cause: string,
  remarks: string,
  repairDescription: string
): { category: string; cause: string } {
  const catNorm = causeCategory.toLowerCase().trim();
  const causeNorm = cause.toLowerCase().trim();
  const isVagueCategory = VAGUE_CATEGORIES.has(catNorm);
  const isVagueCause = VAGUE_CATEGORIES.has(causeNorm) || !cause;

  // If both are specific (non-vague), return as-is
  if (!isVagueCategory && !isVagueCause) {
    return { category: causeCategory, cause };
  }

  // Combine all available text for keyword matching (include category/cause too in case they have useful info)
  const text = [causeCategory, cause, remarks, repairDescription]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s&/\-+.]/g, ' ');

  for (const rule of ROOT_CAUSE_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return {
        category: isVagueCategory ? rule.category : causeCategory,
        cause: isVagueCause ? rule.cause : cause,
      };
    }
  }

  // Category is specific but cause is vague — derive cause from category
  if (!isVagueCategory) {
    return { category: causeCategory, cause: `${causeCategory} failure` };
  }

  // Everything is vague — use remarks/repair text as the cause, assign Mechanical as safest specific category
  const fallbackCause = (remarks?.trim() || repairDescription?.trim() || 'Unclassified failure').slice(0, 80);
  return {
    category: 'Mechanical',
    cause: fallbackCause,
  };
}

function getCol(row: Record<string, unknown>, ...keys: string[]): unknown {
  const rowLower: Record<string, unknown> = {};
  for (const k of Object.keys(row)) rowLower[k.toLowerCase().trim().replace(/\s+/g, ' ')] = row[k];
  for (const key of keys) {
    const val = rowLower[key.toLowerCase().trim().replace(/\s+/g, ' ')];
    if (val !== null && val !== undefined && val !== '') return val;
  }
  return null;
}

export function parseExcelFile(filePath: string): ParsedExcelData {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const sheets = workbook.SheetNames;

  const rawSheetName = sheets.find((s) =>
    s.toLowerCase().includes('raw') || s.toLowerCase().includes('data') || s.toLowerCase().includes('incident')
  ) || sheets[0];
  const rawSheet = workbook.Sheets[rawSheetName];
  const rawData = XLSX.utils.sheet_to_json(rawSheet, { defval: null }) as Record<string, unknown>[];

  if (rawData.length === 0) {
    throw new Error(`No data rows found in sheet "${rawSheetName}". Ensure the first row contains column headers.`);
  }

  const incidents: ParsedExcelData['incidents'] = [];
  const linesSet = new Set<string>();
  const dates: Date[] = [];

  for (const row of rawData) {
    const lineRaw = String(
      getCol(row, 'line', 'LINE', 'production line', 'prod line', 'line no', 'line_no') || ''
    ).trim();
    const line = LINE_MAP[lineRaw] || lineRaw || 'Unknown';

    const reportTime = parseExcelDate(
      getCol(row, 'report time', 'REPORT TIME', 'report_time', 'reporttime', 'reported time', 'date reported', 'date/time', 'datetime', 'timestamp', 'date')
    );
    const dtAckTime = parseExcelDate(
      getCol(row, 'dt ack time', 'DT ACK TIME', 'ack time', 'acknowledged time', 'dt_ack_time')
    );
    const completedTime = parseExcelDate(
      getCol(row, 'completed time', 'COMPLETED TIME', 'completed_time', 'completion time', 'date completed')
    );
    const endTime = parseExcelDate(
      getCol(row, 'end time', 'END TIME', 'end_time', 'endtime', 'resolved time')
    );

    const durationHours = timeStringToHours(
      getCol(row, 'duration', 'DURATION', 'duration (hrs)', 'duration(hrs)', 'downtime duration', 'downtime hours', 'dt duration', 'hours') as string | number | undefined
    );
    const responseHours = timeStringToHours(
      getCol(row, 'response time', 'RESPONSE TIME', 'response_time', 'response time (hrs)') as string | number | undefined
    );
    const resolutionHours = timeStringToHours(
      getCol(row, 'resolution time', 'RESOLUTION TIME', 'resolution_time', 'resolution time (hrs)') as string | number | undefined
    );

    const { week, year } = getWeekNumber(reportTime);
    const shift = String(
      getCol(row, 'shift', 'SHIFT', 'shift name') || deriveShift(reportTime)
    ).trim() || deriveShift(reportTime);

    if (line && line !== 'Unknown') linesSet.add(line);
    if (reportTime) {
      const d = new Date(reportTime);
      if (!isNaN(d.getTime())) dates.push(d);
    }

    const rawCauseCategory = String(
      getCol(row, 'cause category', 'CAUSE CATEGORY', 'category', 'failure category', 'fault category', 'downtime category', 'dt category', 'root cause category') || ''
    ).trim();
    const rawCause = String(
      getCol(row, 'cause', 'CAUSE', 'root cause', 'failure cause', 'fault', 'reason', 'description', 'failure description') || ''
    ).trim();
    const rawRemarks = String(getCol(row, 'remarks', 'REMARKS', 'comments', 'notes', 'remark') || '').trim();
    const rawRepair = String(getCol(row, 'repair description', 'REPAIR DESCRIPTION', 'repair', 'action taken', 'corrective action', 'fix description') || '').trim();

    const derived = deriveRootCauseCategory(rawCauseCategory, rawCause, rawRemarks, rawRepair);

    const equipment = String(
      getCol(row, 'equipment', 'EQUIPMENT', 'machine', 'asset', 'equipment name', 'machine name', 'asset name') || ''
    ).trim();

    // Station: explicit column first, then fall back to equipment name (equipment IS the station in SMT lines)
    const station = String(
      getCol(row, 'station', 'STATION', 'station name', 'work station', 'workstation', 'work center', 'workcenter', 'wc', 'process station', 'sub station') || equipment
    ).trim();

    incidents.push({
      line,
      equipment,
      status: String(
        getCol(row, 'status', 'STATUS', 'incident status', 'state') || 'CLOSED'
      ).trim(),
      cause_category: derived.category,
      cause: derived.cause,
      product_code: String(
        getCol(row, 'product code', 'PRODUCT CODE', 'product', 'part number', 'part no', 'sku', 'model') || ''
      ).trim(),
      team: String(
        getCol(row, 'team', 'TEAM', 'responsible team', 'maintenance team', 'dept', 'department') || ''
      ).trim(),
      remarks: String(
        getCol(row, 'remarks', 'REMARKS', 'comments', 'notes', 'remark') || ''
      ).trim(),
      repair_description: String(
        getCol(row, 'repair description', 'REPAIR DESCRIPTION', 'repair', 'action taken', 'corrective action', 'fix description') || ''
      ).trim(),
      report_time: reportTime || '',
      report_by: String(
        getCol(row, 'report by', 'REPORT BY', 'reported by', 'reporter', 'operator', 'raised by') || ''
      ).trim(),
      dt_ack_time: dtAckTime || '',
      dt_ack_by: String(
        getCol(row, 'dt ack by', 'DT ACK BY', 'acknowledged by', 'ack by') || ''
      ).trim(),
      completed_time: completedTime || '',
      complete_by: String(
        getCol(row, 'complete by', 'COMPLETE BY', 'completed by', 'resolved by', 'closed by') || ''
      ).trim(),
      end_time: endTime || '',
      duration_hours: durationHours,
      response_time_hours: responseHours,
      resolution_time_hours: resolutionHours,
      week_number: week,
      year,
      shift,
      station,
    });
  }

  dates.sort((a, b) => a.getTime() - b.getTime());

  const weekNumbers = incidents.map((i) => i.week_number).filter((w) => w > 0);
  const dominantWeek = weekNumbers.length > 0
    ? weekNumbers.sort((a, b) =>
        weekNumbers.filter(v => v === b).length - weekNumbers.filter(v => v === a).length
      )[0]
    : 0;
  const dominantYear = incidents.find((i) => i.week_number === dominantWeek)?.year || new Date().getFullYear();

  return {
    incidents,
    metadata: {
      recordCount: incidents.length,
      linesDetected: Array.from(linesSet),
      dateRangeStart: dates.length > 0 ? dates[0].toISOString() : null,
      dateRangeEnd: dates.length > 0 ? dates[dates.length - 1].toISOString() : null,
      weekNumber: dominantWeek,
      year: dominantYear,
      sheets,
    },
  };
}

export function generateMockData(): ParsedExcelData {
  const lines = ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5', 'Line 6'];
  const categories = ['SMT', 'Mechanical', 'Electrical', 'Wave Solder', 'API', 'FT', 'ICT', 'Carousel', 'QLY', 'Changeover', 'HT', 'Software/Controls', 'Material', 'Operator Error'];
  const equipment = ['Printer', 'Pick & Place', 'Reflow Oven', 'Wave Solder', 'AOI', 'ICT Tester', 'FT Station', 'Conveyor'];
  const teams = ['TE', 'EM', '01-PROD', 'ME', 'PE'];
  const products = ['INV-2000', 'INV-3800', 'BAT-5000', 'MIC-250', 'ENS-IQ7'];

  const incidents: ParsedExcelData['incidents'] = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - 21);

  for (let week = 0; week < 3; week++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + week * 7);

    for (let d = 0; d < 5; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);

      const incidentsPerDay = Math.floor(Math.random() * 8) + 3;
      for (let i = 0; i < incidentsPerDay; i++) {
        const line = lines[Math.floor(Math.random() * lines.length)];
        const cat = categories[Math.floor(Math.random() * categories.length)];
        const equip = equipment[Math.floor(Math.random() * equipment.length)];
        const team = teams[Math.floor(Math.random() * teams.length)];
        const product = products[Math.floor(Math.random() * products.length)];

        const reportHour = Math.floor(Math.random() * 24);
        const reportTime = new Date(day);
        reportTime.setHours(reportHour, Math.floor(Math.random() * 60), 0, 0);

        const responseMins = Math.random() * 30;
        const resolutionMins = Math.random() * 180 + 10;
        const durationMins = responseMins + resolutionMins;

        const ackTime = new Date(reportTime.getTime() + responseMins * 60000);
        const completedTime = new Date(reportTime.getTime() + durationMins * 60000);

        const { week: weekNum, year } = getWeekNumber(reportTime.toISOString());
        const shift = deriveShift(reportTime.toISOString());

        incidents.push({
          line,
          equipment: equip,
          status: Math.random() > 0.1 ? 'CLOSED' : 'COMPLETED',
          cause_category: cat,
          cause: `${cat} failure on ${equip}`,
          product_code: product,
          team,
          remarks: `Mock incident on ${line}`,
          repair_description: `Repaired ${equip} by ${team} team`,
          report_time: reportTime.toISOString(),
          report_by: `Operator ${Math.floor(Math.random() * 10) + 1}`,
          dt_ack_time: ackTime.toISOString(),
          dt_ack_by: `${team}-Lead`,
          completed_time: completedTime.toISOString(),
          complete_by: `${team}-Tech`,
          end_time: completedTime.toISOString(),
          duration_hours: durationMins / 60,
          response_time_hours: responseMins / 60,
          resolution_time_hours: resolutionMins / 60,
          week_number: weekNum,
          year,
          shift,
          station: equip,
        });
      }
    }
  }

  const datesSorted = incidents
    .filter((i) => i.report_time)
    .map((i) => new Date(i.report_time))
    .sort((a, b) => a.getTime() - b.getTime());

  const weekNumbers = incidents.map((i) => i.week_number).filter((w) => w > 0);
  const dominantWeek = weekNumbers.length > 0 ? weekNumbers[Math.floor(weekNumbers.length / 2)] : 0;
  const dominantYear = new Date().getFullYear();

  const linesSet = new Set(incidents.map((i) => i.line));

  return {
    incidents,
    metadata: {
      recordCount: incidents.length,
      linesDetected: Array.from(linesSet),
      dateRangeStart: datesSorted.length > 0 ? datesSorted[0].toISOString() : null,
      dateRangeEnd: datesSorted.length > 0 ? datesSorted[datesSorted.length - 1].toISOString() : null,
      weekNumber: dominantWeek,
      year: dominantYear,
      sheets: ['Raw Data'],
    },
  };
}
