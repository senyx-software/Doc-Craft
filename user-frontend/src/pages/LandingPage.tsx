import React, { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  FileText,
  FileSearch,
  Receipt,
  ShoppingCart,
  ArrowRight,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Settings,
  MessageSquare,
  Palette,
  Download,
  Target,
  Rocket,
} from 'lucide-react';
import { usePlanCatalog } from '../hooks/usePlanCatalog';
import PricingTierCard from '../components/landing/PricingTierCard';
import { useAuthStore } from '../store/authStore';
import { DOCUMENT_TYPES } from '../types';
import heroVideo from '../assets/video/hero.mp4';
import { trackButtonClick } from '../api/analytics';

const heroDocIcons: Record<string, React.ReactNode> = {
  FileText: <FileText size={26} />,
  FileSearch: <FileSearch size={26} />,
  Receipt: <Receipt size={26} />,
  ShoppingCart: <ShoppingCart size={26} />,
};

// Apple's own CTA buttons are plain pills — solid light on a dark/photo
// background — not the app-wide rounded-none Button component (that's a
// deliberate, separate design language used everywhere else). Scoped to
// this page only.
const applePillLight =
  'inline-flex items-center justify-center rounded-full bg-white text-[#1d1d1f] text-[15px] sm:text-base font-normal px-6 py-3 hover:bg-white/90 transition-colors';

const LandingPage: React.FC = () => {
  const { plans, error: planError } = usePlanCatalog();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // ?preview=1 lets signed-in users open the public landing page (e.g. via
    // the navbar's "Open landing page" button) without being bounced
    // straight back to /dashboard.
    if (isAuthenticated && searchParams.get('preview') !== '1') {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  // Invoice/Quotation/Receipt/Purchase Order cards: signed-in visitors jump
  // straight into that document type's chat session (via /builder?type=...,
  // which BuilderPage auto-selects and skips the "What would you like to
  // create?" screen for); signed-out visitors go to /login first, carrying
  // the same destination (including the type param) so they land in the
  // actual chat after signing in instead of back on a bare selector.
  const handleSelectDocumentType = (type: string) => {
    const target = `/builder?type=${type}`;
    if (isAuthenticated) {
      navigate(target);
    } else {
      navigate('/login', { state: { from: { pathname: '/builder', search: `?type=${type}` } } });
    }
  };

  // Generic "Get Started" CTAs (hero + pricing cards) don't name a specific
  // document type, so they default to Invoice — same skip-the-selector
  // behavior as clicking a specific document-type card.
  const handleStartCreating = () => {
    trackButtonClick('btn_start_creating_click');
    handleSelectDocumentType('invoice');
  };

  const scrollToId = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // The page itself is the scroll container now (not the window — see the
  // snap-y wrapper below), so scroll progress has to be tracked against it
  // explicitly. A couple of independently-scaled transforms feed background
  // glow blobs a subtle depth-on-scroll drift, Apple-style.
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: containerRef });
  const glowY1 = useTransform(scrollYProgress, [0, 1], [0, -160]);
  const glowY2 = useTransform(scrollYProgress, [0, 1], [0, 160]);

  return (
    <motion.div
      // Apple-style screen-to-screen scrolling: this container IS the
      // scrollable viewport (not the window), so each snap-start section
      // below locks into place as you scroll past its midpoint. font-apple
      // swaps in the system SF Pro stack for this page only — the rest of
      // the app (Builder, Dashboard) keeps its usual Poppins.
      className="font-apple h-screen overflow-y-scroll overflow-x-hidden snap-y snap-mandatory scroll-smooth bg-white text-[#1d1d1f] pt-14"
      id="landing-page"
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* 1. Hero — full-bleed video, unobstructed (no tint layer), with a
          minimal centered text block near the bottom third, the way Apple's
          own product pages (e.g. Vision Pro) lead with the shot itself and
          keep copy short. hero.mp4 is a placeholder until real footage is
          supplied — swap the <source> below when it lands. */}
      <section className="relative w-full h-screen overflow-hidden snap-start flex flex-col" id="hero">
        <video className="absolute inset-0 w-full h-full object-cover" autoPlay loop muted playsInline>
          <source src={heroVideo} type="video/mp4" />
        </video>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-end text-center px-4 pb-20 sm:pb-28">
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-base sm:text-lg font-medium text-white/90 drop-shadow mb-2">DocCraft</p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-white leading-[1.05] drop-shadow-lg max-w-3xl mx-auto">
              Create documents at the speed of thought.
            </h1>
            <p className="text-base sm:text-lg text-white/90 font-normal mt-4 max-w-xl mx-auto drop-shadow">
              Invoices, quotations, receipts, and purchase orders — done in seconds, not afternoons.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
              <button type="button" className={applePillLight} onClick={handleStartCreating} id="hero-cta">
                Get Started
              </button>
              <a href="#choose" onClick={scrollToId('choose')} className="inline-flex items-center gap-1 text-white text-[15px] sm:text-base font-normal hover:underline underline-offset-4 drop-shadow">
                Explore documents <ArrowRight size={15} />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Choose your document — an Apple product-grid: plain white cards,
          one clear icon, bold title, minimal color. This is the "four
          documents" that used to live crammed into the hero — it reads
          better as its own deliberate screen, the way Apple follows a hero
          shot with a clean product lineup. */}
      <section className="relative min-h-screen w-full flex items-center overflow-hidden snap-start px-4 py-20 bg-white" id="choose">
        <div className="relative z-10 max-w-6xl mx-auto w-full">
          <motion.div
            className="text-center mb-14"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[#1d1d1f]">
              Every document. One place.
            </h2>
            <p className="text-lg sm:text-xl text-[#6e6e73] font-normal max-w-2xl mx-auto mt-4">
              Pick a type to start. The assistant handles the rest.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {DOCUMENT_TYPES.map((doc, i) => (
              <motion.button
                type="button"
                key={doc.type}
                onClick={() => handleSelectDocumentType(doc.type)}
                id={`hero-doc-${doc.type}`}
                whileHover={{ y: -4 }}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="p-8 rounded-2xl bg-[#f5f5f7] hover:bg-[#ececee] transition-colors duration-300 text-center flex flex-col items-center gap-4"
              >
                <div className="w-14 h-14 rounded-full bg-appPrimary/10 text-appPrimary flex items-center justify-center">
                  {heroDocIcons[doc.icon]}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">{doc.label}</h3>
                  <p className="text-sm text-[#6e6e73] mt-1.5 leading-relaxed">{doc.description}</p>
                </div>
                <span className="mt-auto pt-2 inline-flex items-center gap-1 text-sm font-normal text-appPrimary">
                  Get started <ArrowRight size={13} />
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Features — one full screen, three scroll-triggered cards instead
          of a long scrolling list, so the whole pitch reads in a single
          glance the way Apple product pages do. */}
      <section className="relative min-h-screen w-full flex items-center overflow-hidden snap-start px-4 py-20 bg-[#f5f5f7]" id="features">
        <motion.div
          style={{ y: glowY1 }}
          className="absolute top-0 left-1/3 -translate-x-1/2 w-[500px] h-[500px] bg-appPrimary/5 blur-3xl rounded-full pointer-events-none"
        />
        <div className="relative z-10 max-w-6xl mx-auto w-full">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[#1d1d1f]">
              Intelligent by design.
            </h2>
            <p className="text-lg sm:text-xl text-[#6e6e73] font-normal max-w-2xl mx-auto mt-4">
              Built from the ground up to automate, format, and export professional paperwork with zero hassle.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: <Zap size={20} />,
                title: 'Conversational AI Builder',
                copy: 'A streamlined, natural conversation. The AI knows exactly which details tax, compliance, and structure require, and asks for them one at a time.',
                bullets: ['Intelligent spellcheck & date-parsing', 'Continuous context updates while editing'],
              },
              {
                icon: <Settings size={20} />,
                title: 'Instant Visual Customization',
                copy: 'Upload your logo, stamp signatures, and change typography or primary hues — the live preview updates immediately.',
                bullets: ['Swap design styles without losing your data', 'Multi-accent palettes for custom branding'],
              },
              {
                icon: <ShieldCheck size={20} />,
                title: 'High Fidelity & Speed',
                copy: 'Export to compliant PDF instantly. Free users get secure client-side files; Pro tiers render pixel-perfect layouts via cloud servers.',
                bullets: ['Fully vector-supported digital PDFs', 'Document metadata and encryption ready'],
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                className="p-8 bg-white rounded-2xl flex flex-col gap-4"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.12 }}
              >
                <div className="w-11 h-11 rounded-full bg-appPrimary/10 text-appPrimary flex items-center justify-center">
                  {f.icon}
                </div>
                <h3 className="text-xl font-semibold text-[#1d1d1f]">{f.title}</h3>
                <p className="text-[15px] text-[#6e6e73] leading-relaxed">{f.copy}</p>
                <div className="mt-auto space-y-2 font-normal text-sm text-[#6e6e73] pt-4 border-t border-black/5">
                  {f.bullets.map((b) => (
                    <p key={b} className="flex items-center gap-2"><CheckCircle2 className="text-appPrimary flex-shrink-0" size={15} /> {b}</p>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Solution — a full-screen "how it works" flow. Distinct from
          Features (what the product includes) — this is the end-to-end
          path a document takes, Chat -> Customize -> Export. */}
      <section className="relative min-h-screen w-full flex items-center overflow-hidden snap-start px-4 py-20 bg-white" id="solution">
        <motion.div
          style={{ y: glowY2 }}
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-appPrimary/5 blur-3xl rounded-full pointer-events-none"
        />
        <div className="relative z-10 max-w-6xl mx-auto w-full">
          <motion.div
            className="text-center mb-20"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[#1d1d1f]">
              From idea to document. In three steps.
            </h2>
            <p className="text-lg sm:text-xl text-[#6e6e73] font-normal max-w-2xl mx-auto mt-4">
              No blank pages, no formatting fights. Describe what you need, make it yours, and send.
            </p>
          </motion.div>

          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-10">
            <div className="hidden md:block absolute top-8 left-[16.5%] right-[16.5%] h-px bg-black/10" />

            {[
              { icon: <MessageSquare size={22} />, step: '01', title: 'Describe What You Need', copy: 'Tell the AI assistant who it’s for, what’s owed, and any details that matter — plain conversation, no forms.' },
              { icon: <Palette size={22} />, step: '02', title: 'Customize Instantly', copy: 'Pick a template, drop in your logo and colors, and watch the live preview update as you go.' },
              { icon: <Download size={22} />, step: '03', title: 'Export & Send', copy: 'Download a polished, compliant PDF in seconds — ready to email or print, no extra formatting.' },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                className="relative flex flex-col items-center text-center gap-4"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
              >
                <div className="relative w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center text-appPrimary">
                  {s.icon}
                  <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-appPrimary text-white text-[10px] font-semibold flex items-center justify-center">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#1d1d1f]">{s.title}</h3>
                <p className="text-[15px] text-[#6e6e73] leading-relaxed max-w-xs">{s.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Pricing — same three tiers, sized to sit comfortably in one
          screen instead of requiring extra scroll. */}
      <section className="relative min-h-screen w-full flex items-center overflow-hidden snap-start px-4 py-20 bg-[#f5f5f7]" id="pricing">
        <div className="relative z-10 max-w-6xl mx-auto w-full">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[#1d1d1f]">
              Simple, predictable pricing.
            </h2>
            <p className="text-lg sm:text-xl text-[#6e6e73] font-normal max-w-xl mx-auto mt-4">
              Compare the current prices and daily allowance for AI chat requests and server PDF generations.
            </p>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            {planError && <p role="alert">{planError}</p>}
            {plans.map(plan => <PricingTierCard key={plan.id}
              name={plan.displayName}
              description={plan.description}
              price={plan.priceMonthly === null ? 'Unconfigured' : new Intl.NumberFormat('en-US', {style:'currency',currency:plan.currency}).format(plan.priceMonthly)}
              included={[
                `${plan.features.documentsPerDay === 'unlimited' ? 'Unlimited' : plan.features.documentsPerDay} AI chat requests + server PDF generations/day`,
                plan.features.watermark ? 'DocCraft watermark' : 'No watermark',
              ]}
              ctaLabel="View plan details"
              onCtaClick={() => navigate('/pricing')}
              highlighted={plan.name === 'pro'}
            />)}
          </motion.div>
        </div>
      </section>

      {/* 6. About — a real mission section (this used to just be the footer
          wearing an id="about" tag with no actual about content). */}
      <section className="relative min-h-screen w-full flex items-center overflow-hidden snap-start px-4 py-20 bg-white" id="about">
        <motion.div
          style={{ y: glowY1 }}
          className="absolute -top-20 right-0 w-[450px] h-[450px] bg-appPrimary/5 blur-3xl rounded-full pointer-events-none"
        />
        <div className="relative z-10 max-w-5xl mx-auto w-full text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-base sm:text-lg font-medium text-appPrimary mb-3">About DocCraft</p>
            <h2 className="text-4xl sm:text-6xl font-semibold tracking-tight text-[#1d1d1f]">
              Built by SENYX Software.
            </h2>
            <p className="text-lg sm:text-xl text-[#6e6e73] font-normal max-w-2xl mx-auto mt-5 leading-relaxed">
              DocCraft exists because paperwork shouldn't be the hard part of running a business. SENYX Software builds it to turn a five-minute conversation into a document you'd be proud to send — no templates to wrestle with, no formatting to fix by hand.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-16 text-left">
            {[
              { icon: <Rocket size={20} />, title: 'Fast by default', copy: 'From first message to finished PDF in under a minute, not an afternoon.' },
              { icon: <ShieldCheck size={20} />, title: 'Built to be trusted', copy: 'Compliant, encryption-ready documents your clients and accountants can rely on.' },
              { icon: <Target size={20} />, title: 'Focused on the job', copy: 'One tool for invoices, quotations, receipts, and purchase orders — nothing you don’t need.' },
            ].map((v, i) => (
              <motion.div
                key={v.title}
                className="p-7 bg-[#f5f5f7] rounded-2xl"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, delay: i * 0.12 }}
              >
                <div className="w-10 h-10 rounded-full bg-appPrimary/10 text-appPrimary flex items-center justify-center mb-4">
                  {v.icon}
                </div>
                <h3 className="text-[15px] font-semibold text-[#1d1d1f] mb-1.5">{v.title}</h3>
                <p className="text-sm text-[#6e6e73] leading-relaxed">{v.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Footer — dense, small-type, multi-column, Apple's own footer
          language. Plain, at the tail of the scroll, not a snap point of
          its own (a footer isn't meant to fill a whole screen). */}
      <footer className="bg-[#f5f5f7] py-12 px-4 text-[#6e6e73]">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 text-left">
          <div className="col-span-2 md:col-span-1 space-y-3">
            <span className="text-sm font-semibold text-[#1d1d1f]">DocCraft</span>
            <p className="text-xs leading-relaxed">
              AI-powered document generation for freelancers, agencies, and small businesses — built by SENYX Software.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[#1d1d1f] mb-3">Product</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/#features" className="hover:text-appPrimary transition-colors">Features</Link></li>
              <li><Link to="/#solution" className="hover:text-appPrimary transition-colors">Solution</Link></li>
              <li><Link to="/#pricing" className="hover:text-appPrimary transition-colors">Pricing</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[#1d1d1f] mb-3">Company</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/#about" className="hover:text-appPrimary transition-colors">About Us</Link></li>
              <li><Link to="/#contact" className="hover:text-appPrimary transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[#1d1d1f] mb-3">Legal</h4>
            <ul className="space-y-2 text-xs">
              <li><Link to="/privacy-policy" className="hover:text-appPrimary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms-of-service" className="hover:text-appPrimary transition-colors">Terms of Service</Link></li>
              <li><Link to="/cookie-policy" className="hover:text-appPrimary transition-colors">Cookie Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto pt-6 border-t border-black/10 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
          <span>© 2026 SENYX SOFTWARE. All rights reserved.</span>
          <div className="flex gap-4">
            <span className="hover:text-[#1d1d1f] cursor-pointer">Security Standards</span>
            <span>·</span>
            <span className="hover:text-[#1d1d1f] cursor-pointer">System Status</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
};

export default LandingPage;
