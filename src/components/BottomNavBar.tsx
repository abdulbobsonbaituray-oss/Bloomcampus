import React from 'react';
import {
  Calendar,
  SmilePlus,
  Pill,
  TrendingUp,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

export type CoreNavSection =
  | 'tracker'
  | 'checkin'
  | 'guide'
  | 'analytics'
  | 'study'
  | 'sidratu';

interface BottomNavBarProps {
  activeSection: CoreNavSection;
  onSelectSection: (section: CoreNavSection) => void;
  cycleDay: number;
  hasLoggedMoodToday: boolean;
  waterGlassesToday: number;
  isDarkMode?: boolean;
}

interface NavItemConfig {
  id: CoreNavSection;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
  activeBg: string;
  activeText: string;
  activeIndicator: string;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeSection,
  onSelectSection,
  cycleDay,
  hasLoggedMoodToday,
  waterGlassesToday,
  isDarkMode = false,
}) => {
  const navItems: NavItemConfig[] = [
    {
      id: 'tracker',
      label: 'Cycle & LMP',
      shortLabel: 'Cycle',
      icon: Calendar,
      badge: `D${cycleDay}`,
      activeBg: isDarkMode ? 'bg-rose-950/80' : 'bg-rose-50',
      activeText: isDarkMode ? 'text-rose-300' : 'text-rose-700',
      activeIndicator: 'bg-rose-500',
    },
    {
      id: 'checkin',
      label: 'Mood & Log',
      shortLabel: 'Daily Log',
      icon: SmilePlus,
      badge: hasLoggedMoodToday ? '✓' : undefined,
      activeBg: isDarkMode ? 'bg-lavender-950/80' : 'bg-lavender-50',
      activeText: isDarkMode ? 'text-lavender-300' : 'text-lavender-800',
      activeIndicator: 'bg-lavender-600',
    },
    {
      id: 'guide',
      label: 'Edu & Contraception',
      shortLabel: 'Edu & Guide',
      icon: Pill,
      activeBg: isDarkMode ? 'bg-peach-950/80' : 'bg-peach-50',
      activeText: isDarkMode ? 'text-peach-300' : 'text-peach-800',
      activeIndicator: 'bg-peach-500',
    },
    {
      id: 'analytics',
      label: 'Trends & Fuel',
      shortLabel: 'Trends',
      icon: TrendingUp,
      badge: waterGlassesToday > 0 ? `${waterGlassesToday}/8💧` : undefined,
      activeBg: isDarkMode ? 'bg-sage-950/80' : 'bg-sage-50',
      activeText: isDarkMode ? 'text-sage-300' : 'text-sage-800',
      activeIndicator: 'bg-sage-600',
    },
    {
      id: 'study',
      label: 'Study Sync',
      shortLabel: 'Study',
      icon: GraduationCap,
      activeBg: isDarkMode ? 'bg-indigo-950/80' : 'bg-lavender-50',
      activeText: isDarkMode ? 'text-indigo-300' : 'text-lavender-900',
      activeIndicator: 'bg-lavender-700',
    },
    {
      id: 'sidratu',
      label: 'Sidratu AI',
      shortLabel: 'Sidratu AI',
      icon: Sparkles,
      activeBg: 'bg-[#3B0944]',
      activeText: 'text-[#D4AF37]',
      activeIndicator: 'bg-[#D4AF37]',
    },
  ];

  return (
    <nav
      aria-label="Primary Bottom Navigation"
      className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl transition-colors no-print ${
        isDarkMode
          ? 'bg-slate-900/95 border-slate-800 shadow-[0_-8px_30px_rgba(0,0,0,0.45)]'
          : 'bg-white/95 border-lavender-200/90 shadow-[0_-8px_25px_rgba(86,57,204,0.08)]'
      }`}
    >
      <div className="max-w-5xl mx-auto px-1.5 sm:px-4 py-1.5 sm:py-2">
        <div className="grid grid-cols-6 gap-1 sm:gap-2">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative group flex flex-col items-center justify-center py-1.5 sm:py-2 px-1 rounded-2xl transition-all cursor-pointer select-none ${
                  isActive
                    ? `${item.activeBg} ${item.activeText} font-extrabold shadow-2xs scale-[1.02]`
                    : isDarkMode
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 font-semibold'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70 font-semibold'
                }`}
              >
                {/* Top Active Pill Bar */}
                {isActive && (
                  <span
                    className={`absolute top-0.5 w-6 sm:w-8 h-1 rounded-full ${item.activeIndicator}`}
                  />
                )}

                <div className="relative flex items-center justify-center mt-0.5">
                  <IconComponent
                    className={`w-5 h-5 sm:w-5 sm:h-5 transition-transform duration-150 ${
                      isActive ? 'scale-110 stroke-[2.5]' : 'group-hover:scale-105 stroke-[2]'
                    }`}
                  />
                  {item.badge && (
                    <span
                      className={` -top-1.5 -right-3.5 absolute px-1 py-0.2 rounded-full text-[9px] font-extrabold leading-tight tabular-nums ${
                        isActive
                          ? item.id === 'sidratu'
                            ? 'bg-[#D4AF37] text-[#3B0944]'
                            : 'bg-slate-900 text-white'
                          : isDarkMode
                          ? 'bg-slate-800 text-slate-300 border border-slate-700'
                          : 'bg-lavender-100 text-lavender-900'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>

                <span className="mt-1 text-[10px] sm:text-xs leading-tight tracking-tight truncate max-w-full">
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
