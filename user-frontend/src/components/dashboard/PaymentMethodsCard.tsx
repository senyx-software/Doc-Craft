import { useState } from 'react';
import Card from '../ui/Card';
import { createPortal } from '../../api/billing';

export default function PaymentMethodsCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const openPortal = async () => {
    setBusy(true);
    setError('');
    try {
      const { portal_url } = await createPortal();
      const url = new URL(portal_url);
      if (url.protocol !== 'https:') throw new Error('Invalid billing portal URL');
      window.location.assign(url.href);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Billing portal unavailable');
    } finally {
      setBusy(false);
    }
  };
  return <Card className="p-6">
    <h3 className="font-semibold mb-2">Payment methods</h3>
    <p className="text-body-sm text-appTextSecondary mb-4">Manage payment details securely through your payment provider. Portal availability depends on your subscription provider.</p>
    {error && <p role="alert" className="text-red-500 mb-3">{error}</p>}
    <button className="btn-secondary" onClick={openPortal} disabled={busy}>{busy ? 'Opening…' : 'Open billing portal'}</button>
  </Card>;
}
