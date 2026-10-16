import React from 'react';

interface ToolkitTabButtonProps {
  active: boolean;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const ToolkitTabButton: React.FC<ToolkitTabButtonProps> = ({ active, title, icon, onClick }) => (
  <button
    onClick={onClick}
    title={title}
    className={`p-2.5 rounded-full transition-all ${
      active
        ? 'bg-brand-400 text-white shadow-3'
        : 'text-appTextSecondary hover:text-appTextPrimary hover:bg-appSurface'
    }`}
  >
    {icon}
  </button>
);

export default ToolkitTabButton;
