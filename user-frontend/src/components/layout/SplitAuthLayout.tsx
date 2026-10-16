import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import loginLeftImage from '../../assets/images/logo-left.png';

interface SplitAuthLayoutProps {
  id: string;
  leftHeading: string;
  rightHeading: React.ReactNode;
  rightSubheading?: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}

// Full-screen, two-panel auth shell (Login / Register) — left is a branded
// purple-gradient panel (50%) with the product illustration centered,
// right is the actual form (50%): logo, heading, form and the sign in/up
// switch link all grouped into one block, vertically centered as a whole
// rather than pinned to the top/bottom edges.
const SplitAuthLayout: React.FC<SplitAuthLayoutProps> = ({
  id,
  leftHeading,
  rightHeading,
  rightSubheading,
  footer,
  children,
}) => {
  return (
    // pt-14 clears the fixed navbar (h-14) that sits on top of every route,
    // this one included; the two panels then fill exactly what's left of
    // the viewport below it.
    <div className="pt-14 h-screen w-full flex" id={id}>
      {/* Left panel — gradient runs from the exact purple used on the
          Sign In / primary button (brand-400, #7E4CE0) down to a deep
          near-black purple, matching the "Sign In button purple + dark
          purple" brief. */}
      <div
        className="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-between px-12 py-12 overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #7E4CE0 0%, #4A1F8C 45%, #170A2E 100%)' }}
      >
        <Link to="/" className="self-start">
          <span className="text-lg font-bold text-white">
            Doc<span className="text-white/70">Craft</span>
          </span>
        </Link>

        <div className="flex-1 flex items-center justify-center w-full">
          <img src={loginLeftImage} alt="" className="w-full max-w-[260px] drop-shadow-2xl" />
        </div>

        <h2 className="text-3xl font-extrabold text-white text-center">{leftHeading}</h2>
      </div>

      {/* Right panel — form column. Everything (logo, heading, form,
          footer) lives inside one vertically-centered block instead of
          being pinned to the top/bottom edges. */}
      <div className="w-full lg:w-1/2 flex items-center justify-center h-full overflow-y-auto px-6 sm:px-14 py-10">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <Link to="/" className="flex items-center gap-2 mb-8">
            <span className="text-lg font-bold text-appTextPrimary">
              Doc<span className="text-brand-400">Craft</span>
            </span>
          </Link>

          <div className="mb-8">
            <h1 className="text-heading-h3 font-bold text-appTextPrimary">{rightHeading}</h1>
            {rightSubheading && (
              <p className="text-appTextSecondary text-body-sm mt-1.5">{rightSubheading}</p>
            )}
          </div>

          {children}

          <div className="pt-6">{footer}</div>
        </motion.div>
      </div>
    </div>
  );
};

export default SplitAuthLayout;
