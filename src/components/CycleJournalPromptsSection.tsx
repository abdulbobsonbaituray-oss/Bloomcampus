import React, { useState, useEffect, useMemo } from 'react';
import {
  BookHeart,
  Sparkles,
  CheckCircle2,
  Shuffle,
  Search,
  Trash2,
  Edit3,
  Download,
  Upload,
  Database,
  Calendar,
} from 'lucide-react';
import { CycleMetrics, JournalEntry, StageKey, UserData } from '../types';
import { PHASE_ADVISOR_DATA, MOOD_CATEGORIES } from '../constants';
import { formatHumanDate, formatShortMonthDay } from '../utils/cycleEngine';

interface CycleJournalPromptsSectionProps {
  userData: UserData;
  selectedDateStr: string;
  metrics: CycleMetrics;
  onUpdateUser: (updater: (prev: UserData) => UserData) => void;
  onSelectDate: (dateStr: string) => void;
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const STAGE_JOURNAL_PROMPTS: Record<StageKey, string[]> = {
  MENSTRUATION: [
    'What is one boundary you can set today to protect your rest and energy during your period?',
    'Where in your body are you holding tension right now, and how can you offer yourself extra gentleness between classes?',
    'Looking back at this past cycle, what habit or stressor are you ready to release as a new cycle begins?',
    'What comfort ritual (warm tea, extra sleep, lighter study load) feels most nourishing for your body today?',
  ],
  FOLLICULAR: [
    'As your energy and estrogen rise in your Follicular phase, what new academic goal or creative project are you most excited to start?',
    'What felt overwhelming last week that suddenly feels clearer or more manageable today?',
    'How can you channel your fresh Follicular mental clarity into your upcoming coursework or skincare routine this week?',
    'What is one bold idea, question, or campus opportunity you want to lean into right now?',
  ],
  OVULATION: [
    'While your confidence and communication peak during Ovulation, what presentation, conversation, or connection do you want to embrace?',
    'What accomplishment from the first half of your cycle are you proudest of right now?',
    'Who in your campus community lifts your energy highest, and how can you connect with them this week?',
    'How does your body feel at peak energy today, and how are you celebrating your strength?',
  ],
  LUTEAL: [
    'What was your biggest win during your Luteal phase, even as your energy naturally turns inward?',
    'When pre-period self-doubt or academic stress creeps in, what truth about your resilience do you need to remember?',
    'Which tasks on your study list truly matter this week, and which ones can wait until your next Follicular phase?',
    'How can you support your nervous system tonight (hydration, early sleep, calming skincare) before your period arrives?',
  ],
};

const STAGE_ORDER: StageKey[] = ['MENSTRUATION', 'FOLLICULAR', 'OVULATION', 'LUTEAL'];

const STAGE_BADGE_STYLES: Record<
  StageKey,
  { label: string; emoji: string; badge: string; cardBorder: string; accentBg: string }
> = {
  MENSTRUATION: {
    label: 'Menstruation',
    emoji: '🩸',
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    cardBorder: 'border-rose-200',
    accentBg: 'from-rose-50/90 via-cream to-lavender-50/60',
  },
  FOLLICULAR: {
    label: 'Follicular',
    emoji: '🌱',
    badge: 'bg-lavender-100 text-lavender-800 border-lavender-200',
    cardBorder: 'border-lavender-200',
    accentBg: 'from-lavender-50/90 via-cream to-sage-50/60',
  },
  OVULATION: {
    label: 'Ovulation',
    emoji: '🌸',
    badge: 'bg-sage-100 text-sage-800 border-sage-200',
    cardBorder: 'border-sage-200',
    accentBg: 'from-sage-50/90 via-cream to-peach-50/60',
  },
  LUTEAL: {
    label: 'Luteal',
    emoji: '🌙',
    badge: 'bg-peach-100 text-peach-800 border-peach-200',
    cardBorder: 'border-peach-200',
    accentBg: 'from-peach-50/90 via-cream to-lavender-50/60',
  },
};

export const CycleJournalPromptsSection: React.FC<CycleJournalPromptsSectionProps> = ({
  userData,
  selectedDateStr,
  metrics,
  onUpdateUser,
  onSelectDate,
  showToast,
}) => {
  const [promptStage, setPromptStage] = useState<StageKey>(metrics.stageKey);
  const [promptIndex, setPromptIndex] = useState<number>(0);
  const [reflectionInput, setReflectionInput] = useState<string>('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<StageKey | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [showSavedReflections, setShowSavedReflections] = useState<boolean>(false);

  // Sync prompt stage when selectedDateStr / active stage changes (unless editing a specific entry)
  useEffect(() => {
    if (!editingEntryId) {
      setPromptStage(metrics.stageKey);
      // Deterministically pick a daily prompt index based on cycleDay
      const prompts = STAGE_JOURNAL_PROMPTS[metrics.stageKey];
      const dailyIdx = (metrics.cycleDay - 1) % prompts.length;
      setPromptIndex(Math.max(0, dailyIdx));
    }
  }, [metrics.stageKey, metrics.cycleDay, selectedDateStr, editingEntryId]);

  const activePromptList = STAGE_JOURNAL_PROMPTS[promptStage] || STAGE_JOURNAL_PROMPTS.LUTEAL;
  const currentPromptQuestion =
    activePromptList[promptIndex % activePromptList.length] || activePromptList[0];

  // Check if there's already a reflection saved for (selectedDateStr + currentPromptQuestion)
  const existingEntryForPrompt = useMemo(() => {
    const entries = userData.journalEntries || [];
    if (editingEntryId) {
      return entries.find((e) => e.id === editingEntryId) || null;
    }
    return (
      entries.find(
        (e) => e.dateStr === selectedDateStr && e.promptQuestion === currentPromptQuestion
      ) || null
    );
  }, [userData.journalEntries, selectedDateStr, currentPromptQuestion, editingEntryId]);

  useEffect(() => {
    if (existingEntryForPrompt) {
      setReflectionInput(existingEntryForPrompt.reflectionText);
    } else if (!editingEntryId) {
      setReflectionInput('');
    }
  }, [existingEntryForPrompt?.id, selectedDateStr, currentPromptQuestion, editingEntryId]);

  // Save or update reflection in userData.journalEntries
  const saveReflectionEntry = (textToSave: string, showNotification = true) => {
    const trimmed = textToSave.trim();
    if (!trimmed) {
      if (showNotification) {
        showToast('Write a few thoughts on the prompt before saving!', 'warning');
      }
      return;
    }

    const dayMood = userData.dailyLogs?.[selectedDateStr]?.mood || null;
    const nowIso = new Date().toISOString();

    onUpdateUser((prev) => {
      const entries = Array.isArray(prev.journalEntries) ? [...prev.journalEntries] : [];
      const targetId = editingEntryId || existingEntryForPrompt?.id;

      if (targetId) {
        const idx = entries.findIndex((e) => e.id === targetId);
        if (idx >= 0) {
          entries[idx] = {
            ...entries[idx],
            stageKey: promptStage,
            promptQuestion: currentPromptQuestion,
            reflectionText: trimmed,
            moodAtReflection: dayMood || entries[idx].moodAtReflection,
            updatedAt: nowIso,
          };
        }
      } else {
        const newEntry: JournalEntry = {
          id: `journal-${Date.now()}`,
          dateStr: selectedDateStr,
          stageKey: promptStage,
          cycleDay: metrics.cycleDay,
          promptQuestion: currentPromptQuestion,
          reflectionText: trimmed,
          moodAtReflection: dayMood,
          updatedAt: nowIso,
        };
        entries.unshift(newEntry);
      }

      return {
        ...prev,
        lastUpdatedAt: nowIso,
        journalEntries: entries,
      };
    });

    setAutoSavedAt(
      new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );

    if (showNotification) {
      setEditingEntryId(null);
      showToast(
        `📖 Reflection saved to your ${STAGE_BADGE_STYLES[promptStage].label} journal memory!`,
        'success'
      );
    }
  };

  const handleDeleteEntry = (id: string) => {
    onUpdateUser((prev) => ({
      ...prev,
      lastUpdatedAt: new Date().toISOString(),
      journalEntries: (prev.journalEntries || []).filter((e) => e.id !== id),
    }));
    if (editingEntryId === id) {
      setEditingEntryId(null);
      setReflectionInput('');
    }
    showToast('Journal reflection removed.', 'info');
  };

  const handleEditEntry = (entry: JournalEntry) => {
    setEditingEntryId(entry.id);
    onSelectDate(entry.dateStr);
    setPromptStage(entry.stageKey);
    const stagePrompts = STAGE_JOURNAL_PROMPTS[entry.stageKey];
    const foundIdx = stagePrompts.indexOf(entry.promptQuestion);
    if (foundIdx >= 0) {
      setPromptIndex(foundIdx);
    }
    setReflectionInput(entry.reflectionText);
    showToast(`Editing reflection from ${formatHumanDate(entry.dateStr)}`, 'info');
  };

  // Filtered & searched journal entries
  const filteredEntries = useMemo(() => {
    const all = [...(userData.journalEntries || [])].sort((a, b) =>
      a.dateStr < b.dateStr ? 1 : -1
    );
    return all.filter((entry) => {
      if (filterStage !== 'ALL' && entry.stageKey !== filterStage) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPrompt = entry.promptQuestion.toLowerCase().includes(q);
        const matchesText = entry.reflectionText.toLowerCase().includes(q);
        const matchesMood = (entry.moodAtReflection || '').toLowerCase().includes(q);
        return matchesPrompt || matchesText || matchesMood;
      }
      return true;
    });
  }, [userData.journalEntries, filterStage, searchQuery]);

  // Calculate total items remembered across the app for the Memory Vault strip
  const memoryStats = useMemo(() => {
    const periodsCount = (userData.periods || []).length;
    const dailyLogsCount = Object.keys(userData.dailyLogs || {}).length;
    const journalCount = (userData.journalEntries || []).length;
    const tasksCount = (userData.academicTasks || []).length;
    const skincareCount =
      (userData.therapyLogs || []).length + (userData.appointments || []).length;
    const totalWaterGlasses = Object.values(userData.dailyLogs || {}).reduce(
      (acc, d) => acc + (d?.waterGlasses || 0),
      0
    );
    return {
      periodsCount,
      dailyLogsCount,
      journalCount,
      tasksCount,
      skincareCount,
      totalWaterGlasses,
    };
  }, [userData]);

  // Export all user data as a JSON backup file
  const handleExportMemoryBackup = () => {
    const dataStr = JSON.stringify(userData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = (userData.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.href = url;
    link.download = `BloomCampus_Full_Memory_Backup_${safeName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('💾 Downloaded your complete BloomCampus memory backup (.json)!', 'success');
  };

  // Import/Restore user data from a JSON backup file
  const handleImportMemoryBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result || '{}'));
        if (!parsed || typeof parsed !== 'object') {
          showToast('Invalid backup file format.', 'warning');
          return;
        }
        onUpdateUser((prev) => ({
          ...prev,
          ...parsed,
          email: prev.email, // Keep current logged-in email key intact
          lastUpdatedAt: new Date().toISOString(),
        }));
        showToast('✅ Restored all your saved cycle, mood, and journal data!', 'success');
      } catch {
        showToast('Could not parse backup file.', 'warning');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const activeStageStyle = STAGE_BADGE_STYLES[promptStage];

  return (
    <section className="bg-white rounded-3xl shadow-xs border-2 border-lavender-200 p-5 sm:p-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-lavender-700 mb-1">
            <BookHeart className="w-4 h-4 text-rose-600" />
            <span>Cycle-Synced Self-Awareness &amp; Persistent Memory</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">
            Daily Cycle Stage Journal Prompts
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Reflect on daily questions tailored to your hormonal phase — every reflection, mood, symptom, and period you enter is automatically remembered in your personal vault.
          </p>
        </div>

        {/* Stage Selector Pills for Prompts */}
        <div className="flex flex-wrap items-center gap-1.5 bg-cream p-1.5 rounded-2xl border border-slate-200/80 self-start lg:self-auto">
          {STAGE_ORDER.map((stKey) => {
            const st = STAGE_BADGE_STYLES[stKey];
            const isSelected = promptStage === stKey;
            const isCurrentCycleStage = metrics.stageKey === stKey;
            return (
              <button
                key={stKey}
                type="button"
                onClick={() => {
                  setEditingEntryId(null);
                  setPromptStage(stKey);
                  setPromptIndex(0);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                  isSelected
                    ? 'bg-lavender-700 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-lavender-50'
                }`}
              >
                <span>{st.emoji}</span>
                <span>{st.label}</span>
                {isCurrentCycleStage && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-lavender-100 text-lavender-800'
                    }`}
                  >
                    Now
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Prompt & Reflection Card */}
      <div
        className={`rounded-2xl bg-gradient-to-br ${activeStageStyle.accentBg} border-2 ${activeStageStyle.cardBorder} p-4 sm:p-5 mb-5 shadow-xs`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-xl border ${activeStageStyle.badge}`}
            >
              <span>{activeStageStyle.emoji}</span>
              <span>{PHASE_ADVISOR_DATA[promptStage].shortName} Phase Prompt</span>
            </span>
            <span className="text-xs font-bold text-slate-600 font-mono tabular-nums">
              {formatHumanDate(selectedDateStr)} · Cycle Day {metrics.cycleDay}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 font-mono mr-1">
              Prompt {(promptIndex % activePromptList.length) + 1} of {activePromptList.length}
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingEntryId(null);
                setPromptIndex((prev) => (prev + 1) % activePromptList.length);
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-lavender-50 text-lavender-800 border border-lavender-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Next Prompt</span>
            </button>
          </div>
        </div>

        {/* The Daily Reflection Question */}
        <div className="bg-white/95 rounded-2xl p-4 border border-lavender-100 mb-4 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <Sparkles className="w-5 h-5 text-lavender-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-lavender-700 block mb-0.5">
                Daily Self-Awareness Question
              </span>
              <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-snug">
                &ldquo;{currentPromptQuestion}&rdquo;
              </h3>
            </div>
          </div>

          {/* Quick Prompt Selector Dots */}
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
            {activePromptList.map((q, idx) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setEditingEntryId(null);
                  setPromptIndex(idx);
                }}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-all truncate max-w-[230px] ${
                  idx === promptIndex % activePromptList.length
                    ? 'bg-lavender-700 text-white font-bold'
                    : 'bg-slate-100 hover:bg-lavender-50 text-slate-600'
                }`}
                title={q}
              >
                Q{idx + 1}: {q}
              </button>
            ))}
          </div>
        </div>

        {/* Reflection Textarea */}
        <div className="space-y-3">
          <textarea
            rows={3}
            value={reflectionInput}
            onChange={(e) => setReflectionInput(e.target.value)}
            onBlur={() => {
              if (reflectionInput.trim()) {
                saveReflectionEntry(reflectionInput, false);
              }
            }}
            placeholder={`Write your reflection for your ${STAGE_BADGE_STYLES[promptStage].label} phase here... (Automatically saved to your app memory)`}
            className="w-full p-3.5 rounded-2xl border border-slate-200 focus:border-lavender-600 bg-white text-xs sm:text-sm text-slate-800 outline-none leading-relaxed shadow-2xs"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-sage-600 shrink-0" />
              <span>
                {autoSavedAt
                  ? `Saved to app memory at ${autoSavedAt}`
                  : existingEntryForPrompt
                  ? 'Saved in your journal memory for this date'
                  : 'Auto-saves on blur or tap Save Reflection'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {editingEntryId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingEntryId(null);
                    setReflectionInput('');
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                onClick={() => saveReflectionEntry(reflectionInput, true)}
                className="px-5 py-2.5 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                💾 {editingEntryId || existingEntryForPrompt ? 'Update Reflection' : 'Save Reflection'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BIG BUTTON: Saved Reflections & Self-Awareness */}
      <button
        type="button"
        onClick={() => setShowSavedReflections((prev) => !prev)}
        aria-expanded={showSavedReflections}
        className={`w-full rounded-3xl p-5 sm:p-6 border-2 transition-all cursor-pointer text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md active:scale-[0.99] ${
          showSavedReflections
            ? 'bg-gradient-to-r from-lavender-700 via-lavender-800 to-slate-900 text-white border-lavender-900'
            : 'bg-gradient-to-r from-lavender-50 via-rose-50/70 to-sage-50 hover:from-lavender-100 hover:to-sage-100 text-slate-900 border-lavender-300'
        }`}
      >
        <div className="flex items-start sm:items-center gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-xs border ${
              showSavedReflections
                ? 'bg-white/15 border-white/25 text-white'
                : 'bg-white border-lavender-200 text-lavender-800'
            }`}
          >
            📖
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  showSavedReflections
                    ? 'bg-white/20 text-white'
                    : 'bg-lavender-700 text-white'
                }`}
              >
                {(userData.journalEntries || []).length} Saved Reflection
                {(userData.journalEntries || []).length === 1 ? '' : 's'}
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  showSavedReflections
                    ? 'bg-emerald-400/20 text-emerald-100 border border-emerald-300/30'
                    : 'bg-sage-100 text-sage-800 border border-sage-200'
                }`}
              >
                💾 App Memory Vault Active
              </span>
            </div>
            <h3 className="font-display font-extrabold text-lg sm:text-xl leading-snug">
              Saved Reflections &amp; Self-Awareness
            </h3>
            <p
              className={`text-xs sm:text-sm mt-0.5 ${
                showSavedReflections ? 'text-lavender-100' : 'text-slate-600'
              }`}
            >
              Tap to {showSavedReflections ? 'hide' : 'open'} your past cycle reflections, search by stage, or back up your memory vault
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end shrink-0">
          <span
            className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition-all ${
              showSavedReflections
                ? 'bg-white text-lavender-950'
                : 'bg-lavender-700 text-white'
            }`}
          >
            <span>{showSavedReflections ? '▲ Hide Reflections' : '▼ Open Saved Reflections'}</span>
          </span>
        </div>
      </button>

      {/* Expandable Saved Journal Reflections Timeline, Search & Memory Backup */}
      {showSavedReflections && (
        <div className="mt-5 pt-5 border-t border-lavender-100 space-y-6">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="font-display font-extrabold text-base sm:text-lg text-slate-800">
                  📖 Saved Reflections &amp; Self-Awareness Log ({(userData.journalEntries || []).length})
                </h4>
                <p className="text-xs text-slate-500">
                  Search or filter your past reflections across all menstrual cycle stages:
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Search Box */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search reflections..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-cream focus:bg-white focus:border-lavender-500 outline-none"
                  />
                </div>

                {/* Stage Filter Pills */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setFilterStage('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      filterStage === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-cream text-slate-600 border border-slate-200 hover:bg-lavender-50'
                    }`}
                  >
                    All
                  </button>
                  {STAGE_ORDER.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterStage(st)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        filterStage === st
                          ? 'bg-lavender-700 text-white'
                          : 'bg-cream text-slate-600 border border-slate-200 hover:bg-lavender-50'
                      }`}
                      title={STAGE_BADGE_STYLES[st].label}
                    >
                      {STAGE_BADGE_STYLES[st].emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="rounded-2xl bg-cream border border-slate-200/80 p-4 text-center text-xs text-slate-500 italic">
                No journal reflections match this filter yet. Answer today&apos;s cycle-stage prompt above to record your first reflection!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredEntries.map((entry) => {
                  const stMeta = STAGE_BADGE_STYLES[entry.stageKey] || STAGE_BADGE_STYLES.LUTEAL;
                  const moodEmoji = entry.moodAtReflection
                    ? MOOD_CATEGORIES.find((m) => m.id === entry.moodAtReflection)?.emoji
                    : null;

                  return (
                    <div
                      key={entry.id}
                      className="rounded-2xl bg-cream/70 hover:bg-white border border-slate-200/90 p-4 transition-all flex flex-col justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${stMeta.badge}`}
                            >
                              {stMeta.emoji} {stMeta.label} · Day {entry.cycleDay}
                            </span>
                            {entry.moodAtReflection && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700">
                                {moodEmoji} {entry.moodAtReflection}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono font-bold text-slate-500 flex items-center gap-1 shrink-0">
                            <Calendar className="w-3 h-3 text-lavender-600" />
                            {formatShortMonthDay(entry.dateStr)}
                          </span>
                        </div>

                        <p className="text-xs font-extrabold text-lavender-900 mb-1.5">
                          Q: &ldquo;{entry.promptQuestion}&rdquo;
                        </p>
                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-white rounded-xl p-3 border border-slate-100">
                          {entry.reflectionText}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Saved {formatHumanDate(entry.dateStr)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditEntry(entry)}
                            className="px-2.5 py-1 rounded-lg bg-lavender-50 hover:bg-lavender-100 text-lavender-800 font-bold text-[11px] flex items-center gap-1 border border-lavender-200"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] border border-rose-200"
                            title="Delete reflection"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Persistent App Memory Vault Status & Backup Bar */}
          <div className="rounded-2xl bg-gradient-to-r from-lavender-50 via-sage-50 to-peach-50 border border-lavender-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white border border-lavender-200 flex items-center justify-center text-lavender-700 shrink-0 shadow-2xs">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sage-700 text-white">
                    App Memory Active
                  </span>
                  <h4 className="font-display font-extrabold text-xs sm:text-sm text-slate-900">
                    Everything You Enter Is Remembered &amp; Synced ({userData.name})
                  </h4>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Stored in your profile memory:{' '}
                  <strong>{memoryStats.periodsCount}</strong> periods ·{' '}
                  <strong>{memoryStats.dailyLogsCount}</strong> daily mood/symptom logs ·{' '}
                  <strong>{memoryStats.totalWaterGlasses}</strong> water glasses ·{' '}
                  <strong>{memoryStats.journalCount}</strong> journal reflections ·{' '}
                  <strong>{memoryStats.tasksCount}</strong> study tasks ·{' '}
                  <strong>{memoryStats.skincareCount}</strong> skincare records.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportMemoryBackup}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-lavender-50 text-lavender-900 border border-lavender-200 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Memory (.json)</span>
              </button>

              <label className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Restore Memory</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportMemoryBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
