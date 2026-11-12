import { createRemoteJWKSet, jwtVerify } from 'jose';
import initialTools from './initial-tools.js';

const ID = /^outil-\d{3}$/;
const knownTools = new Map(initialTools.map(t => [t.outilId, t]));
const keySets = new Map();
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

export async function verifyAccess(token, env, keySet) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (!domain || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.ACCESS_AUD || !env.EDITOR_EMAIL) {
    fail(503, 'La connexion autorisée reste à configurer. Écriture désactivée.');
  }
  if (!token) fail(401, 'Connexion requise.');
  if (!keySet) {
    if (!keySets.has(domain)) keySets.set(domain, createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`)));
    keySet = keySets.get(domain);
  }
  let payload;
  try { ({ payload } = await jwtVerify(token, keySet, { issuer: `https://${domain}`, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'email'] })); }
  catch { fail(401, 'Session invalide ou expirée.'); }
  if (typeof payload.email !== 'string' || payload.email.toLowerCase() !== env.EDITOR_EMAIL.trim().toLowerCase()) fail(403, 'Ce compte ne peut pas modifier les données.');
  return payload;
}

export async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_HOSTNAME || env.TURNSTILE_ACTION !== 'soumission') fail(503, 'Turnstile reste à configurer.');
  if (typeof token !== 'string' || !token || token.length > 2048) fail(400, 'Validation Turnstile requise.');
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, signal: AbortSignal.timeout(10000) });
    if (!response.ok) fail(502, 'Vérification Turnstile indisponible.');
    result = await response.json();
  } catch { fail(502, 'Vérification Turnstile indisponible. Réessaye.'); }
  if (!result.success || result.hostname !== env.TURNSTILE_HOSTNAME || result.action !== env.TURNSTILE_ACTION) fail(403, 'Validation Turnstile refusée.');
}

async function bodyJSON(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail(415, 'JSON attendu.');
  if (Number(request.headers.get('Content-Length')) > 16384) fail(413, 'Requête trop volumineuse.');
  // Bound the stream as well: Content-Length may be absent or incorrect.
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Corps JSON requis.');
  let length = 0; const chunks = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 16384) { await reader.cancel(); fail(413, 'Requête trop volumineuse.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'JSON invalide.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Objet JSON requis.');
  return body;
}

function validateFields(fields, expected) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail(400, 'Champs invalides.');
  const names = Object.keys(expected);
  if (Object.keys(fields).length !== names.length || names.some(k => typeof fields[k] !== 'string' || fields[k].length > 2500)) fail(400, 'Tous les champs existants doivent être conservés.');
  const result = Object.fromEntries(names.map(k => [k, fields[k].trim()]));
  if (!result.nom) fail(400, 'Le nom est obligatoire.');
  try { const url = new URL(result.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error(); } catch { fail(400, 'URL HTTP ou HTTPS valide requise.'); }
  if (result.dateVerification && (!/^\d{4}-\d{2}-\d{2}$/.test(result.dateVerification) || !Number.isFinite(Date.parse(result.dateVerification)) || new Date(result.dateVerification).toISOString().slice(0,10) !== result.dateVerification)) fail(400, 'Date de vérification invalide.');
  return result;
}

async function readAll(bucket, prefix) {
  const objects = []; let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    objects.push(...page.objects); cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  const records = await Promise.all(objects.map(async o => { const obj = await bucket.get(o.key); return obj ? obj.json() : null; }));
  return records.filter(Boolean);
}
const options = { httpMetadata: { contentType: 'application/json; charset=utf-8' } };

export function createHandler({ identity = verifyAccess, turnstile = verifyTurnstile } = {}) {
  return { async fetch(request, env) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    const origin = request.headers.get('Origin');
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      if (origin && origin !== env.ALLOWED_ORIGIN) fail(403, 'Origine non autorisée.');
      if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Access-Control-Allow-Methods'] = 'GET, PUT, POST, OPTIONS'; headers['Access-Control-Allow-Headers'] = 'Content-Type'; }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const path = new URL(request.url).pathname;
      if (path === '/api/session' && request.method === 'GET') {
        await identity(request.headers.get('Cf-Access-Jwt-Assertion'), env);
        return reply({ autorise: true });
      }
      const match = path.match(/^\/api\/outils\/(outil-\d{3})(\/commentaires)?$/);
      const id = match?.[1];
      const isList = path === '/api/outils';
      const isInit = path === '/api/initialiser';
      if (!isList && !isInit && !match) fail(404, 'Route introuvable.');
      if (id && (!ID.test(id) || !knownTools.has(id))) fail(404, 'Outil introuvable.');
      const allowed = isInit ? ['POST'] : isList ? ['GET'] : match[2] ? ['GET','POST'] : ['PUT'];
      if (!allowed.includes(request.method)) { headers.Allow = allowed.join(', '); fail(405, 'Méthode non autorisée.'); }
      const write = request.method !== 'GET';
      if (write) await identity(request.headers.get('Cf-Access-Jwt-Assertion'), env);
      if (!env.DATA) fail(503, 'Liaison DATA absente.');
      if (isList) {
        const outils = await readAll(env.DATA, 'outils/');
        return reply({ outils: outils.sort((a,b) => a.outilId.localeCompare(b.outilId)) });
      }
      const body = write ? await bodyJSON(request) : null;
      if (isInit) {
        await turnstile(body.turnstileToken, request, env);
        let created = 0;
        for (const tool of initialTools) {
          const saved = await env.DATA.put(`outils/${tool.outilId}.json`, JSON.stringify({ ...tool, version: crypto.randomUUID(), updatedAt: new Date().toISOString() }), { ...options, onlyIf: { etagDoesNotMatch: '*' } });
          if (saved) created++;
        }
        return reply({ crees: created, total: initialTools.length });
      }
      const object = await env.DATA.get(`outils/${id}.json`);
      if (!object) fail(404, 'Initialise la liste avant de modifier cet outil.');
      const current = await object.json();
      if (match[2]) {
        if (!write) return reply({ commentaires: (await readAll(env.DATA, `commentaires/${id}/`)).sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) });
        if (typeof body.texte !== 'string' || !body.texte.trim() || body.texte.length > 4000) fail(400, 'Commentaire requis (4 000 caractères maximum).');
        await turnstile(body.turnstileToken, request, env);
        const comment = { id: crypto.randomUUID(), outilId: id, texte: body.texte.trim(), date: new Date().toISOString() };
        const saved = await env.DATA.put(`commentaires/${id}/${comment.id}.json`, JSON.stringify(comment), { ...options, onlyIf: { etagDoesNotMatch: '*' } });
        if (!saved) fail(409, 'Réessaye l’envoi du commentaire.');
        return reply(comment, 201);
      }
      const champs = validateFields(body.champs, current.champs);
      if (typeof body.version !== 'string' || body.version !== current.version) fail(409, 'La fiche a changé. Recharge les données avant de réessayer.');
      await turnstile(body.turnstileToken, request, env);
      const updated = { ...current, champs, version: crypto.randomUUID(), updatedAt: new Date().toISOString() };
      // Atomic compare-and-swap in R2, including simultaneous requests that read the same version.
      const saved = await env.DATA.put(`outils/${id}.json`, JSON.stringify(updated), { ...options, onlyIf: { etagMatches: object.etag } });
      if (!saved) fail(409, 'Conflit : une autre modification vient d’être enregistrée. Recharge les données.');
      return reply(updated);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Erreur API', error.name);
      return reply({ erreur: error instanceof HttpError ? error.message : 'Erreur du stockage. Réessaye.' }, error.status || 500);
    }
  } };
}
export default createHandler();
