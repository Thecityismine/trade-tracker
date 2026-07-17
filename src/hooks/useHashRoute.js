import { useCallback, useEffect, useState } from 'react';

function readHash(validIds, fallback) {
  const id = window.location.hash.slice(1);
  return validIds.includes(id) ? id : fallback;
}

// Syncs a tab id to window.location.hash so refresh/back-forward/bookmarking work
// without pulling in a full router.
export function useHashRoute(validIds, fallback) {
  const [route, setRoute] = useState(() => readHash(validIds, fallback));

  useEffect(() => {
    const onHashChange = () => setRoute(readHash(validIds, fallback));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [validIds, fallback]);

  const navigate = useCallback((id) => {
    if (window.location.hash.slice(1) === id) {
      setRoute(id);
    } else {
      window.location.hash = id;
    }
  }, []);

  return [route, navigate];
}
