'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Old links used hash routes (#week, #history, #admin, #chat?a=&b=). Map them to real paths.
const HASH_PATHS = { week: '/week', pick: '/pick', standings: '/standings', league: '/league', history: '/bets', chat: '/chat', admin: '/commissioner' };

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const raw = (window.location.hash || '').replace(/^#/, '');
    const q = raw.indexOf('?');
    const name = q === -1 ? raw : raw.slice(0, q);
    const query = q === -1 ? '' : raw.slice(q);
    router.replace((HASH_PATHS[name] || '/league') + query);
  }, [router]);
  return null;
}
