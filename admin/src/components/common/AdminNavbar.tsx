import React from 'react';
import { Sun, Moon, Shield } from 'lucide-react';
import logoForLightMode from '../../assets/images/logo-left1.png';
import logoForDarkMode from '../../assets/images/logo-left.png';
import { useThemeStore } from '../../store/themeStore';

const AdminNavbar: React.FC = () => {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center bg-gradient-to-br from-purple-500/10 to-white dark:from-purple-950/20 dark:to-neutral-950 border-b border-gray-200/60 dark:border-white/10 backdrop-blur-md px-4 sm:px-8">
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-2.5">
          <img
            src={theme === 'dark' ? logoForDarkMode : logoForLightMode}
            alt="DocCraft"
            className="w-8 h-8 object-contain"
          />
          <span className="text-xl font-extrabold text-gray-900 dark:text-white">
            Doc<span className="text-purple-600 dark:text-purple-400">Craft</span>
          </span>
          <span className="ml-1 text-xs font-semibold px-2.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 rounded-md flex items-center gap-1">
            <Shield size={12} /> Admin
          </span>
        </div>

        {/* Public Navigation Links matching user-frontend */}
        <div className="hidden md:flex items-center gap-8">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer">
            Features
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer">
            Solution
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer">
            Pricing
          </span>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 cursor-pointer">
            About
          </span>
        </div>

        {/* Action Controls & Theme Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-md bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:text-purple-600 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-purple-600" />}
          </button>
          <button className="hidden sm:inline-block px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-purple-600">
            Sign In
          </button>
          <button className="px-4 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-md shadow-sm">
            Get Started
          </button>
        </div>
      </div>
    </nav>
  );
};

export default AdminNavbar;
