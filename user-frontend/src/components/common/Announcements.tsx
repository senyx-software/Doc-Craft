import { useEffect, useState } from 'react';
import { get } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

interface Announcement { id: string; title: string; message: string; severity: string }

export default function Announcements() {
  const userId = useAuthStore(state => state.user?.user_id);
  const [feed, setFeed] = useState<{ owner: string; announcements: Announcement[] } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = async () => {
      try {
        const response = await get<{ announcements: Announcement[] }>('/notifications/announcements');
        if (active) setFeed({ owner: userId, announcements: response.announcements });
      } catch {
        if (active) setFeed(null);
      }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [userId]);
  if (!userId || feed?.owner !== userId) return null;
  return <aside aria-label="System announcements" className="relative z-10">
    {feed.announcements.map(item => <div key={item.id} role="status" className="px-6 py-2 bg-brand-500/10 text-appTextPrimary text-body-sm">
      <strong>{item.title}</strong> — {item.message}
    </div>)}
  </aside>;
}
