import { jsPDF } from 'jspdf';
import { CycleMetrics, PeriodRecord, StageKey, UserData } from '../types';
import { PHASE_ADVISOR_DATA } from '../constants';
import {
  calculateCycleMetrics,
  diffDays,
  formatDateISO,
  formatHumanDate,
} from './cycleEngine';

const STAGE_ORDER: StageKey[] = ['MENSTRUATION', 'FOLLICULAR', 'OVULATION', 'LUTEAL'];

function resolveStageKey(userData: UserData, dateStr: string, stageAtLog: string | null): StageKey {
  if (stageAtLog) {
    const upper = stageAtLog.toUpperCase();
    if (upper.includes('MENSTRUATION')) return 'MENSTRUATION';
    if (upper.includes('FOLLICULAR')) return 'FOLLICULAR';
    if (upper.includes('OVULATION')) return 'OVULATION';
    if (upper.includes('LUTEAL')) return 'LUTEAL';
  }
  return calculateCycleMetrics(userData, dateStr).stageKey;
}

export function exportClinicSummaryToPDF(
  userData: UserData,
  todayMetrics: CycleMetrics,
  sortedPeriods: PeriodRecord[]
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = 14;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > 276) {
      doc.addPage();
      y = 16;
    }
  };

  // =========================================================================
  // 1. HEADER BANNER
  // =========================================================================
  doc.setFillColor(59, 9, 68); // Deep Plum (#3B0944)
  doc.roundedRect(margin, y, contentWidth, 26, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('BLOOMCAMPUS & SIDRATU CLINIC — PATIENT CYCLE REPORT', margin + 5, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(233, 226, 255);
  doc.text(
    'Sidratu Beauty Therapy Skin Care & Clinic • 101 Jomo Kenyatta Road, Freetown, Sierra Leone (Open 9:00 AM - 7:30 PM)',
    margin + 5,
    y + 15.5
  );
  doc.text(
    `Generated on: ${new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })} • Confidential Healthcare Provider Summary`,
    margin + 5,
    y + 21.5
  );

  y += 32;

  // =========================================================================
  // 2. PATIENT DEMOGRAPHICS & VITAL CYCLE METRICS
  // =========================================================================
  doc.setFillColor(246, 243, 255);
  doc.setDrawColor(210, 198, 250);
  doc.roundedRect(margin, y, contentWidth, 26, 2.5, 2.5, 'FD');

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `Patient Name: ${userData.name || 'Student'}   |   Age: ${
      userData.age ? `${userData.age} yrs` : 'Not specified'
    }   |   Email: ${userData.email}`,
    margin + 4,
    y + 7
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const currentStageName = PHASE_ADVISOR_DATA[todayMetrics.stageKey].shortName;
  doc.text(
    `Average Cycle Length: ${todayMetrics.avgCycleLength} Days   •   Average Period Duration: ${todayMetrics.avgPeriodDuration} Days   •   Pattern Status: ${
      todayMetrics.isIrregular ? 'Variable / Irregular Flagged' : 'Within Regular Clinical Range'
    }`,
    margin + 4,
    y + 14
  );
  doc.text(
    `Current Cycle Position: Day ${todayMetrics.cycleDay} (${currentStageName} Stage)   •   Next Predicted Period: ${
      todayMetrics.nextPeriodDateStr
        ? formatHumanDate(todayMetrics.nextPeriodDateStr)
        : 'Pending log'
    }   •   Ovulation Window: Days ${todayMetrics.ovStart}-${todayMetrics.ovEnd}`,
    margin + 4,
    y + 21
  );

  y += 32;

  // =========================================================================
  // 3. RECORDED MENSTRUAL PERIOD HISTORY (LAST 6 CYCLES)
  // =========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(59, 9, 68);
  doc.text('1. Recorded Menstrual Period History (Last 6 Logged Cycles)', margin, y);
  y += 4;

  // Table Header
  doc.setFillColor(232, 93, 117);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('Period Start Date', margin + 3, y + 4.8);
  doc.text('Period End Date', margin + 52, y + 4.8);
  doc.text('Bleeding Duration', margin + 102, y + 4.8);
  doc.text('Cycle Length (to next)', margin + 142, y + 4.8);
  y += 7;

  const recentPeriods = [...sortedPeriods].reverse().slice(0, 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  if (recentPeriods.length === 0) {
    doc.setFillColor(253, 251, 247);
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.text('No menstrual periods recorded yet.', margin + 3, y + 4.8);
    y += 9;
  } else {
    recentPeriods.forEach((p, revIdx) => {
      const origIdx = sortedPeriods.length - 1 - revIdx;
      const hasEnd = Boolean(p.endDate && p.endDate >= p.startDate);
      const bleedDays = hasEnd ? `${diffDays(p.startDate, p.endDate!) + 1} days` : 'Ongoing';
      const cycleLen =
        origIdx + 1 < sortedPeriods.length
          ? `${diffDays(p.startDate, sortedPeriods[origIdx + 1].startDate)} days`
          : 'Current Cycle';

      if (revIdx % 2 === 0) {
        doc.setFillColor(253, 251, 247);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(margin, y, contentWidth, 6.8, 'F');

      doc.setFontSize(8.5);
      doc.text(formatHumanDate(p.startDate), margin + 3, y + 4.7);
      doc.text(hasEnd ? formatHumanDate(p.endDate) : 'Ongoing', margin + 52, y + 4.7);
      doc.text(bleedDays, margin + 102, y + 4.7);
      doc.text(cycleLen, margin + 142, y + 4.7);
      y += 6.8;
    });
    y += 4;
  }

  // =========================================================================
  // 4. STAGE-BY-STAGE SYMPTOM & MOOD CORRELATION SUMMARY
  // =========================================================================
  ensureSpace(46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(59, 9, 68);
  doc.text('2. Symptom & Mood Frequency by Menstrual Cycle Stage', margin, y);
  y += 4;

  doc.setFillColor(86, 57, 204);
  doc.rect(margin, y, contentWidth, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('Cycle Stage', margin + 3, y + 4.8);
  doc.text('Days Logged', margin + 42, y + 4.8);
  doc.text('Top Logged Moods', margin + 70, y + 4.8);
  doc.text('Top Physical Symptoms', margin + 125, y + 4.8);
  y += 7;

  const stageStats: Record<
    StageKey,
    { days: number; moods: Record<string, number>; symptoms: Record<string, number> }
  > = {
    MENSTRUATION: { days: 0, moods: {}, symptoms: {} },
    FOLLICULAR: { days: 0, moods: {}, symptoms: {} },
    OVULATION: { days: 0, moods: {}, symptoms: {} },
    LUTEAL: { days: 0, moods: {}, symptoms: {} },
  };

  Object.entries(userData.dailyLogs || {}).forEach(([dateStr, entry]) => {
    if (!entry) return;
    const hasMood = Boolean(entry.mood);
    const syms = Array.isArray(entry.symptoms) ? entry.symptoms : [];
    if (!hasMood && syms.length === 0) return;

    const stKey = resolveStageKey(userData, dateStr, entry.stageAtLog);
    stageStats[stKey].days += 1;
    if (entry.mood) {
      stageStats[stKey].moods[entry.mood] = (stageStats[stKey].moods[entry.mood] || 0) + 1;
    }
    syms.forEach((s) => {
      stageStats[stKey].symptoms[s] = (stageStats[stKey].symptoms[s] || 0) + 1;
    });
  });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  STAGE_ORDER.forEach((stKey, idx) => {
    const stData = stageStats[stKey];
    const stName = PHASE_ADVISOR_DATA[stKey].shortName;
    const topMoodsStr =
      Object.entries(stData.moods)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m, c]) => `${m} (${c}x)`)
        .join(', ') || 'None logged';

    const topSymsStr =
      Object.entries(stData.symptoms)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([s, c]) => `${s} (${c}x)`)
        .join(', ') || 'Symptom-free';

    if (idx % 2 === 0) {
      doc.setFillColor(246, 243, 255);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin, y, contentWidth, 7, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(stName, margin + 3, y + 4.8);
    doc.setFont('helvetica', 'normal');
    doc.text(`${stData.days}d`, margin + 42, y + 4.8);
    doc.text(topMoodsStr.slice(0, 32), margin + 70, y + 4.8);
    doc.text(topSymsStr.slice(0, 36), margin + 125, y + 4.8);
    y += 7;
  });

  y += 5;

  // =========================================================================
  // 5. EMERGENCY CONTRACEPTION & SIDRATU SKINCARE LOGS
  // =========================================================================
  ensureSpace(42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(59, 9, 68);
  doc.text('3. Emergency Contraception & Skincare Therapy History', margin, y);
  y += 5;

  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');
  doc.setFontSize(9);
  doc.setTextColor(136, 19, 55);
  doc.text('Emergency Contraception (e.g., Postinor-2 / Plan B) Timestamps:', margin + 3, y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const pills = userData.emergencyPills || [];
  const pillSummary =
    pills.length === 0
      ? 'None recorded.'
      : pills
          .slice(0, 4)
          .map((p) =>
            new Date(p.timestamp).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          )
          .join('   |   ');
  doc.text(pillSummary, margin + 3, y + 12);
  y += 20;

  // Skincare Goal & Therapy Logs
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52);
  doc.text(
    `Sidratu Skincare Goal: ${userData.skincareGoal || 'General Hormonal Skin Balance'}`,
    margin + 3,
    y + 6
  );
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  const recentTherapies = (userData.therapyLogs || []).slice(0, 2);
  const therapySummary =
    recentTherapies.length === 0
      ? 'No clinic skincare sessions logged yet.'
      : recentTherapies
          .map((t) => `${t.sessionDate}: ${t.treatmentType} (${t.stageAtSession || 'Logged'})`)
          .join('  •  ');
  doc.text(therapySummary.slice(0, 105), margin + 3, y + 13);
  y += 24;

  // =========================================================================
  // 6. PHYSICIAN / CLINICIAN NOTES SECTION
  // =========================================================================
  ensureSpace(38);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(59, 9, 68);
  doc.text('4. Healthcare Provider / Clinician Notes & Recommendations', margin, y);
  y += 3;

  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'S');
  doc.setDrawColor(226, 232, 240);
  doc.line(margin + 4, y + 9, margin + contentWidth - 4, y + 9);
  doc.line(margin + 4, y + 17, margin + contentWidth - 4, y + 17);
  doc.line(margin + 4, y + 25, margin + contentWidth - 4, y + 25);

  const safeName = (userData.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `BloomCampus_Clinic_Summary_${safeName}_${formatDateISO(new Date())}.pdf`;
  doc.save(fileName);
  return fileName;
}
