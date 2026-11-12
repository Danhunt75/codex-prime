import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { createHandler, verifyAccess, verifyTurnstile } from '../src/index.js';
import initialTools from '../src/initial-tools.js';

// Storage double implements atomic R2 preconditions, with small pages to exercise pagination.
class Bucket {
  data = new Map(); serial = 0;
  async put(key, text, options = {}) {
    const old = this.data.get(key); const c = options.onlyIf;
    if(c?.etagDoesNotMatch === '*' && old) return null;
    if(c?.etagMatches && old?.etag !== c.etagMatches) return null;
    const object = {key, text, etag:String(++this.serial)};this.data.set(key,object);return object;
  }
  async get(key) { const o=this.data.get(key);return o ? {...o,json:async()=>JSON.parse(o.text)} : null; }
  async list({prefix,cursor}) {
    const all=[...this.data.keys()].filter(k=>k.startsWith(prefix)).sort();const start=Number(cursor||0);const keys=all.slice(start,start+7);const truncated=start+7<all.length;
    return {objects:keys.map(key=>({key})),truncated,cursor:truncated?String(start+7):undefined};
  }
}
const origin='https://codex-prime-crl.pages.dev';
function setup() {
 const env={DATA:new Bucket(),ALLOWED_ORIGIN:origin};
 const handler=createHandler({identity:async token=>{if(token!=='authorized')throw Object.assign(Error('Non autorisé'),{status:401});},turnstile:async token=>{if(token!=='valid')throw Object.assign(Error('Captcha refusé'),{status:403});}});
 async function call(path,method='GET',body,auth='authorized') {
  return handler.fetch(new Request('https://worker.test/api'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(auth?{'Cf-Access-Jwt-Assertion':auth}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 }
 return {env,call,handler};
}
const initBody={turnstileToken:'valid'};
const updateBody=(tool, changes={})=>({champs:{...tool.champs,...changes},version:tool.version,turnstileToken:'valid'});

test('initialisation, édition de tous les champs, relecture et commentaires distincts',async()=>{
 const {env,call}=setup();let r=await call('/initialiser','POST',initBody);assert.equal(r.status,200);assert.equal((await r.json()).crees,31);
 const tools=(await (await call('/outils')).json()).outils;assert.equal(tools.length,31);const a=tools[0],b=tools[1];
 const changes={nom:'Nouveau nom',url:'https://example.org/nouvelle-url',description:'Nouvelle description',categorie:'Autre catégorie',numero:'99',source:'Source amendée',dateVerification:'2026-11-12'};
 r=await call('/outils/'+a.outilId,'PUT',updateBody(a,changes));assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.outilId,a.outilId);assert.deepEqual(saved.champs,changes);
 const reloaded=(await (await call('/outils')).json()).outils;assert.deepEqual(reloaded[0],saved);assert.deepEqual(reloaded[1],b);
 for(const texte of ['Premier commentaire','Deuxième commentaire']) assert.equal((await call(`/outils/${a.outilId}/commentaires`,'POST',{texte,turnstileToken:'valid'})).status,201);
 const comments=(await (await call(`/outils/${a.outilId}/commentaires`)).json()).commentaires;assert.equal(comments.length,2);assert.notEqual(comments[0].id,comments[1].id);assert.equal((await (await call(`/outils/${b.outilId}/commentaires`)).json()).commentaires.length,0);
 assert.equal([...env.DATA.data.keys()].filter(k=>k.startsWith('commentaires/'+a.outilId+'/')).length,2);
 r=await call('/initialiser','POST',initBody);assert.equal((await r.json()).crees,0);assert.deepEqual((await env.DATA.get('outils/'+a.outilId+'.json')).json instanceof Function,true);assert.deepEqual(await (await env.DATA.get('outils/'+a.outilId+'.json')).json(),saved);
});

test('400 pour données invalides, 401 sans autorisation, aucune mutation',async()=>{
 const {env,call}=setup();await call('/initialiser','POST',initBody);const a=(await (await call('/outils')).json()).outils[0];const before=JSON.stringify([...env.DATA.data]);
 for(const changes of [{nom:''},{url:'javascript:alert(1)'},{dateVerification:'2026-99-99'},{dateVerification:'2026-02-30'}]) assert.equal((await call('/outils/'+a.outilId,'PUT',updateBody(a,changes))).status,400);
 assert.equal((await call(`/outils/${a.outilId}/commentaires`,'POST',{texte:' ',turnstileToken:'valid'})).status,400);
 assert.equal((await call('/outils/'+a.outilId,'PUT',updateBody(a),null)).status,401);
 assert.equal((await call('/initialiser','POST',initBody,null)).status,401);
 assert.equal((await call('/outils/'+a.outilId,'PUT',{...updateBody(a),turnstileToken:'invalid'})).status,403);
 assert.equal(JSON.stringify([...env.DATA.data]),before);
});

test('conflit ancien onglet et deux mises à jour réellement simultanées',async()=>{
 const {call}=setup();await call('/initialiser','POST',initBody);const a=(await (await call('/outils')).json()).outils[0];
 const responses=await Promise.all(['A','B'].map(nom=>call('/outils/'+a.outilId,'PUT',updateBody(a,{nom}))));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call('/outils/'+a.outilId,'PUT',updateBody(a))).status,409);
});

test('routes arbitraires, origine étrangère, corps trop gros et ancien endpoint refusés',async()=>{
 const {env,handler,call}=setup();assert.equal((await call('/save','POST',{})).status,404);assert.equal((await call('/outils/outil-999','PUT',{})).status,404);
 assert.equal((await handler.fetch(new Request('https://worker.test/api/outils',{headers:{Origin:'https://foreign.test'}}),env)).status,403);
 assert.equal((await call('/initialiser','POST',{texte:'x'.repeat(17000)})).status,413);
 assert.equal((await call('/outils','DELETE')).status,405);
});

test('sans configuration Access, les écritures restent désactivées',async()=>{
 const {env}=setup();const handler=createHandler();const r=await handler.fetch(new Request('https://worker.test/api/initialiser',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env);assert.equal(r.status,503);assert.equal(env.DATA.data.size,0);
});

test('JWT signé : signature, expiration, audience, émetteur et email vérifiés',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test';const keys=createLocalJWKSet({keys:[jwk]});
 const env={ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'aud-test',EDITOR_EMAIL:'editor@example.org'};
 async function token({email='editor@example.org',aud='aud-test',iss='https://test.cloudflareaccess.com',exp='5m'}={}){return new SignJWT({email}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('user').setIssuedAt().setIssuer(iss).setAudience(aud).setExpirationTime(exp).sign(privateKey);}
 assert.equal((await verifyAccess(await token(),env,keys)).email,'editor@example.org');
 for(const params of [{aud:'wrong'},{iss:'https://other.test'},{exp:'-1s'}]) await assert.rejects(()=>token(params).then(t=>verifyAccess(t,env,keys)),{status:401});
 await assert.rejects(()=>token({email:'other@example.org'}).then(t=>verifyAccess(t,env,keys)),{status:403});
 await assert.rejects(()=>verifyAccess('forged.jwt.token',env,keys),{status:401});
});

test('Turnstile vérifie le succès, le domaine et l’action côté serveur',async()=>{
 const original=globalThis.fetch;const env={TURNSTILE_SECRET_KEY:'test-secret',TURNSTILE_HOSTNAME:'site.test',TURNSTILE_ACTION:'soumission'};const req=new Request('https://worker.test');
 try {
  for(const result of [{success:false},{success:true,hostname:'other.test',action:'soumission'},{success:true,hostname:'site.test',action:'wrong'}]) {globalThis.fetch=async()=>Response.json(result);await assert.rejects(()=>verifyTurnstile('token',req,env),{status:403});}
  globalThis.fetch=async()=>Response.json({success:true,hostname:'site.test',action:'soumission'});await verifyTurnstile('token',req,env);
 } finally {globalThis.fetch=original;}
});
