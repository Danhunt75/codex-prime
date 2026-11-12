import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../../functions/api/[[path]].js';

test('le proxy cible uniquement formation et transmet le JWT sans cookies',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async(url,options)=>{
   assert.equal(url.href,'https://formation.75000dia.workers.dev/api/outils');
   assert.equal(options.headers.get('Cf-Access-Jwt-Assertion'),'test-signed-assertion');
   assert.equal(options.headers.has('Cookie'),false);assert.equal(options.redirect,'manual');return Response.json({outils:[]});
  };
  const result=await onRequest({request:new Request('https://site.test/api/outils?host=evil.test',{headers:{'Cf-Access-Jwt-Assertion':'test-signed-assertion',Cookie:'not-forwarded=1'}})});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{outils:[]});assert.equal(result.headers.get('Cache-Control'),'no-store');
 }finally{globalThis.fetch=original;}
});

test('le retour de connexion réussie redirige vers outils.html',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async(url)=>{assert.equal(url.pathname,'/api/session');return Response.json({autorise:true});};
  const result=await onRequest({request:new Request('https://site.test/api/connexion')});assert.equal(result.status,302);assert.equal(result.headers.get('Location'),'https://site.test/outils.html');
 }finally{globalThis.fetch=original;}
});
