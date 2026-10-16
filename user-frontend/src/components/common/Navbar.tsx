import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LogOut,
  User as UserIcon,
  Menu,
  X,
  Sparkles,
  Sun,
  Moon,
  ExternalLink,
  Home,
  LayoutDashboard
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import Button from '../ui/Button';
// logo-left1 (dark charcoal + purple line art) reads clearly against the
// light navbar; logo-left (white + blue line art) is the dark-mode
// counterpart, since a dark mark would disappear against a dark navbar.
import logoForLightMode from '../../assets/images/logo-left1.png';
import logoForDarkMode from '../../assets/images/logo-left.png';
import LogoutConfirmModal from './LogoutConfirmModal';

const Navbar: React.FC = () => {
  const { user, isAuthenticated, isGuest, logout } = useAuthStore();
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setShowLogoutModal(false);
      navigate('/');
    } catch {
      // Continue cleanup even on error
      setShowLogoutModal(false);
      navigate('/');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  const isBuilderPage = location.pathname === '/builder';
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const showPublicNav = isLandingPage || isAuthPage || location.pathname === '/pricing' || location.pathname === '/verify-email' || location.pathname === '/password-reset';

  const scrollToSection = (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-14 flex items-center bg-gradient-to-br from-brand-200/12 to-white dark:from-brand-500/8 dark:to-appSurface border-b border-brand-300/30 ${
        scrolled ? 'backdrop-blur-md shadow-sm' : ''
      }`}
    >
      <div className="w-full h-full pl-4 sm:pl-6 lg:pl-8">
        <div className="flex items-stretch justify-between h-full">
          {/* Logo — always goes to the actual landing page. Signed-in users
              use /?preview=1 so LandingPage's auto-redirect-to-/dashboard
              effect doesn't immediately bounce them straight back. */}
          <Link to={isAuthenticated ? '/?preview=1' : '/'} className="flex items-center gap-2.5 group flex-shrink-0" id="navbar-logo">
            <img
              src={theme === 'dark' ? logoForDarkMode : logoForLightMode}
              alt=""
              className="w-8 h-8 object-contain"
            />
            <span className="text-xl font-bold text-appTextPrimary">
              Doc<span className="text-appPrimary">Craft</span>
            </span>
          </Link>

          {/* Desktop Nav Links — Show all public tabs except Admin */}
          {showPublicNav && (
            <div className="hidden md:flex items-center gap-8 mx-auto">
              <a
                href="#features"
                onClick={scrollToSection('features')}
                className="text-sm font-medium text-appTextSecondary hover:text-appTextPrimary transition-colors"
                id="nav-features"
              >
                Features
              </a>
              <a
                href="#solution"
                onClick={scrollToSection('solution')}
                className="text-sm font-medium text-appTextSecondary hover:text-appTextPrimary transition-colors"
                id="nav-solution"
              >
                Solution
              </a>
              <a
                href="#pricing"
                onClick={scrollToSection('pricing')}
                className="text-sm font-medium text-appTextSecondary hover:text-appTextPrimary transition-colors"
                id="nav-pricing"
              >
                Pricing
              </a>
              <a
                href="#about"
                onClick={scrollToSection('about')}
                className="text-sm font-medium text-appTextSecondary hover:text-appTextPrimary transition-colors"
                id="nav-about"
              >
                About
              </a>
            </div>
          )}

          {/* Desktop Action Buttons & Theme Toggle (Right) — plain icon
              cluster (no border/background boxes), matching a minimal
              utility-header pattern like Esri's site masthead. Identity and
              Sign Out live inside the profile dropdown, not as separate
              top-level controls. */}
          <div className="hidden md:flex items-center gap-1 pr-4 sm:pr-6 lg:pr-8 flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 text-appTextSecondary hover:text-appTextPrimary transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {isAuthenticated ? (
              <>
                {/* On the Builder page, a plain Home icon isn't useful mid-
                    session — a labeled Dashboard link back to the account
                    is. Everywhere else (away from the landing page itself,
                    where there's nothing to "go home" to), keep the icon. */}
                {isBuilderPage ? (
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-appTextSecondary hover:text-appTextPrimary transition-colors"
                    id="nav-dashboard"
                  >
                    <LayoutDashboard size={16} /> Dashboard
                  </Link>
                ) : (
                  !isLandingPage && (
                    <Link
                      to="/?preview=1"
                      className="p-2 text-appTextSecondary hover:text-appTextPrimary transition-colors"
                      title="Back to Landing Page"
                      id="nav-home"
                    >
                      <Home size={16} />
                    </Link>
                  )
                )}

                <div className="relative" ref={profileMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen((v) => !v)}
                    className="p-2 text-appTextSecondary hover:text-appTextPrimary transition-colors"
                    id="nav-profile-trigger"
                    aria-label="Account menu"
                  >
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <UserIcon size={16} />
                    )}
                  </button>

                  {profileMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-appSurface border border-appBorder rounded-none shadow-xl z-50 overflow-hidden text-left">
                      <div className="px-4 py-3 border-b border-appBorder">
                        <p className="text-sm font-semibold text-appTextPrimary truncate">
                          {isGuest ? 'Guest User' : (user?.full_name || (user?.email ? user.email.split('@')[0] : 'User'))}
                        </p>
                        {!isGuest && user?.email && (
                          <p className="text-xs text-appTextSecondary truncate mt-0.5">{user.email}</p>
                        )}
                      </div>

                      {/* Already shown directly in the navbar as a labeled
                          link while on the Builder page — no need to
                          duplicate it here too. */}
                      {!isBuilderPage && (
                        <Link
                          to="/dashboard"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-appTextPrimary hover:bg-appTextPrimary/[0.04] transition-colors"
                          id="nav-dropdown-dashboard"
                        >
                          <LayoutDashboard size={15} /> Dashboard
                        </Link>
                      )}

                      {/* Profile & Settings now lives at its own dashboard
                          side-nav route rather than a separate /profile
                          route, so this links straight there. */}
                      {!isGuest && (
                        <Link
                          to="/dashboard/profile"
                          onClick={() => setProfileMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-appTextPrimary hover:bg-appTextPrimary/[0.04] transition-colors"
                          id="nav-dropdown-profile"
                        >
                          <UserIcon size={15} /> Profile
                        </Link>
                      )}

                      <button
                        onClick={() => { setProfileMenuOpen(false); handleLogoutClick(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-appError hover:bg-appError/5 transition-colors border-t border-appBorder"
                        id="nav-dropdown-logout"
                      >
                        <LogOut size={15} /> Sign Out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3 ml-2">
                <Link to="/login">
                  <Button variant="ghost" size="sm" id="nav-login">
                    Sign In
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="sm" id="nav-register">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 md:hidden pr-4 sm:pr-6 flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 text-appTextSecondary hover:text-appTextPrimary transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="p-2 text-appTextSecondary hover:text-appTextPrimary transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              id="nav-mobile-toggle"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="absolute top-14 left-0 right-0 md:hidden bg-appBg/95 backdrop-blur-lg border-b border-appBorder shadow-lg animate-fade-in z-50">
          <div className="px-4 py-4 space-y-2">
            {showPublicNav && (
              <>
                <a
                  href="#features"
                  className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={(e) => { scrollToSection('features')(e); setMobileOpen(false); }}
                >
                  Features
                </a>
                <a
                  href="#solution"
                  className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={(e) => { scrollToSection('solution')(e); setMobileOpen(false); }}
                >
                  Solution
                </a>
                <a
                  href="#pricing"
                  className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={(e) => { scrollToSection('pricing')(e); setMobileOpen(false); }}
                >
                  Pricing
                </a>
                <a
                  href="#about"
                  className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={(e) => { scrollToSection('about')(e); setMobileOpen(false); }}
                >
                  About
                </a>
              </>
            )}

            <div className="h-px bg-appBorder my-2" />

            {isAuthenticated ? (
              <>
                <Link
                  to="/dashboard"
                  className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <Sparkles size={16} className="text-appPrimary" />
                    Dashboard
                  </div>
                </Link>
                <a
                  href="/?preview=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <ExternalLink size={16} />
                    Landing Page
                  </div>
                </a>
                {!isGuest && (
                  <Link
                    to="/dashboard/profile"
                    className="block px-4 py-2.5 rounded-none text-appTextPrimary hover:bg-appSurface transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    <div className="flex items-center gap-3">
                      <UserIcon size={16} />
                      <span>{user?.full_name || (user?.email ? user.email.split('@')[0] : 'Profile')}</span>
                    </div>
                  </Link>
                )}
                <button
                  onClick={() => { handleLogoutClick(); setMobileOpen(false); }}
                  className="w-full text-left px-4 py-2.5 rounded-none text-appError hover:bg-appSurface transition-colors"
                  id="nav-logout-mobile"
                >
                  <div className="flex items-center gap-3">
                    <LogOut size={16} />
                    Sign Out
                  </div>
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Link
                  to="/login"
                  className="block w-full py-2 text-center rounded-none border border-appBorder text-appTextPrimary hover:bg-appSurface transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="block w-full py-2 text-center rounded-none bg-appPrimary text-white hover:bg-appPrimary/90 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
        isLoading={isLoggingOut}
      />
    </nav>
  );
};

export default Navbar;
