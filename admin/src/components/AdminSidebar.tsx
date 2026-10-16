import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { ADMIN_NAV_SECTIONS } from '../config/adminNavSections';

interface AdminSidebarProps {
  activeItem: string;
  onSelect: (id: string) => void;
}

// Each category group gets its own accent so the sidebar reads as distinct
// zones (Overview / Customers & Revenue / Product & Content / Operations /
// System) rather than one uniform purple wash — still the same solid
// same-hue gradient "pill" treatment as the reference template's
// menu-link.active, just re-hued per category.
const CATEGORY_COLORS: Record<string, { pill: string; badge: string }> = {
  'Overview': {
    pill: 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_2px_6px_0_rgba(115,103,240,0.45)] font-medium',
    badge: 'bg-purple-500/15 dark:bg-purple-400/20 text-purple-600 dark:text-purple-300',
  },
  'Customers & Revenue': {
    pill: 'bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-[0_2px_6px_0_rgba(29,78,216,0.45)] font-medium',
    badge: 'bg-blue-500/15 dark:bg-blue-400/20 text-blue-700 dark:text-blue-300',
  },
  'Product & Content': {
    pill: 'bg-gradient-to-r from-green-700 to-green-600 text-white shadow-[0_2px_6px_0_rgba(21,128,61,0.45)] font-medium',
    badge: 'bg-green-500/15 dark:bg-green-400/20 text-green-700 dark:text-green-300',
  },
  'Operations': {
    pill: 'bg-gradient-to-r from-red-400 to-red-300 text-white shadow-[0_2px_6px_0_rgba(248,113,113,0.45)] font-medium',
    badge: 'bg-red-500/15 dark:bg-red-400/20 text-red-600 dark:text-red-300',
  },
  'System': {
    pill: 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-[0_2px_6px_0_rgba(79,70,229,0.45)] font-medium',
    badge: 'bg-indigo-500/15 dark:bg-indigo-400/20 text-indigo-600 dark:text-indigo-300',
  },
};
const DEFAULT_CATEGORY_COLOR = CATEGORY_COLORS['Overview'];

const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeItem, onSelect }) => {
  const sections = ADMIN_NAV_SECTIONS;

  // `category` is only set on the first section of each group (divider
  // logic needs the change-point, not every row) — carry it forward here so
  // every section, including the rest of its group, resolves to a color.
  const effectiveCategories = sections.map((_, index) => sections.slice(0, index + 1).reverse().find(section => section.category)?.category || 'Overview');

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Home': true,
    'Users': true,
    'Subscriptions': false,
    'Revenue': false,
    'Generations': false,
    'Analytics': false,
    'Security': false,
    'Promotions': false,
    'Packages': false,
    'Notifications': false,
    'Documents': false,
    'Infrastructure': false,
    'Support': false,
    'Settings': false
  });

  const toggleSection = (title: string) => {
    setOpenSections(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  return (
    <aside className="w-64 h-full bg-white/80 dark:bg-neutral-900/90 backdrop-blur-xl border-r border-gray-200/60 dark:border-white/10 flex flex-col justify-between select-none z-30 flex-shrink-0 text-left transition-all">
      <div className="flex-1 overflow-y-auto pr-1">
        {/* Nav */}
        <div className="p-3 space-y-0.5 pt-4">
          {sections.map((sec, index) => {
            const colors = CATEGORY_COLORS[effectiveCategories[index]] ?? DEFAULT_CATEGORY_COLOR;

            // Category dividers group sections by what an admin is actually
            // trying to do (Overview / Customers & Revenue / Product &
            // Content / Operations / System), not build order — only
            // rendered when the category changes from the section above it.
            const showDivider = sec.category && sec.category !== sections[index - 1]?.category;
            const divider = showDivider && (
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-600">
                {sec.category}
              </p>
            );

            // A section with exactly one page (e.g. "Home" → "Dashboard")
            // is a direct link, mirroring how Kanban/Chat/Calendar behave
            // as single-line items in the reference template rather than
            // single-item accordions.
            if (sec.items.length === 1) {
              const item = sec.items[0];
              const isActive = activeItem === item.id;
              return (
                <div key={sec.title}>
                  {divider}
                  <button
                    onClick={() => onSelect(item.id)}
                    className={`w-full mb-0.5 flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                      isActive
                        ? colors.pill
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                    }`}
                  >
                    {sec.icon}
                    <span>{sec.title}</span>
                  </button>
                </div>
              );
            }

            const isOpen = openSections[sec.title];
            const sectionHasActiveItem = sec.items.some((item) => item.id === activeItem);

            return (
              <div key={sec.title}>
                {divider}

                <button
                  onClick={() => toggleSection(sec.title)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                    isOpen || sectionHasActiveItem
                      ? 'bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {sec.icon}
                    {sec.title}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                      {sec.items.length}
                    </span>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>

                {isOpen && (
                  <div className="mt-0.5 mb-1 space-y-0.5">
                    {sec.items.map((item) => {
                      const isActive = activeItem === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => onSelect(item.id)}
                          className={`w-full flex items-center gap-2.5 pl-9 pr-3 py-1.5 text-[13px] rounded-md transition-colors text-left truncate ${
                            isActive
                              ? colors.pill
                              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                          }`}
                          title={item.label}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isActive ? 'bg-white' : 'border border-gray-400 dark:border-gray-600'
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer status strip */}
      <div className="p-3 border-t border-gray-200/60 dark:border-white/10 bg-gray-50/50 dark:bg-black/20 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
        <span className="flex items-center gap-1 font-mono text-[10px]">
          <Clock size={10} /> API :3018 (Online)
        </span>
        <span className="font-mono text-[10px]">v2.0</span>
      </div>
    </aside>
  );
};

export default AdminSidebar;
