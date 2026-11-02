function normalizeBasePath(basePath) {
  const segments = String(basePath || '/').split('/').filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '';
}

function normalizePath(pathname) {
  const path = `/${String(pathname || '/').split('/').filter(Boolean).join('/')}`;
  return path === '/' ? path : path.replace(/\/$/, '');
}

export function getSimulationRoute(pathname, simulationIds, basePath = '/') {
  const base = normalizeBasePath(basePath);
  const path = normalizePath(pathname);
  const homePath = base || '/';

  if (path === homePath || path === `${base}/index.html`) return { type: 'home' };

  const routePrefix = `${base}/sim/`;
  if (!path.startsWith(routePrefix)) return { type: 'not-found' };

  let id;
  try {
    id = decodeURIComponent(path.slice(routePrefix.length));
  } catch {
    return { type: 'not-found' };
  }
  if (id.includes('/') || !simulationIds.includes(id)) return { type: 'not-found' };
  return { type: 'simulation', id };
}

export function getSimulationUrl(id, basePath = '/') {
  const base = normalizeBasePath(basePath);
  return `${base}/sim/${encodeURIComponent(id)}`;
}

export function getHomeUrl(basePath = '/') {
  return `${normalizeBasePath(basePath) || ''}/`;
}