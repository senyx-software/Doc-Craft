import { useEffect, useState } from 'react';
import { getPlans, type PublicPlan } from '../api/payment';

export function usePlanCatalog() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await getPlans();
        if (active) { setPlans(response.plans); setError(''); }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Plans unavailable');
      } finally { if (active) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return { plans, error, loading };
}
