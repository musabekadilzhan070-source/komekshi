'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from './supabase/client';

export function useMaxVideoMb() {
  const [mb, setMb] = useState(500);
  useEffect(() => {
    supabaseBrowser().from('platform_settings').select('max_video_mb').single().then(({ data }) => data && setMb(data.max_video_mb));
  }, []);
  return mb;
}
