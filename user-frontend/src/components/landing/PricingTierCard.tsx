import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import Button from '../ui/Button';

interface PricingTierCardProps {
  name: string;
  description: string;
  price: string;
  included: string[];
  excluded?: string[];
  ctaLabel: string;
  onCtaClick: () => void;
  highlighted?: boolean;
}

const PricingTierCard: React.FC<PricingTierCardProps> = ({
  name,
  description,
  price,
  included,
  excluded = [],
  ctaLabel,
  onCtaClick,
  highlighted = false,
}) => {
  return (
    <div
      className={`bg-appBg rounded-[12px] p-8 flex flex-col justify-between relative ${
        highlighted
          ? 'border-2 border-appPrimary shadow-xl ring-4 ring-appPrimary/10'
          : 'border border-appBorder shadow-sm'
      }`}
    >
      {highlighted && (
        <div className="absolute top-0 right-8 -translate-y-1/2">
          <span className="bg-appPrimary text-white text-[10px] font-extrabold tracking-wider uppercase px-3 py-1 rounded-full shadow-md">
            Most Popular
          </span>
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold text-appTextPrimary mb-2">{name}</h3>
        <p className="text-xs text-appTextSecondary mb-6">{description}</p>

        <div className="flex items-baseline mb-6">
          <span className="text-3xl font-extrabold text-appTextPrimary">{price}</span>
          <span className="text-xs text-appTextSecondary ml-2">/ month</span>
        </div>

        <div className="h-px bg-appBorder/50 w-full mb-6" />

        <ul className="space-y-3.5 text-xs text-appTextSecondary text-left">
          {included.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <CheckCircle2 className="text-appSuccess" size={14} /> {item}
            </li>
          ))}
          {excluded.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <XCircle className="text-appTextSecondary/40" size={14} /> {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-8">
        <Button variant={highlighted ? 'primary' : 'secondary'} className="w-full" onClick={onCtaClick}>
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
};

export default PricingTierCard;
