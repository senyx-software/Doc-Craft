import React, { useState } from 'react';
import { motion } from 'framer-motion';
import type { PanInfo } from 'framer-motion';

export interface CardItem {
  id: string | number;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
}

interface FluidCardStackProps {
  cards: CardItem[];
}

const FluidCardStack: React.FC<FluidCardStackProps> = ({ cards }) => {
  const [stack, setStack] = useState<CardItem[]>(cards);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo, cardId: string | number) => {
    const threshold = 80;
    if (Math.abs(info.offset.x) > threshold) {
      setStack((prev) => {
        const swipedCard = prev.find(c => c.id === cardId);
        if (!swipedCard) return prev;
        // Move the swiped card to the back of the stack
        return [...prev.filter(c => c.id !== cardId), swipedCard];
      });
    }
  };

  return (
    <div className="relative w-full max-w-sm mx-auto h-[450px] flex items-center justify-center perspective-[1000px]">
      {stack.map((card, index) => {
        const isTop = index === 0;
        const zIndex = cards.length - index;

        // Calculate rotation based on index to give a messy stack look, or keep it clean
        const rotate = index % 2 === 0 ? index * 2 : -index * 2;

        return (
          <motion.div
            key={card.id}
            layout
            className={`absolute w-full p-8 rounded-3xl glass-card border border-surface-300/50 shadow-2xl ${isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
            style={{
              zIndex,
              transformOrigin: 'bottom center',
            }}
            initial={false}
            animate={{
              scale: 1 - index * 0.05,
              y: index * 24,
              rotate: isTop ? 0 : rotate,
              opacity: index > 2 ? 0 : 1 - index * 0.15,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
              mass: 1,
            }}
            drag={isTop ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.8}
            onDragEnd={(e, info) => isTop && handleDragEnd(e, info, card.id)}
            whileDrag={{ scale: 1.05, rotate: 2 }}
          >
            <div className="w-14 h-14 rounded-2xl bg-surface-500 border border-surface-300 flex items-center justify-center mb-6 shadow-inner pointer-events-none">
              <div className={`${card.color} scale-125`}>
                {card.icon}
              </div>
            </div>
            <h4 className="text-2xl font-bold text-white mb-3 tracking-tight pointer-events-none">{card.title}</h4>
            <p className="text-base text-surface-400 leading-relaxed pointer-events-none">{card.desc}</p>
            
            {isTop && (
              <div className="absolute top-4 right-6 pointer-events-none">
                <span className="text-[10px] uppercase tracking-widest text-surface-500 font-bold bg-surface-500/50 px-2 py-1 rounded-full">
                  Swipe
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};

export default FluidCardStack;
