import React, { useState } from 'react';
import { BookOpen, Sparkles, Plus, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import { AcademicTask, CycleMetrics, UserData } from '../types';
import { PHASE_ADVISOR_DATA } from '../constants';
import {
  calculateCycleMetrics,
  formatDateISO,
  formatHumanDate,
} from '../utils/cycleEngine';

interface StudyExamSyncPlannerProps {
  userData: UserData;
  selectedDateStr: string;
  metrics: CycleMetrics;
  onUpdateUser: (updater: (prev: UserData) => UserData) => void;
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const StudyExamSyncPlanner: React.FC<StudyExamSyncPlannerProps> = ({
  userData,
  selectedDateStr,
  metrics,
  onUpdateUser,
  showToast,
}) => {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const nextWeek = new Date(Date.now() + 7 * 86400000);
    return formatDateISO(nextWeek);
  });
  const [taskType, setTaskType] = useState<AcademicTask['type']>('Exam');

  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<{
    studyStrategy: string;
    skincareTip: string;
    bodyNutritionTip: string;
  } | null>(null);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      showToast('Please enter the exam/assignment title and date.', 'warning');
      return;
    }
    const newTask: AcademicTask = {
      id: `task-${Date.now()}`,
      title: title.trim(),
      course: course.trim() || 'Campus Course',
      dueDate,
      type: taskType,
      completed: false,
    };
    onUpdateUser((prev) => ({
      ...prev,
      academicTasks: [...(prev.academicTasks || []), newTask].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate)
      ),
    }));
    setTitle('');
    setCourse('');
    showToast('📚 Added to your Cycle-Synced Academic Planner!', 'success');
  };

  const toggleTaskDone = (id: string) => {
    onUpdateUser((prev) => ({
      ...prev,
      academicTasks: (prev.academicTasks || []).map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    }));
  };

  const deleteTask = (id: string) => {
    onUpdateUser((prev) => ({
      ...prev,
      academicTasks: (prev.academicTasks || []).filter((t) => t.id !== id),
    }));
  };

  const generateAiDailyBriefing = async () => {
    setAiPlanLoading(true);
    try {
      const currentLog = userData.dailyLogs[selectedDateStr] || {
        mood: null,
        symptoms: [],
      };
      const upcomingList = (userData.academicTasks || [])
        .filter((t) => !t.completed)
        .map((t) => `${t.title} (${t.dueDate})`)
        .join(', ');

      const res = await fetch('/api/ai/cycle-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageName: PHASE_ADVISOR_DATA[metrics.stageKey].name,
          cycleDay: metrics.cycleDay,
          mood: currentLog.mood,
          symptoms: currentLog.symptoms,
          skincareGoal: userData.skincareGoal,
          upcomingExams: upcomingList,
        }),
      });
      const data = await res.json();
      if (res.ok && data.studyStrategy) {
        setAiPlan(data);
        showToast('✨ Generated your personalized Cycle, Study & Skincare Briefing!', 'success');
      } else {
        throw new Error(data.error || 'Could not generate');
      }
    } catch {
      const stageInfo = PHASE_ADVISOR_DATA[metrics.stageKey];
      setAiPlan({
        studyStrategy: stageInfo.study,
        skincareTip: stageInfo.skincareSync,
        bodyNutritionTip: stageInfo.craving,
      });
    } finally {
      setAiPlanLoading(false);
    }
  };

  const getStageCoachingForTask = (taskDateStr: string) => {
    const taskMetrics = calculateCycleMetrics(userData, taskDateStr);
    const stageInfo = PHASE_ADVISOR_DATA[taskMetrics.stageKey];
    let actionAdvice = '';
    if (taskMetrics.stageKey === 'MENSTRUATION') {
      actionAdvice =
        '🩸 Falls during Menstruation (Day ' +
        taskMetrics.cycleDay +
        '): Finish heavy memorization 3 days early so you can do light review and rest!';
    } else if (taskMetrics.stageKey === 'FOLLICULAR') {
      actionAdvice =
        '🌱 Falls during Follicular (Day ' +
        taskMetrics.cycleDay +
        '): Rising estrogen gives you sharp memory and problem-solving speed!';
    } else if (taskMetrics.stageKey === 'OVULATION') {
      actionAdvice =
        '🌸 Falls during Ovulation (Day ' +
        taskMetrics.cycleDay +
        '): Peak verbal confidence & energy—ideal for presentations and exams!';
    } else {
      actionAdvice =
        '🌙 Falls during Luteal (Day ' +
        taskMetrics.cycleDay +
        '): Break study blocks into 30-min Pomodoro sprints and sleep 7+ hours.';
    }
    return { taskMetrics, stageInfo, actionAdvice };
  };

  return (
    <section className="bg-white rounded-3xl shadow-sm border border-lavender-200 p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-lavender-700">
            Academic & Hormone Sync
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-lavender-700" />
            <span>College Exam, Assignment & Cycle Stage Planner</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            Enter your upcoming exams, papers, or presentations to see which hormone stage they land on—so you never get caught off-guard during exam week.
          </p>
        </div>

        <button
          type="button"
          onClick={generateAiDailyBriefing}
          disabled={aiPlanLoading}
          className="self-start sm:self-auto px-4 py-2.5 rounded-2xl bg-gradient-to-r from-lavender-700 to-rose-600 hover:from-lavender-900 hover:to-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all shrink-0 disabled:opacity-60"
        >
          <Sparkles className="w-4 h-4" />
          <span>{aiPlanLoading ? 'Generating Plan...' : 'Generate Daily Study & Skin Plan'}</span>
        </button>
      </div>

      {aiPlan && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-lavender-50/70 p-4 rounded-2xl border border-lavender-200">
          <div className="bg-white rounded-xl p-3.5 border border-slate-200/80">
            <div className="text-xs font-bold text-lavender-900 mb-1">📚 Today's Study Strategy</div>
            <p className="text-xs text-slate-700 leading-relaxed">{aiPlan.studyStrategy}</p>
          </div>
          <div className="bg-white rounded-xl p-3.5 border border-slate-200/80">
            <div className="text-xs font-bold text-[#C81D77] mb-1">✨ Cycle Skincare & Sidratu Tip</div>
            <p className="text-xs text-slate-700 leading-relaxed">{aiPlan.skincareTip}</p>
          </div>
          <div className="bg-white rounded-xl p-3.5 border border-slate-200/80">
            <div className="text-xs font-bold text-sage-800 mb-1">🥗 Body & Nutrition Sync</div>
            <p className="text-xs text-slate-700 leading-relaxed">{aiPlan.bodyNutritionTip}</p>
          </div>
        </div>
      )}

      {/* Add Exam / Assignment Form */}
      <form
        onSubmit={handleAddTask}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 bg-cream p-4 rounded-2xl border border-slate-200/80"
      >
        <div className="lg:col-span-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Exam / Assignment Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Anatomy Final Exam"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium bg-white outline-none focus:border-lavender-500"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Course Code
          </label>
          <input
            type="text"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="e.g., MED 101"
            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium bg-white outline-none focus:border-lavender-500"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Type
          </label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as AcademicTask['type'])}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-700 bg-white outline-none"
          >
            <option value="Exam">Exam</option>
            <option value="Assignment">Assignment</option>
            <option value="Presentation">Presentation</option>
            <option value="Study Session">Study Session</option>
          </select>
        </div>
        <div className="lg:col-span-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
            Due / Exam Date
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-800 bg-white outline-none"
          />
        </div>
        <div className="lg:col-span-2 flex items-end">
          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </div>
      </form>

      {/* Tasks List with Predicted Cycle Stage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(userData.academicTasks || []).length === 0 ? (
          <div className="md:col-span-2 text-xs text-slate-500 italic p-4 rounded-2xl bg-cream border border-slate-200/70">
            No upcoming exams or assignments added yet. Add a deadline above to see which cycle stage it lands on!
          </div>
        ) : (
          (userData.academicTasks || []).map((task) => {
            const { actionAdvice } = getStageCoachingForTask(task.dueDate);
            return (
              <div
                key={task.id}
                className={`rounded-2xl p-4 border transition-all flex items-start justify-between gap-3 ${
                  task.completed
                    ? 'bg-slate-50 border-slate-200 opacity-70'
                    : 'bg-cream border-lavender-200 shadow-xs'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleTaskDone(task.id)}
                    className="mt-0.5 text-lavender-700 hover:text-lavender-900"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-sage-600" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span
                        className={`font-display font-bold text-sm text-slate-900 ${
                          task.completed ? 'line-through' : ''
                        }`}
                      >
                        {task.title}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-lavender-700">{task.course}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {formatHumanDate(task.dueDate)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 mt-1 leading-relaxed">{actionAdvice}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="text-slate-400 hover:text-rose-600 p-1 shrink-0"
                  title="Delete exam/task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
