(() => {
  'use strict';
  const cfg = window.OUTILS_CONFIG;
  let tools = JSON.parse(document.getElementById('initial-tools').textContent);
  let connected = false;
  const status = document.getElementById('cloud-status');
  const reload = document.getElementById('reload-tools');
  const init = document.getElementById('init-tools');
  const search = document.getElementById('tool-search');
  const category = document.getElementById('tool-category');
  const captions = { nom:'Nom', url:'URL', description:'Usage / description', categorie:'Catégorie', etape:'Étape', numero:'N° dans la source', source:'Source', dateVerification:'Date de vérification du service (facultative)' };
  function el(tag, text, attrs = {}) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
    return node;
  }
  async function api(path, options) {
    const response = await fetch(cfg.apiBaseUrl + path, { credentials:'same-origin', redirect:'follow', ...options });
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw Error('Connexion requise : utilise « Se connecter », puis recharge les données.');
    const data = await response.json();
    if (!response.ok) throw Error(data.erreur || `Erreur ${response.status}`);
    return data;
  }
  const send = (path, method, body) => api(path, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  function widget(form) {
    const box = el('div'); box.className = 'turnstile-box'; form.append(box);
    let token = ''; let id;
    const mount = () => {
      if (!box.isConnected || id !== undefined) return;
      if (!window.turnstile) { box.textContent = 'Chargement de la vérification anti-robot…'; return; }
      box.textContent = '';
      id = window.turnstile.render(box, { sitekey:cfg.turnstileSiteKey, action:cfg.turnstileAction, callback:value=>{token=value;}, 'expired-callback':()=>{token='';}, 'error-callback':()=>{token='';} });
    };
    const open = form.closest('details');
    if (open) open.addEventListener('toggle', () => { if(open.open) mount(); }); else mount();
    const ready = () => { if (!open || open.open) mount(); };
    if (!window.turnstile) window.addEventListener('turnstile-ready', ready, {once:true});
    return { get:()=>token, reset:()=>{token='';if(id!==undefined && box.isConnected) window.turnstile.reset(id);} };
  }
  function fieldsForm(tool) {
    // Capture the version at opening/rendering; never silently adopt another tab's version.
    const details = el('details'); details.append(el('summary','Modifier la fiche'));
    const form = el('form'); form.className='tool-form';
    const inputs = {};
    for(const [key,value] of Object.entries(tool.champs)) {
      const label=el('label',captions[key] || key);
      const input=el(key==='description'?'textarea':'input');
      if(input.tagName==='INPUT') input.type=key==='url'?'url':key==='dateVerification'?'date':'text';
      input.name=key; input.value=value; input.maxLength=2500;
      if(key==='nom'||key==='url') input.required=true;
      label.append(input); form.append(label); inputs[key]=input;
    }
    details.append(form);
    const check=widget(form); const submit=el('button','Enregistrer',{type:'submit'}); const message=el('p','',{role:'status'});
    form.append(submit,message); details.append(form);
    form.addEventListener('submit',async event=>{
      event.preventDefault(); submit.disabled=true;
      try {
        if(!check.get()) throw Error('Valide la vérification anti-robot.');
        const champs=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value]));
        await send(`/outils/${tool.outilId}`,'PUT',{champs,version:tool.version,turnstileToken:check.get()});
        await load(); status.textContent='Fiche enregistrée dans R2. Les autres fiches sont conservées.';
      } catch(error) { message.textContent=error.message; } finally { submit.disabled=false; check.reset(); }
    });
    return details;
  }
  function commentsUI(tool) {
    const details=el('details'); details.append(el('summary','Commentaires / ajouter un commentaire'));
    const list=el('div','Ouvre cette section pour charger les commentaires.'); details.append(list);
    async function refresh() {
      try {
        const {commentaires}=await api(`/outils/${tool.outilId}/commentaires`);
        list.replaceChildren();
        if(!commentaires.length) list.textContent='Aucun commentaire enregistré.';
        for(const c of commentaires) { const item=el('article'); item.className='comment'; item.append(el('p',c.texte),el('small',new Date(c.date).toLocaleString('fr-FR'))); list.append(item); }
      } catch(error) { list.textContent=error.message; }
    }
    details.addEventListener('toggle',()=>{if(details.open)refresh();});
    if(connected && tool.version) {
      const form=el('form'); const label=el('label','Ton commentaire'); const input=el('textarea'); input.required=true; input.maxLength=4000; label.append(input);form.append(label);
      details.append(form);
      const check=widget(form);const button=el('button','Ajouter',{type:'submit'});const message=el('p','',{role:'status'});form.append(button,message);details.append(form);
      form.addEventListener('submit',async event=>{
        event.preventDefault();button.disabled=true;message.textContent='Enregistrement…';
        try { if(!check.get())throw Error('Valide la vérification anti-robot.'); await send(`/outils/${tool.outilId}/commentaires`,'POST',{texte:input.value,turnstileToken:check.get()});input.value='';message.textContent='Commentaire enregistré dans R2.';await refresh(); }
        catch(error){message.textContent=error.message;}finally{button.disabled=false;check.reset();}
      });
    }
    return details;
  }
  function render() {
    const oldCategory=category.value;
    category.replaceChildren(el('option','Toutes les catégories / étapes',{value:''}));
    for(const value of [...new Set(tools.map(t=>t.champs.categorie||t.champs.etape))].sort()) category.append(el('option',value,{value}));
    category.value=oldCategory;
    if(category.selectedIndex<0) category.value='';
    const filter=search.value.toLocaleLowerCase('fr');
    const tables=[...document.querySelectorAll('#ressources table')];
    for(const [i,group] of ['A','B'].entries()) {
      const table=tables[i];const body=table.tBodies[0];body.replaceChildren();
      const filtered=tools.filter(t=>t.groupe===group && (!category.value || (t.champs.categorie||t.champs.etape)===category.value) && Object.values(t.champs).join(' ').toLocaleLowerCase('fr').includes(filter));
      for(const tool of filtered) {
        const tr=el('tr');tr.dataset.outilId=tool.outilId;const f=tool.champs;
        if(group==='A')tr.append(el('td',f.numero));
        const title=el('th',undefined,{scope:'row'});title.append(el('a',f.nom,{href:f.url}));tr.append(title,el('td',f.categorie||f.etape),el('td',f.description));
        const actions=el('td'); actions.className='tool-actions';
        if(connected && tool.version) actions.append(fieldsForm(tool)); else actions.append(el('small','Édition disponible après connexion et initialisation.'));
        actions.append(commentsUI(tool));tr.append(actions);body.append(tr);
      }
      if(!filtered.length){const tr=el('tr');tr.append(el('td','Aucun outil dans cette sélection.',{colspan:group==='A'?'5':'4'}));body.append(tr);}
    }
  }
  async function load() {
    reload.disabled=true;
    try {
      const session=await api('/session');connected=session.autorise===true;
      const data=await api('/outils');
      if(data.outils.length) { tools=data.outils;status.textContent=`${tools.length} fiches chargées depuis R2. Connexion autorisée.`; }
      else { tools=JSON.parse(document.getElementById('initial-tools').textContent);status.textContent='R2 est vide. Initialise la liste une seule fois ; les fiches existantes ne seront jamais remplacées.'; }
      init.hidden=!connected;
    } catch(error) { connected=false;init.hidden=true;status.textContent=`${error.message} La liste affichée est la liste d’origine ; aucune sauvegarde cloud n’est simulée.`; }
    finally {render();reload.disabled=false;}
  }
  // Initialization is explicit and idempotent, never triggered by a page reload.
  const initForm=document.getElementById('init-form'); const initCheck=widget(initForm);
  initForm.addEventListener('submit',async event=>{
    event.preventDefault(); const button=initForm.querySelector('button');button.disabled=true;
    try {if(!initCheck.get())throw Error('Valide la vérification anti-robot.');const result=await send('/initialiser','POST',{turnstileToken:initCheck.get()});await load();status.textContent=`Initialisation terminée : ${result.crees} fiches créées, les fiches existantes restent intactes.`;}
    catch(error){status.textContent=error.message;}finally{button.disabled=false;initCheck.reset();}
  });
  document.getElementById('test-refus').addEventListener('click',async event=>{
    const button=event.currentTarget;const output=document.getElementById('test-results');button.disabled=true;output.textContent='Tests en cours…';
    try {
      const before=await api('/outils');const tool=before.outils[0];if(!tool)throw Error('Connecte-toi et initialise les fiches avant ce test.');
      const path=`/outils/${tool.outilId}`;const commentsBefore=await api(path+'/commentaires');
      const base={champs:tool.champs,version:tool.version,turnstileToken:''};const results=[];
      for(const [name,suffix,method,body] of [
        ['URL invalide',path,'PUT',{...base,champs:{...tool.champs,url:'invalid'}}],
        ['Nom vide',path,'PUT',{...base,champs:{...tool.champs,nom:''}}],
        ['Commentaire vide',path+'/commentaires','POST',{texte:'',turnstileToken:''}]
      ]) {
        const response=await fetch(cfg.apiBaseUrl+suffix,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        results.push(`${name} : ${response.status} ${response.status===400?'✓':'ÉCHEC'}`);
      }
      const unauthorized=await fetch('https://formation.75000dia.workers.dev/api'+path,{method:'PUT',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(base)});
      results.push(`Sans connexion : ${unauthorized.status} ${[401,403].includes(unauthorized.status)?'✓':'ÉCHEC'}`);
      const after=await api('/outils');const commentsAfter=await api(path+'/commentaires');
      results.push(JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(commentsBefore)===JSON.stringify(commentsAfter)?'Données et commentaires inchangés ✓':'ÉCHEC : les données ont changé (vérifier aussi les autres onglets).');
      output.textContent=results.join('\n');
    } catch(error){output.textContent=error.message;}finally{button.disabled=false;}
  });
  reload.addEventListener('click',load);search.addEventListener('input',render);category.addEventListener('change',render);
  render(); load();
})();
