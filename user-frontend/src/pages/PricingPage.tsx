import { useState,useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {useQuotaStore} from '../store/quotaStore';
import { useAuthStore } from '../store/authStore';
import * as payment from '../api/payment';
import { usePlanCatalog } from '../hooks/usePlanCatalog';
import Card from '../components/ui/Card';

export default function PricingPage() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const {entitlements,fetchQuota}=useQuotaStore();
  useEffect(()=>{if(isAuthenticated)void fetchQuota();},[isAuthenticated,fetchQuota]);
  const { plans, error: catalogError, loading } = usePlanCatalog();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const checkout = async (plan: string) => {
    if (!isAuthenticated) { navigate('/login'); return; }
    setBusy(true); setError('');
    try { payment.redirectToCheckout(await payment.createCheckoutSession(cycle, plan)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Checkout unavailable'); }
    finally { setBusy(false); }
  };
  return <main className="relative pt-28 pb-20 px-6 max-w-6xl mx-auto">
    <h1 className="text-heading-h1 font-bold mb-4">Plans and pricing</h1>
    <p className="mb-6 text-appTextSecondary">One account allowance covers AI provider requests and server PDF generations across all document types. The window starts with your first metered request; browser exports remain unmetered.</p>
    <label className="block mb-6">Billing period <select aria-label="Billing period" value={cycle} onChange={event => setCycle(event.target.value === 'yearly' ? 'yearly' : 'monthly')} className="bg-appBg border rounded p-2 ml-3">
      <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
    </select></label>
    {loading && <p role="status">Loading plans…</p>}
    {(error || catalogError) && <p role="alert" className="text-red-500 mb-6">{error || catalogError}</p>}
    <div className="grid md:grid-cols-3 gap-6">
      {plans.map(plan => {
        const price = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
        const current = entitlements?.plan === plan.name;
        return <Card key={plan.id} className="p-7">
          <h2 className="text-heading-h4 font-bold">{plan.displayName}</h2>
          <p className="text-appTextSecondary my-3">{plan.description}</p>
          <p className="text-heading-h3 font-bold mb-4">{price === null ? 'Price not configured' : new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency }).format(price)}<span className="text-body-sm"> / {cycle === 'yearly' ? 'year' : 'month'}</span></p>
          <ul className="space-y-2 mb-6 text-body-sm">
            <li>{plan.features.documentsPerDay === 'unlimited' ? 'Unlimited' : plan.features.documentsPerDay} AI provider requests + server PDF generations per {plan.features.windowHours ?? 20}-hour window</li>
            <li>{plan.features.watermark ? 'DocCraft watermark' : 'No watermark'}</li>
            {plan.features.customLogo && <li>Custom logo</li>}
            {plan.features.allTemplates && <li>All templates</li>}
            {plan.features.priorityQueue && <li>Priority PDF queue</li>}
            <li>Share links up to {plan.features.shareLinkMaxDays} days</li>
          </ul>
          <button className="btn-primary w-full" disabled={busy || current || price === null} onClick={() => plan.name === 'free' ? navigate(isAuthenticated ? '/builder' : '/register') : checkout(plan.name)}>{current ? 'Current plan' : plan.name === 'free' ? 'Start creating' : 'Continue to checkout'}</button>
        </Card>;
      })}
    </div>
  </main>;
}
