import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Send,
  MessageCircle,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  CycleMetrics,
  SidratuAppointment,
  TherapySessionLog,
  UserData,
} from '../types';
import {
  PHASE_ADVISOR_DATA,
  SIDRATU_TREATMENTS,
  SKINCARE_GOALS,
} from '../constants';
import { formatDateISO, formatHumanDate } from '../utils/cycleEngine';

interface CommunityComment {
  id: string;
  userName: string;
  commentText: string;
  stageTag?: string;
  treatmentTag?: string;
  createdAt: string;
}

interface SidratuClinicHubProps {
  userData: UserData;
  metrics: CycleMetrics;
  onUpdateUser: (updater: (prev: UserData) => UserData) => void;
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const SidratuClinicHub: React.FC<SidratuClinicHubProps> = ({
  userData,
  metrics,
  onUpdateUser,
  showToast,
}) => {
  const currentStage = PHASE_ADVISOR_DATA[metrics.stageKey];
  const selectedGoalKey =
    userData.skincareGoal && SKINCARE_GOALS[userData.skincareGoal]
      ? userData.skincareGoal
      : 'Even Skin Tone & Clear Dark Spots';
  const currentGoalObj = SKINCARE_GOALS[selectedGoalKey];

  const [activeSidratuSection, setActiveSidratuSection] = useState<
    'assistant' | 'goal' | 'booking' | 'timeline' | 'community' | 'all'
  >('assistant');

  // Therapy Session Logger State
  const [logTreatment, setLogTreatment] = useState(SIDRATU_TREATMENTS[0]);
  const [logDate, setLogDate] = useState(formatDateISO(new Date()));
  const [logFeeling, setLogFeeling] = useState('');

  // Booking Scheduler State
  const bookingSectionRef = useRef<HTMLDivElement>(null);
  const [bookTreatment, setBookTreatment] = useState(
    currentGoalObj.recommendedTreatments[0] || SIDRATU_TREATMENTS[0]
  );
  const [bookDateTime, setBookDateTime] = useState(() => {
    const tomorrow = new Date(Date.now() + 86400000);
    tomorrow.setHours(11, 0, 0, 0);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T11:00`;
  });
  const [bookNotes, setBookNotes] = useState('');

  // Community Board State
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentTreatment, setNewCommentTreatment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Virtual Assistant Chat State
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: 'user' | 'model'; text: string }>
  >([
    {
      role: 'model',
      text: `Welcome to Sidratu Beauty Therapy Skin Care at 101 Jomo Kenyatta Road, Freetown! 🌸 I see you're in your ${currentStage.shortName} (Cycle Day ${metrics.cycleDay}). How can I help with your skin care, aesthetics, dental clinic questions, or cycle-synced treatments today?`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    fetch('/api/community/comments')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.comments)) {
          setComments(data.comments);
        }
      })
      .catch(() => {
        // Fallback if offline
      });
  }, []);

  const handleGoalChange = (newGoal: string) => {
    onUpdateUser((prev) => ({
      ...prev,
      skincareGoal: newGoal,
    }));
    const goalInfo = SKINCARE_GOALS[newGoal];
    if (goalInfo && goalInfo.recommendedTreatments[0]) {
      setBookTreatment(goalInfo.recommendedTreatments[0]);
    }
    showToast(`Skincare goal updated to "${newGoal}"!`, 'success');
  };

  const handleAddTherapyLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logDate || !logFeeling.trim()) {
      showToast('Please select a session date and write how your skin felt after the session.', 'warning');
      return;
    }
    const newEntry: TherapySessionLog = {
      id: `log-${Date.now()}`,
      treatmentType: logTreatment,
      sessionDate: logDate,
      postSessionFeeling: logFeeling.trim(),
      stageAtSession: currentStage.shortName,
    };
    onUpdateUser((prev) => ({
      ...prev,
      therapyLogs: [newEntry, ...(prev.therapyLogs || [])].sort((a, b) =>
        b.sessionDate.localeCompare(a.sessionDate)
      ),
    }));
    setLogFeeling('');
    showToast('✨ Therapy session saved to your gold skincare timeline!', 'success');
  };

  const handleDeleteTherapyLog = (id: string) => {
    onUpdateUser((prev) => ({
      ...prev,
      therapyLogs: (prev.therapyLogs || []).filter((item) => item.id !== id),
    }));
    showToast('Therapy session removed from timeline.', 'info');
  };

  const handleBookAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookDateTime) {
      showToast('Please select a date and time for your appointment.', 'warning');
      return;
    }
    const dt = new Date(bookDateTime);
    if (isNaN(dt.getTime())) {
      showToast('Please enter a valid date and time.', 'warning');
      return;
    }
    const hours = dt.getHours() + dt.getMinutes() / 60;
    if (hours < 9 || hours > 19.5) {
      showToast(
        'Sidratu Clinic open hours are 9:00 AM to 7:30 PM. Please choose a time within clinic hours.',
        'warning'
      );
      return;
    }

    const datePart = bookDateTime.split('T')[0];
    const timePart = dt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    const newAppt: SidratuAppointment = {
      id: `appt-${Date.now()}`,
      treatmentType: bookTreatment,
      requestedDate: datePart,
      requestedTime: timePart,
      notes: bookNotes.trim(),
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
    };

    onUpdateUser((prev) => ({
      ...prev,
      appointments: [newAppt, ...(prev.appointments || [])],
    }));
    setBookNotes('');
    showToast(
      `📅 Appointment requested for ${bookTreatment} on ${formatHumanDate(datePart)} at ${timePart}!`,
      'success'
    );
  };

  const handleCancelAppointment = (id: string) => {
    onUpdateUser((prev) => ({
      ...prev,
      appointments: (prev.appointments || []).filter((a) => a.id !== id),
    }));
    showToast('Appointment cancelled.', 'info');
  };

  const scrollToNewAppointment = (suggestedTreatment?: string) => {
    if (suggestedTreatment) {
      setBookTreatment(suggestedTreatment);
    }
    setActiveSidratuSection('booking');
    setTimeout(() => {
      bookingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    showToast('Opened New Appointment scheduler!', 'info');
  };

  const handleSendAssistantMessage = async (e: React.FormEvent, quickPrompt?: string) => {
    e.preventDefault();
    const textToSend = (quickPrompt ?? chatInput).trim();
    if (!textToSend || chatLoading) return;

    const updatedHistory = [...chatHistory, { role: 'user' as const, text: textToSend }];
    setChatHistory(updatedHistory);
    if (!quickPrompt) setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: updatedHistory,
          userContext: {
            studentName: userData.name,
            age: userData.age,
            currentCycleStage: currentStage.name,
            cycleDay: metrics.cycleDay,
            avgCycleLength: metrics.avgCycleLength,
            avgPeriodDuration: metrics.avgPeriodDuration,
            nextPredictedPeriod: metrics.nextPeriodDateStr,
            daysUntilNextPeriod: metrics.daysUntilNextPeriod,
            skincareGoal: selectedGoalKey,
            periods: (userData.periods || []).slice(-6),
            emergencyPills: (userData.emergencyPills || []).slice(0, 4),
            dailyLogs: userData.dailyLogs || {},
            journalEntries: (userData.journalEntries || []).slice(0, 8),
            therapyLogs: (userData.therapyLogs || []).slice(0, 6),
            appointments: (userData.appointments || []).slice(0, 6),
            academicTasks: (userData.academicTasks || []).slice(0, 6),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Assistant unavailable');
      }
      setChatHistory((prev) => [...prev, { role: 'model', text: data.reply }]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: 'model',
          text: `At Sidratu Beauty Therapy Skin Care (101 Jomo Kenyatta Road, Freetown • Open 9:00 AM – 7:30 PM), we recommend gentle hydration during your ${currentStage.shortName} and booking via the "New Appointment" button for personalized care!`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch('/api/community/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: userData.name || 'Campus Student',
          commentText: newCommentText.trim(),
          stageTag: currentStage.shortName,
          treatmentTag: newCommentTreatment || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.comments)) {
        setComments(data.comments);
        setNewCommentText('');
        setNewCommentTreatment('');
        showToast('💬 Posted to the Campus & Sidratu Community Board!', 'success');
      }
    } catch {
      const fallbackComment: CommunityComment = {
        id: `local-${Date.now()}`,
        userName: userData.name || 'Campus Student',
        commentText: newCommentText.trim(),
        stageTag: currentStage.shortName,
        treatmentTag: newCommentTreatment || undefined,
        createdAt: new Date().toISOString(),
      };
      setComments((prev) => [fallbackComment, ...prev]);
      setNewCommentText('');
      showToast('💬 Posted to Community Board!', 'success');
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SIDRATU HERO BANNER (DEEP PLUM #3B0944, MAGENTA #C81D77, GOLD #D4AF37) */}
      <section className="rounded-3xl bg-gradient-to-br from-[#3B0944] via-[#590d56] to-[#C81D77] text-white p-6 sm:p-8 shadow-lg border-2 border-[#D4AF37]/50">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
              <span>Official Campus Skincare, Aesthetics & Dental Partner</span>
            </div>
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-white">
              Sidratu Beauty Therapy Skin Care
            </h2>
            <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
              Hormone fluctuations across your menstrual cycle directly impact sebum, collagen, and skin sensitivity. Sync your campus cycle stage with professional skin care, aesthetics, and dental clinic treatments.
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-[#FDFBF7]/90">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                101 Jomo Kenyatta Road, Freetown, Sierra Leone
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Clock className="w-4 h-4 text-[#D4AF37]" />
                Open Daily: 9:00 AM – 7:30 PM
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            <button
              type="button"
              onClick={() => scrollToNewAppointment()}
              className="px-6 py-3.5 rounded-2xl bg-[#D4AF37] hover:bg-[#e3be42] text-[#3B0944] font-display font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>New Appointment</span>
            </button>
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-[#D4AF37]/30 px-4 py-2.5 text-xs">
              <span className="block text-[#D4AF37] font-bold">Cycle Skin Sync ({currentStage.shortName})</span>
              <span className="text-white/90 mt-0.5 block">{currentStage.skincareSync}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SIDRATU QUICK ACTION BUTTONS (EASY ON THE EYES) */}
      <section className="bg-white rounded-3xl shadow-xs border-2 border-[#D4AF37]/40 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3.5">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#C81D77] block">
              ✨ Sidratu Clinic Action Buttons
            </span>
            <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
              Choose a Skincare Tool or Clinic Section
            </h3>
          </div>
          <button
            type="button"
            onClick={() =>
              setActiveSidratuSection((prev) => (prev === 'all' ? 'assistant' : 'all'))
            }
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
          >
            {activeSidratuSection === 'all' ? '📁 Show One at a Time' : '📂 Show All Sections'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {[
            {
              id: 'assistant' as const,
              emoji: '💬',
              title: 'AI Skincare Assistant',
              sub: '24/7 Clinic & Cycle Chat',
            },
            {
              id: 'goal' as const,
              emoji: '🎯',
              title: 'Skincare Goal Engine',
              sub: 'Match Goal to Treatments',
            },
            {
              id: 'booking' as const,
              emoji: '📅',
              title: 'Book Appointment',
              sub: `9am–7:30pm · ${(userData.appointments || []).length} Booked`,
            },
            {
              id: 'timeline' as const,
              emoji: '✨',
              title: 'Gold Session Timeline',
              sub: `${(userData.therapyLogs || []).length} Treatments Logged`,
            },
            {
              id: 'community' as const,
              emoji: '🗣️',
              title: 'Community Board',
              sub: `${comments.length} Student Reviews`,
            },
          ].map((btn) => {
            const isActive =
              activeSidratuSection === btn.id || activeSidratuSection === 'all';
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setActiveSidratuSection(btn.id)}
                className={`p-3 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-[#3B0944] text-[#D4AF37] border-[#D4AF37] shadow-md'
                    : 'bg-cream hover:bg-lavender-50 text-slate-800 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg">{btn.emoji}</span>
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                      isActive ? 'bg-[#D4AF37] text-[#3B0944]' : 'bg-white text-slate-600'
                    }`}
                  >
                    {isActive ? 'Active' : 'Open'}
                  </span>
                </div>
                <div>
                  <div
                    className={`font-display font-extrabold text-xs sm:text-sm ${
                      isActive ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {btn.title}
                  </div>
                  <div
                    className={`text-[11px] font-medium truncate ${
                      isActive ? 'text-[#D4AF37]' : 'text-slate-500'
                    }`}
                  >
                    {btn.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* STEP 1: SKINCARE GOAL ENGINE & AI VIRTUAL ASSISTANT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Goal Engine */}
        {(activeSidratuSection === 'goal' || activeSidratuSection === 'all') && (
        <section className={`${activeSidratuSection === 'all' ? 'lg:col-span-5' : 'lg:col-span-12'} bg-white rounded-3xl shadow-sm border border-lavender-200 p-5 sm:p-6 space-y-4`}>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#C81D77]">
              01. Hormonal Skincare Goal Engine
            </span>
            <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 mt-0.5">
              Select Your Primary Beauty & Skin Goal
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Get matched with the ideal Sidratu treatments and best cycle phase to book:
            </p>
          </div>

          <div>
            <label htmlFor="skincareGoalSelect" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Your Main Skincare / Wellness Goal
            </label>
            <select
              id="skincareGoalSelect"
              value={selectedGoalKey}
              onChange={(e) => handleGoalChange(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border-2 border-[#3B0944]/20 focus:border-[#C81D77] outline-none text-xs sm:text-sm font-bold text-slate-800 bg-cream"
            >
              {Object.keys(SKINCARE_GOALS).map((goalKey) => (
                <option key={goalKey} value={goalKey}>
                  {goalKey}
                </option>
              ))}
            </select>
          </div>

          {/* Goal Engine Recommendations */}
          <div className="rounded-2xl bg-gradient-to-br from-[#3B0944]/5 via-cream to-[#D4AF37]/15 border border-[#D4AF37]/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#3B0944]">Best Cycle Stage to Book:</span>
              <span className="font-bold text-[#C81D77]">{currentGoalObj.bestCycleStage}</span>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-700 mb-1.5">
                Suggested Sidratu Clinic Treatments:
              </div>
              <div className="space-y-1.5">
                {currentGoalObj.recommendedTreatments.map((treat) => (
                  <div
                    key={treat}
                    className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/80 text-xs"
                  >
                    <span className="font-semibold text-slate-800">✨ {treat}</span>
                    <button
                      type="button"
                      onClick={() => scrollToNewAppointment(treat)}
                      className="text-[11px] font-bold text-[#C81D77] hover:underline shrink-0"
                    >
                      Book →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed pt-1 border-t border-slate-200/60">
              <strong>Esthetician Advice:</strong> {currentGoalObj.routineTip}
            </p>
          </div>
        </section>
        )}

        {/* AI Skincare & Cycle Assistant */}
        {(activeSidratuSection === 'assistant' || activeSidratuSection === 'all') && (
        <section className={`${activeSidratuSection === 'all' ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white rounded-3xl shadow-sm border border-lavender-200 p-5 sm:p-6 flex flex-col`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#3B0944]">
                02. Sidratu & BloomCampus Virtual Assistant
              </span>
              <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                Ask About Skincare, Pre/Post-Care & Cycle Wellness
              </h3>
            </div>
            <button
              type="button"
              onClick={() => scrollToNewAppointment()}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-[#3B0944] hover:bg-[#C81D77] text-[#D4AF37] font-bold text-xs transition-all whitespace-nowrap shrink-0"
            >
              + New Appointment
            </button>
          </div>

          {/* Quick Prompt Starters */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {[
              'Pre-care & post-care for PRP Therapy?',
              `Best facial for my ${currentStage.shortName}?`,
              'How to calm pre-period Luteal acne?',
              'Where are you located & opening hours?',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={(e) => handleSendAssistantMessage(e, q)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 transition-all"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Chat Messages Container */}
          <div className="bg-cream rounded-2xl border border-slate-200/80 p-3.5 space-y-3 h-64 overflow-y-auto mb-3">
            {chatHistory.map((item, index) => (
              <div
                key={index}
                className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    item.role === 'user'
                      ? 'bg-[#3B0944] text-white font-medium'
                      : 'bg-white border border-lavender-200 text-slate-800 shadow-xs'
                  }`}
                >
                  {item.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-lavender-200 rounded-2xl px-4 py-2.5 text-xs text-slate-500 font-semibold">
                  Sidratu Assistant is typing...
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Form */}
          <form onSubmit={(e) => handleSendAssistantMessage(e)} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about PRP, facials, dark spots, dental care, or cycle cramps..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#C81D77] outline-none text-xs sm:text-sm text-slate-800 bg-cream"
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="px-4 py-2.5 rounded-xl bg-[#C81D77] hover:bg-[#3B0944] text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shrink-0 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>Ask</span>
            </button>
          </form>
        </section>
        )}
      </div>

      {/* STEP 2: SESSION LOGGER & GOLD TIMELINE + BOOKING SCHEDULER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Session Logger & Vertical Gold Timeline */}
        {(activeSidratuSection === 'timeline' || activeSidratuSection === 'all') && (
        <section className={`${activeSidratuSection === 'all' ? 'lg:col-span-6' : 'lg:col-span-12'} bg-white rounded-3xl shadow-sm border border-lavender-200 p-5 sm:p-6 space-y-4`}>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
              03. Skincare Session Logger & Gold Timeline
            </span>
            <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
              Log Your 11 Clinic Treatments
            </h3>
            <p className="text-xs text-slate-600">
              Track your skin and body progress across sessions sorted chronologically on a gold timeline.
            </p>
          </div>

          <form onSubmit={handleAddTherapyLog} className="space-y-3 bg-cream p-4 rounded-2xl border border-slate-200/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Treatment (11 Options)
                </label>
                <select
                  value={logTreatment}
                  onChange={(e) => setLogTreatment(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white outline-none focus:border-[#C81D77]"
                >
                  {SIDRATU_TREATMENTS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Session Date
                </label>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white outline-none focus:border-[#C81D77]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Post-Session Feeling & Skin Progress
              </label>
              <input
                type="text"
                value={logFeeling}
                onChange={(e) => setLogFeeling(e.target.value)}
                placeholder="e.g., Dark spots visibly lighter, skin feels glowing and smooth!"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white outline-none focus:border-[#C81D77]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-[#3B0944] hover:bg-[#C81D77] text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4 text-[#D4AF37]" />
              <span>Save Therapy Session to Gold Timeline</span>
            </button>
          </form>

          {/* Vertical Gold Timeline */}
          <div className="pt-2">
            <div className="text-xs font-bold text-slate-600 mb-3">
              Your Treatment History Timeline:
            </div>
            {(userData.therapyLogs || []).length === 0 ? (
              <div className="text-xs text-slate-500 italic p-4 rounded-2xl bg-cream border border-slate-200/70">
                No skincare sessions logged yet. Record your first treatment above!
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#D4AF37]">
                {(userData.therapyLogs || []).map((item) => (
                  <div
                    key={item.id}
                    className="relative bg-cream rounded-2xl p-3.5 border border-[#D4AF37]/40 shadow-xs"
                  >
                    <span className="absolute -left-[19px] top-4 w-3 h-3 rounded-full bg-[#D4AF37] ring-4 ring-white" />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-display font-bold text-xs sm:text-sm text-[#3B0944] block">
                          {item.treatmentType}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {formatHumanDate(item.sessionDate)}
                          {item.stageAtSession ? ` · ${item.stageAtSession} Stage` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteTherapyLog(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1"
                        title="Remove entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                      {item.postSessionFeeling}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        )}

        {/* Booking Scheduler */}
        {(activeSidratuSection === 'booking' || activeSidratuSection === 'all') && (
        <section
          ref={bookingSectionRef}
          className={`${activeSidratuSection === 'all' ? 'lg:col-span-6' : 'lg:col-span-12'} bg-white rounded-3xl shadow-sm border border-lavender-200 p-5 sm:p-6 space-y-4`}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#C81D77]">
              04. New Appointment Scheduler
            </span>
            <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
              Book at 101 Jomo Kenyatta Road, Freetown
            </h3>
            <p className="text-xs text-slate-600">
              Clinic Open Hours: <strong>9:00 AM – 7:30 PM</strong> • Skin Care, Aesthetics & Dental Clinic
            </p>
          </div>

          <form
            onSubmit={handleBookAppointment}
            className="space-y-3 bg-gradient-to-br from-[#3B0944]/5 to-[#C81D77]/5 p-4 rounded-2xl border border-[#C81D77]/20"
          >
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Select Treatment Service
              </label>
              <select
                value={bookTreatment}
                onChange={(e) => setBookTreatment(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-800 bg-white outline-none focus:border-[#C81D77]"
              >
                {SIDRATU_TREATMENTS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Preferred Date & Time (9:00 AM – 7:30 PM)
              </label>
              <input
                type="datetime-local"
                value={bookDateTime}
                onChange={(e) => setBookDateTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-800 bg-white outline-none focus:border-[#C81D77]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Special Notes / Cycle Considerations (Optional)
              </label>
              <input
                type="text"
                value={bookNotes}
                onChange={(e) => setBookNotes(e.target.value)}
                placeholder="e.g., Currently in Follicular stage, sensitive skin around chin"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white outline-none focus:border-[#C81D77]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-[#3B0944] to-[#C81D77] hover:opacity-95 text-white font-display font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
              <span>Confirm New Appointment</span>
            </button>
          </form>

          {/* Saved Appointments List */}
          <div>
            <div className="text-xs font-bold text-slate-600 mb-2.5">
              Your Scheduled Sidratu Clinic Appointments ({(userData.appointments || []).length}):
            </div>
            {(userData.appointments || []).length === 0 ? (
              <div className="text-xs text-slate-500 italic p-3.5 rounded-2xl bg-cream border border-slate-200/70">
                No upcoming appointments booked yet. Use the scheduler above to book your visit!
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {(userData.appointments || []).map((appt) => (
                  <div
                    key={appt.id}
                    className="bg-cream rounded-2xl p-3 border border-slate-200/80 flex items-start justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{appt.treatmentType}</div>
                      <div className="text-slate-600 font-mono tabular-nums mt-0.5">
                        {formatHumanDate(appt.requestedDate)} at {appt.requestedTime} ·{' '}
                        <span className="text-sage-800 font-bold">{appt.status}</span>
                      </div>
                      {appt.notes && (
                        <div className="text-slate-500 mt-1 italic">"{appt.notes}"</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCancelAppointment(appt.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Cancel appointment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        )}
      </div>

      {/* STEP 3: PUBLIC COMMUNITY FEEDBACK BOARD */}
      {(activeSidratuSection === 'community' || activeSidratuSection === 'all') && (
      <section className="bg-white rounded-3xl shadow-sm border border-lavender-200 p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-lavender-700">
              05. Public Community Board
            </span>
            <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#C81D77]" />
              <span>Student Cycle & Sidratu Skincare Community Feed</span>
            </h3>
          </div>
        </div>

        <form onSubmit={handlePostComment} className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
          <input
            type="text"
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Share a tip, review a Sidratu treatment, or encourage fellow students..."
            className="md:col-span-7 px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm text-slate-800 bg-cream outline-none focus:border-lavender-500"
          />
          <select
            value={newCommentTreatment}
            onChange={(e) => setNewCommentTreatment(e.target.value)}
            className="md:col-span-3 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-cream outline-none"
          >
            <option value="">Optional: Tag Treatment</option>
            {SIDRATU_TREATMENTS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submittingComment}
            className="md:col-span-2 py-2.5 px-4 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-bold text-xs sm:text-sm transition-all"
          >
            Post Feedback
          </button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {comments.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl bg-cream border border-slate-200/80 p-4 flex flex-col justify-between gap-2"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                  <strong className="text-slate-900 font-bold">{c.userName}</strong>
                  <span className="font-mono tabular-nums text-[11px]">
                    {formatHumanDate(c.createdAt.split('T')[0])}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{c.commentText}</p>
              </div>
              <div className="text-[11px] text-lavender-700 font-medium pt-2 border-t border-slate-200/60">
                {c.stageTag || 'Campus Member'}
                {c.treatmentTag ? ` · ${c.treatmentTag}` : ''}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  );
};
