import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useThemeStore } from '../../store/themeStore';

const BackgroundEffects: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: { x: number; y: number; size: number; vx: number; vy: number; alpha: number }[] = [];
    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    const initParticles = () => {
      particles = [];
      const numParticles = Math.min(Math.floor((window.innerWidth * window.innerHeight) / 15000), 100);
      for (let i = 0; i < numParticles; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.5,
          vx: (Math.random() - 0.5) * 0.5,
          // Gravity drift downwards
          vy: Math.random() * 0.5 + 0.2,
          alpha: Math.random() * 0.5 + 0.1,
        });
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const isDark = theme === 'dark';
      const colorPrefix = isDark ? '255, 255, 255' : '15, 23, 42';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Apply gravity/velocity
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.y > canvas.height) p.y = 0;
        if (p.x > canvas.width) p.x = 0;
        if (p.x < 0) p.x = canvas.width;

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${colorPrefix}, ${p.alpha})`;
        ctx.fill();

        // Connect nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${colorPrefix}, ${((120 - dist) / 120) * 0.15})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-transparent">
      {/* Gravity Particles Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 opacity-60" />

      {/* Subtle Noise / Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.03] z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23${isDark ? 'ffffff' : '0f172a'}' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Floating Orbs using Framer Motion */}
      <motion.div
        className={`absolute top-0 -left-4 w-96 h-96 rounded-full filter blur-[120px] z-20 ${
          isDark ? 'bg-brand-500/20 mix-blend-screen' : 'bg-brand-500/10 mix-blend-multiply'
        }`}
        animate={{
          x: ['0vw', '25vw', '-15vw', '0vw'],
          y: ['0vh', '-20vh', '15vh', '0vh'],
          scale: [1, 1.2, 0.8, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.div
        className={`absolute top-0 -right-4 w-96 h-96 rounded-full filter blur-[120px] z-20 ${
          isDark ? 'bg-purple-500/20 mix-blend-screen' : 'bg-purple-500/10 mix-blend-multiply'
        }`}
        animate={{
          x: ['0vw', '-25vw', '15vw', '0vw'],
          y: ['0vh', '20vh', '-15vh', '0vh'],
          scale: [1, 1.3, 0.9, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />

      <motion.div
        className={`absolute -bottom-8 left-20 w-96 h-96 rounded-full filter blur-[120px] z-20 ${
          isDark ? 'bg-cyan-500/20 mix-blend-screen' : 'bg-cyan-500/10 mix-blend-multiply'
        }`}
        animate={{
          x: ['0vw', '20vw', '-20vw', '0vw'],
          y: ['0vh', '-25vh', '20vh', '0vh'],
          scale: [1, 1.1, 0.85, 1],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4,
        }}
      />
    </div>
  );
};

export default BackgroundEffects;
