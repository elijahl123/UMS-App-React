import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { OFFLINE_ID_REMAPPED_EVENT } from '@/app/lib/offline/runtime';

/**
 * A record created offline is addressed by a placeholder ID until it syncs. If
 * the user is sitting on that record's page when the real ID arrives, move the
 * route across so the page keeps working instead of losing the record.
 */
function OfflineIdRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleRemap = (event: Event) => {
      const detail = (event as CustomEvent<{ tempId?: string; realId?: string }>).detail;
      if (!detail?.tempId || !detail.realId) return;

      const path = `${location.pathname}${location.search}`;
      if (!path.includes(detail.tempId)) return;
      navigate(path.split(detail.tempId).join(detail.realId), { replace: true });
    };

    window.addEventListener(OFFLINE_ID_REMAPPED_EVENT, handleRemap);
    return () => window.removeEventListener(OFFLINE_ID_REMAPPED_EVENT, handleRemap);
  }, [location.pathname, location.search, navigate]);

  return null;
}

export default OfflineIdRedirect;
