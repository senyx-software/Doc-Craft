import React from 'react';
import loginLeftImage from '../../assets/images/logo-left.png';

interface SplitAuthLayoutProps {
  id: string;
  leftHeading: string;
  rightHeading: React.ReactNode;
  rightSubheading?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const SplitAuthLayout: React.FC<SplitAuthLayoutProps> = ({
  id,
  leftHeading,
  rightHeading,
  rightSubheading,
  footer,
  children,
}) => {
  return (
    <div className="pt-16 h-screen w-full flex bg-appBg text-appTextPrimary font-sans overflow-hidden" id={id}>
      {/* Left panel — 50% width branded gradient matching user-frontend */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-between px-12 py-12 overflow-hidden select-none"
        style={{ background: 'linear-gradient(145deg, #7367F0 0%, #4A1F8C 45%, #170A2E 100%)' }}
      >
        <div className="self-start flex items-center gap-2">
          <span className="text-xl font-extrabold text-white tracking-tight">
            Doc<span className="text-white/70">Craft</span>
          </span>
          <span className="px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-extrabold bg-white/20 text-white rounded-md">
            Admin Control Plane
          </span>
        </div>

        <div className="flex-1 flex items-center justify-center w-full my-auto">
          <img src={loginLeftImage} alt="DocCraft AI" className="w-full max-w-[280px] drop-shadow-2xl animate-fade-in" />
        </div>

        <div className="text-center space-y-1.5">
          <h2 className="text-3xl font-extrabold text-white">{leftHeading}</h2>
          <p className="text-xs text-white/70 font-medium">Enterprise Management & Platform Monitoring</p>
        </div>
      </div>

      {/* Right panel — 50% form column matching user-frontend */}
      <div className="w-full lg:w-1/2 flex items-center justify-center h-full overflow-y-auto px-6 sm:px-14 py-10 bg-white dark:bg-neutral-950">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xl font-extrabold text-gray-900 dark:text-white">
              Doc<span className="text-purple-600 dark:text-purple-400">Craft</span>
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 rounded-md">
              Control Plane
            </span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{rightHeading}</h1>
            {rightSubheading && (
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-1.5 leading-relaxed">{rightSubheading}</p>
            )}
          </div>

          {children}

          {footer && <div className="pt-6 border-t border-gray-200/60 dark:border-white/10 mt-6">{footer}</div>}
        </div>
      </div>
    </div>
  );
};

export default SplitAuthLayout;
