// Same-origin proxy: the browser never handles an Access token or any secret.
const WORKER = 'https://formation.75000dia.workers.dev';
export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = new URL(url.pathname === '/api/connexion' ? '/api/session' : url.pathname, WORKER);
  const headers = new Headers();
  for (const name of ['Content-Type', 'Origin', 'Cf-Access-Jwt-Assertion']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  // Never relay arbitrary paths, cookies or query parameters to upstream hosts.
  const response = await fetch(target, { method: request.method, headers, body: ['GET','HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
  if (url.pathname === '/api/connexion' && response.ok) return Response.redirect(new URL('/outils.html', url.origin).href, 302);
  return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
