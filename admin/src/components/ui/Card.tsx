import React from 'react';

interface CardProps {
  className?: string;
  children: React.ReactNode;
  id?: string;
  glass?: boolean;
}

const Card: React.FC<CardProps> = ({ className = '', children, id }) => {
  return (
    <div
      id={id}
      className={`bg-white dark:bg-neutral-900 border border-gray-200/70 dark:border-white/10 rounded-md shadow-sm p-5 transition-shadow duration-200 hover:shadow-md ${className}`}
    >
      {children}
    </div>
  );
};

export default Card;
