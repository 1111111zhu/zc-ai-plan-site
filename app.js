'use strict';
(() => {
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths={plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',check:'<path d="m5 12 4 4L19 6"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z"/>'};
  const icon=n=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.plus}</svg>`;
  const tones=['mint','violet','pink','yellow'];
  const statusNames={todo:'待开始',doing:'进行中',done:'已完成'};
  const state={session:null,board:null,sync:'connecting',stream:null,pollTimer:null,pollPending:false,modal:null,pending:false,taskEditing:false,theme:readLocal('zc-theme')||'light',presence:{count:1,members:[]}};
  document.documentElement.dataset.theme=state.theme;
  function readLocal(k){try{return localStorage.getItem(k);}catch{return null;}}
  function writeLocal(k,v){try{localStorage.setItem(k,v);}catch{}}
  const editor=()=>state.session?.role==='editor';
  const editable=()=>editor()&&state.sync!=='offline';
  function toast(message,error=false){const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.textContent=message;$('#toast-root').replaceChildren(el);setTimeout(()=>el.remove(),3500);}
  async function request(path,opts={}){
    let response;
    try{response=await fetch(path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...(opts.method&&opts.method!=='GET'?{'X-CSRF-Token':state.session?.csrfToken||''}:{}),...opts.headers}});}
    catch{state.sync='offline';render();throw new Error('连接失败，未保存。');}
    let body;try{body=await response.json();}catch{body={error:'无法读取服务器响应。'};}
    if(!response.ok){const error=new Error(body.error||`请求失败（${response.status}）`);error.status=response.status;error.body=body;throw error;}
    return body;
  }
  function connect(){
    state.stream?.close();state.sync=navigator.onLine?'connecting':'offline';
    if(!navigator.onLine){render();return;}
    // Quick Tunnels buffer server-sent events, so fetch revisions periodically there.
    if(location.hostname.endsWith('.trycloudflare.com')){
      state.sync='synced';
      if(!state.pollTimer)state.pollTimer=setInterval(pollBoard,5000);
      render();
      return;
    }
    state.stream=new EventSource('/api/events');
    state.stream.onopen=()=>{state.sync='synced';render();};
    state.stream.addEventListener('board',e=>{try{const board=JSON.parse(e.data);if(!state.board||board.revision>=state.board.revision){state.board=board;state.sync='synced';render();}}catch{toast('同步失败，请刷新。',true);}});
    state.stream.addEventListener('presence',e=>{try{state.presence=JSON.parse(e.data);}catch{}});
    state.stream.onerror=()=>{state.sync=navigator.onLine?'reconnecting':'offline';render();};
  }
  async function pollBoard(){
    if(state.pollPending||!state.session?.authenticated||!navigator.onLine)return;
    state.pollPending=true;
    try{
      const board=await request('/api/board');
      if(!state.board||board.revision>state.board.revision){state.board=board;render();}
      if(state.sync!=='synced'){state.sync='synced';render();}
    }catch{if(state.sync!=='offline'){state.sync='offline';render();}}
    finally{state.pollPending=false;}
  }
  async function initialize(){
    const invite=new URLSearchParams(location.hash.replace(/^#/,'')).get('invite');
    if(invite){history.replaceState(null,'',location.pathname+location.search);await login(invite,readLocal('zc-name')||'伙伴');return;}
    try{state.session=await request('/api/session');if(state.session.authenticated){state.board=await request('/api/board');connect();}render();}catch(e){renderLogin(e.message);}
  }
  async function login(code,name){try{state.session=await request('/api/login',{method:'POST',body:JSON.stringify({code,name})});if(!state.session.authenticated)throw new Error('邀请码无效。');writeLocal('zc-name',name);state.board=await request('/api/board');connect();render();}catch(e){renderLogin(e.message);}}
  function renderLogin(error=''){
    const name=$('#login-name')?.value||readLocal('zc-name')||'',code=$('#login-code')?.value||'';
    $('#app').innerHTML=`<main class="login-wrap"><section class="login-card"><h1>浙财 AI 生态计划</h1><form id="login-form"><label>名字<input id="login-name" name="name" value="${esc(name)}" autocomplete="nickname" maxlength="40" required></label><label>邀请码<input id="login-code" name="code" value="${esc(code)}" autocomplete="off" maxlength="2000" required></label><p class="form-error" role="alert">${esc(error)}</p><button type="submit" class="button primary wide">进入</button></form></section></main>`;
  }
  function render(){
    if(!state.session?.authenticated||!state.board){renderLogin();return;}
    const sync={synced:'已同步',connecting:'连接中',reconnecting:'重连中',offline:'离线，未同步'}[state.sync]||'连接中';
    const b=state.board;
    $('#app').innerHTML=`<main class="workspace"><header class="workspace-header"><button class="plan-title" data-action="edit" data-kind="board" data-id="board" aria-label="编辑计划名称" ${editable()?'':'disabled'}><h1>${esc(b.title)}</h1>${editor()?icon('edit'):''}</button><div class="header-tools"><span class="sync-dot ${state.sync}" role="status" aria-label="${sync}" title="${sync}"></span></div></header><nav class="jump-links" aria-label="快速跳转"><a href="#resources">资源</a><a href="#timeline">时间线</a></nav>${state.sync==='offline'?'<p class="offline-banner" role="status">离线，未同步</p>':''}<div class="board-columns"><section class="panel resource-panel" id="resources"><div class="section-header"><h2>资源池</h2>${editor()?`<button class="text-button" data-action="create" data-kind="resourceGroup" ${editable()?'':'disabled'}>${icon('plus')}分类</button>`:''}</div><div class="resource-groups">${(b.resourceGroups||[]).map((g,i)=>resourceGroup(g,i)).join('')||'<p class="empty">暂无分类</p>'}</div></section><section class="panel timeline-panel ${state.taskEditing?'is-editing':''}" id="timeline"><div class="section-header"><h2>时间线</h2>${timelineActions()}</div><div class="timeline-groups">${(b.timeGroups||[]).map((g,i)=>timeGroup(g,i)).join('')||'<p class="empty">暂无分组</p>'}</div></section></div></main>`;
    refreshProgressHistory();
  }
  function timelineActions(){if(!editor())return '';return `<div class="timeline-actions"><button class="text-button timeline-edit" data-action="timeline-edit" aria-pressed="${state.taskEditing}" aria-label="${state.taskEditing?'退出卡片编辑':'编辑安排卡片'}" ${editable()?'':'disabled'}>${icon('edit')}${state.taskEditing?'完成':'编辑'}</button><button class="text-button" data-action="create" data-kind="timeGroup" ${editable()?'':'disabled'}>${icon('plus')}分组</button></div>`;}
  function groupHeader(g,kind,count){if(kind==='timeGroup'&&!state.taskEditing)return `<header class="group-header"><div class="group-title"><h3>${esc(g.name)}</h3>${g.range?`<small>${esc(g.range)}</small>`:''}</div>${editor()?`<button class="icon-button group-add" data-action="create" data-kind="task" data-group="${esc(g.id)}" aria-label="新增安排 · ${esc(g.name)}" ${editable()?'':'disabled'}>${icon('plus')}</button>`:''}</header>`;return `<header class="group-header"><button class="group-title" data-action="edit" data-kind="${kind}" data-id="${esc(g.id)}" ${editable()?'':'disabled'}><h3>${esc(g.name)}</h3>${kind==='timeGroup'&&g.range?`<small>${esc(g.range)}</small>`:''}</button>${editor()?`<button class="icon-button group-add" data-action="create" data-kind="${kind==='resourceGroup'?'resource':'task'}" data-group="${esc(g.id)}" aria-label="${kind==='resourceGroup'?'新增资源':'新增安排'} · ${esc(g.name)}" ${editable()?'':'disabled'}>${icon('plus')}</button>`:''}</header>`;}
  function resourceGroup(g,i){const resources=state.board.resources.filter(r=>r.status===g.id);return `<section class="resource-group ${tones[i%4]}">${groupHeader(g,'resourceGroup',resources.length)}<div class="resource-list">${resources.map(resourceRow).join('')}</div></section>`;}
  function resourceRow(r){
    const name=String(r.name||''),seen=new Set([name]),details=[];
    for(const [key,value] of [['contact',r.contact],['location',r.location],['wechat',r.wechat]]){const text=String(value||'').trim();if(!text||seen.has(text)||(key==='contact'&&name.includes(text)))continue;seen.add(text);details.push(key==='wechat'?`微信 ${text}`:text);}
    return `<button class="resource-row" data-action="edit" data-kind="resource" data-id="${esc(r.id)}"><strong>${esc(name)}</strong>${details.length?`<span>${esc(details.join(' · '))}</span>`:''}</button>`;
  }
  function taskSort(a,b){if(!a.date&&!b.date)return 0;if(!a.date)return 1;if(!b.date)return -1;return a.date.localeCompare(b.date);}
  function timeGroup(g,i){const tasks=state.board.tasks.filter(t=>t.groupId===g.id).slice().sort(taskSort);return `<section class="timeline-group ${tones[i%4]}">${groupHeader(g,'timeGroup',tasks.length)}<div class="timeline-list">${tasks.map(taskRow).join('')}</div></section>`;}
  function taskDate(t){if(!t.date)return '待定';const [,m,d]=t.date.split('-');return `${Number(m)}/${Number(d)}`;}
  function taskRow(t){const done=t.status==='done',progress=done?100:Number(t.progress)||0;return `<article class="timeline-item ${done?'done':''}"><span class="timeline-node" aria-hidden="true"></span><button class="task-row" data-action="${state.taskEditing?'edit':'fill'}" data-kind="task" data-id="${esc(t.id)}"><strong>${esc(t.title)}</strong><span class="task-meta"><time>${esc(taskDate(t))}</time><span>${statusNames[t.status]||'待开始'}${progress>0?' '+progress+'%':''}</span></span>${progress>0&&progress<100?`<span class="progress-track"><i style="width:${Math.min(100,Math.max(0,progress))}%"></i></span>`:''}</button><button class="task-check ${done?'checked':''}" data-action="complete" data-id="${esc(t.id)}" aria-label="${done?'取消完成':'标记完成'}：${esc(t.title)}" aria-pressed="${done}" ${editable()?'':'disabled'}>${done?icon('check'):''}</button></article>`;}
  function modal(title,content){state.modal={...state.modal,title};document.body.classList.add('modal-open');$('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title">${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></header>${content}</section></div>`;requestAnimationFrame(()=>$('.modal input:not([type="hidden"]):not(:disabled), .modal button:not(:disabled)')?.focus());}
  function close(){if(state.pending)return;state.modal=null;$('#modal-root').replaceChildren();document.body.classList.remove('modal-open');}
  function input(label,name,value='',type='text',attrs=''){return `<label>${label}<input name="${name}" value="${esc(value)}" type="${type}" ${attrs}></label>`;}
  function select(label,name,value,options){return `<label>${label}<select name="${name}">${options.map(([id,text])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;}
  function collection(kind){return {resource:state.board.resources,task:state.board.tasks,resourceGroup:state.board.resourceGroups,timeGroup:state.board.timeGroups}[kind]||[];}
  function edit(kind,id='',groupId=''){
    const item=kind==='board'?state.board:collection(kind).find(x=>x.id===id)||{};
    const create=!id,readonly=!editor();
    state.modal={kind,id,create,version:kind==='board'?item.metaVersion:item.version,dirty:false,conflict:false,item};
    let fields='';
    if(kind==='board')fields=input('计划名','title',item.title,'text','required maxlength="180"');
    if(kind==='resourceGroup'||kind==='timeGroup')fields=input('名称','name',item.name,'text','required maxlength="80"')+(kind==='timeGroup'?input('日期范围','range',item.range,'text','maxlength="80" placeholder="可留空"'):'');
    if(kind==='resource')fields=`${input('名称','name',item.name,'text','required maxlength="140"')}${select('分类','status',item.status||groupId||state.board.resourceGroups[0]?.id,state.board.resourceGroups.map(g=>[g.id,g.name]))}<details><summary>更多</summary><div class="details-fields">${input('联系人','contact',item.contact,'text','maxlength="240"')}${input('位置','location',item.location,'text','maxlength="240"')}${input('微信','wechat',item.wechat,'text','maxlength="120"')}${input('负责人','owner',item.owner,'text','maxlength="80"')}<label>备注<textarea name="notes" rows="3" maxlength="4000">${esc(item.notes)}</textarea></label></div></details>`;
    if(kind==='task')fields=`${input('安排','title',item.title,'text','required maxlength="180"')}${select('分组','groupId',item.groupId||groupId||state.board.timeGroups[0]?.id,state.board.timeGroups.map(g=>[g.id,g.name]))}${input('日期','date',item.date,'date','min="2000-01-01" max="2100-12-31"')}<div class="form-row status-row">${select('状态','status',item.status||'todo',Object.entries(statusNames))}<label class="progress-label">进度 <output id="progress-output">${Number(item.progress)||0}%</output><input name="progress" type="range" min="0" max="100" step="5" value="${Number(item.progress)||0}" aria-label="进度"></label></div><details><summary>更多</summary><div class="details-fields">${input('负责人','owner',item.owner,'text','maxlength="80"')}<div class="form-row">${select('原所属周','period',item.period||'this_week',[['this_week','这周'],['next_week','下周']])}${select('类型','category',item.category||'planning',[['planning','策划'],['recruitment','招新'],['cooperation','合作'],['community','社群']])}</div><label>备注<textarea name="notes" rows="3" maxlength="4000">${esc(item.notes)}</textarea></label></div></details>`;
    const names={board:'计划名',resourceGroup:'分类',timeGroup:'分组',resource:'资源',task:'安排'};
    modal((readonly?'查看':create?'新增':'编辑')+names[kind],`<form id="edit-form"><fieldset ${readonly?'disabled':''}>${fields}</fieldset><p id="edit-error" class="form-error" role="alert"></p><footer class="modal-footer">${!readonly&&!create&&kind!=='board'?`<button type="button" class="button danger" data-action="delete" data-kind="${kind}">删除</button>`:''}<button type="button" class="button subtle" data-action="close-modal">${readonly?'关闭':'取消'}</button>${!readonly?`<button type="submit" id="save-button" data-action="save" data-kind="${kind}" class="button primary">保存</button>`:''}</footer></form>`);
  }
  function progressRequestId(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    if(globalThis.crypto?.getRandomValues){const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
    throw new Error('浏览器不支持安全提交，请更换浏览器。');
  }
  function progressTime(at){
    if(!at)return '时间未记录';
    const date=new Date(at);if(Number.isNaN(date.valueOf()))return '时间未记录';
    const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
  }
  function recordEdits(record){return Array.isArray(record.edits)?record.edits:[];}
  function recordContent(record){const edits=recordEdits(record);return String(edits.length?(edits[edits.length-1].content??''):(record.content??''));}
  function historyRecord(record){
    const progress=Math.min(100,Math.max(0,Number(record.progress)||0)),edits=recordEdits(record);
    const originalMeta=`${esc(record.legacy?'原有内容':record.author)} · ${esc(record.legacy?'时间未记录':progressTime(record.at))}`;
    const revisions=edits.length?`<details class="history-revisions"><summary>修改记录</summary><div class="history-revision"><div class="history-revision-meta">原文 · ${originalMeta}</div><p>${esc(record.content||'进度更新')}</p></div>${edits.map(edit=>`<div class="history-revision"><div class="history-revision-meta">${esc(edit.author)} · ${esc(progressTime(edit.at))}</div><p>${esc(edit.content||'进度更新')}</p></div>`).join('')}</details>`:'';
    return `<article class="history-record" data-record-id="${esc(record.id)}"><div class="history-header"><div class="history-meta"><span class="history-author">${esc(record.legacy?'原有内容':record.author)}</span><span class="history-separator"> · </span><time class="history-time">${esc(record.legacy?'时间未记录':progressTime(record.at))}</time></div>${editor()?`<div class="history-actions"><button type="button" class="text-button history-edit" data-action="history-edit" data-record-id="${esc(record.id)}" ${state.pending?'disabled':''}>编辑</button><button type="button" class="text-button history-delete" data-action="history-delete" data-record-id="${esc(record.id)}" ${state.pending?'disabled':''}>删除</button></div>`:''}</div><p class="history-content">${esc(recordContent(record)||'进度更新')}</p><div class="history-state"><span>${esc(statusNames[record.status]||'待开始')}</span><span>${progress}%</span>${edits.length?'<span class="history-edited">已编辑</span>':''}</div>${revisions}</article>`;
  }
  function progressHistory(id){
    const records=(state.board.progressRecords||[]).filter(record=>record.taskId===id&&!record.deletion);
    return records.map(historyRecord).join('')||'<p class="history-empty">暂无记录</p>';
  }
  function historyNode(id){return Array.from($('.history-list')?.children||[]).find(node=>node.classList.contains('history-record')&&node.dataset.recordId===id);}
  function refreshProgressHistory(){
    if(state.modal?.mode!=='progress')return;
    const list=$('.history-list');if(!list)return;
    const focused=document.activeElement,selection=focused?.classList.contains('history-edit-content')?{start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection,top:focused.scrollTop}:null;
    const follow=!list.contains(focused)&&list.scrollHeight-list.clientHeight-list.scrollTop<8,top=list.scrollTop;
    const allRecords=(state.board.progressRecords||[]).filter(record=>record.taskId===state.modal.id);
    for(const record of allRecords){if(record.deletion&&state.modal.selfDeleting?.has(record.id)){state.modal.historyEdits.delete(record.id);state.modal.historyDeletes.delete(record.id);}}
    const records=allRecords.filter(record=>!record.deletion||state.modal.historyEdits?.has(record.id)),ids=new Set(records.map(record=>record.id));
    for(const node of Array.from(list.children)){if(!node.classList.contains('history-record')||(!ids.has(node.dataset.recordId)&&!state.modal.historyEdits?.has(node.dataset.recordId)))node.remove();}
    records.forEach((record,index)=>{
      let node=historyNode(record.id);
      if(record.deletion){if(node)markHistoryDeleted(record.id);else state.modal.historyEdits?.delete(record.id);}
      if(!record.deletion&&(!node||!state.modal.historyEdits?.has(record.id))){
        const expanded=!!node?.querySelector('.history-revisions')?.open,template=document.createElement('template');template.innerHTML=historyRecord(record);const next=template.content.firstElementChild;
        if(expanded&&next.querySelector('.history-revisions'))next.querySelector('.history-revisions').open=true;
        if(node)node.replaceWith(next);node=next;
      }
      if(node){const position=list.children[index];if(position!==node)list.insertBefore(node,position||null);}
    });
    if(!list.children.length)list.innerHTML='<p class="history-empty">暂无记录</p>';
    if(selection&&focused.isConnected){if(document.activeElement!==focused)focused.focus({preventScroll:true});focused.setSelectionRange(selection.start,selection.end,selection.direction);focused.scrollTop=selection.top;}
    list.scrollTop=follow?list.scrollHeight:top;const deletedFocus=focused?.closest('.history-deleted-draft');if(deletedFocus)revealHistoryEditor(deletedFocus.dataset.recordId);progressDirty();
  }
  function progressDirty(){
    const m=state.modal;if(m?.mode!=='progress')return;
    m.dirty=!!$('#progress-content')?.value||$('[name="status"]')?.value!==m.item.status||Number($('[name="progress"]')?.value)!==Number(m.item.progress)||Array.from(m.historyEdits?.values()||[]).some(draft=>draft.dirty);
  }
  function historyBusy(busy){
    state.pending=busy;
    const save=$('#save-button');if(save)save.disabled=busy||!!state.modal?.conflict;
    for(const button of $('#modal-root').querySelectorAll('.history-edit,.history-delete,.history-edit-save,.history-edit-cancel')){const deleted=button.closest('.history-record')?.classList.contains('history-deleted-draft');button.disabled=busy||(deleted&&!button.classList.contains('history-edit-cancel'));}
  }
  function revealHistoryEditor(id){
    const list=$('.history-list'),container=historyNode(id)?.querySelector('.history-editor');if(!list||!container)return;
    const area=list.getBoundingClientRect(),box=container.getBoundingClientRect(),top=area.top+list.clientTop,bottom=top+list.clientHeight,gap=Math.max(0,Math.min(4,(list.clientHeight-box.height)/2));
    if(box.bottom>bottom-gap)list.scrollTop+=box.bottom-bottom+gap;
    const moved=container.getBoundingClientRect();if(moved.top<top+gap)list.scrollTop-=top-moved.top+gap;
  }
  function beginHistoryEdit(id){
    if(!editor()||state.pending||state.modal?.mode!=='progress')return;
    const record=(state.board.progressRecords||[]).find(record=>record.id===id&&record.taskId===state.modal.id&&!record.deletion),node=historyNode(id);if(!record||!node)return;
    if(state.modal.historyEdits.has(id)){node.querySelector('.history-edit-content')?.focus({preventScroll:true});revealHistoryEditor(id);return;}
    const content=recordContent(record);let requestId=null;try{requestId=progressRequestId();}catch{}
    state.modal.historyEdits.set(id,{recordId:id,expectedVersion:1+recordEdits(record).length,requestId,submissionFingerprint:null,originalContent:content,dirty:false});
    node.classList.add('is-history-editing');const container=document.createElement('div');container.className='history-editor';
    container.innerHTML=`<textarea class="history-edit-content" rows="3" maxlength="4000" aria-label="进展正文">${esc(content)}</textarea><p class="form-error history-edit-error" role="alert"></p><div class="history-edit-actions"><button type="button" class="button subtle history-edit-cancel" data-action="history-cancel" data-record-id="${esc(id)}">取消</button><button type="button" class="button primary history-edit-save" data-action="history-save" data-record-id="${esc(id)}">保存</button></div>`;
    node.insertBefore(container,node.querySelector('.history-revisions'));container.querySelector('textarea').focus({preventScroll:true});revealHistoryEditor(id);
  }
  function cancelHistoryEdit(id){
    if(state.pending||state.modal?.mode!=='progress')return;
    state.modal.historyEdits.delete(id);refreshProgressHistory();progressDirty();
  }
  async function saveHistoryEdit(id){
    if(!editor()||state.pending||state.modal?.mode!=='progress')return;
    const m=state.modal,draft=m.historyEdits.get(id),node=historyNode(id);if(!draft||!node)return;
    const textarea=node.querySelector('.history-edit-content'),error=node.querySelector('.history-edit-error'),button=node.querySelector('.history-edit-save'),content=textarea.value.trim();
    const current=(state.board.progressRecords||[]).find(record=>record.id===id);if(!current||current.deletion){markHistoryDeleted(id);return;}
    if(!draft.submissionFingerprint&&content===draft.originalContent.trim()){cancelHistoryEdit(id);toast('无变化');return;}
    const payload={recordId:id,expectedVersion:draft.expectedVersion,content},fingerprint=JSON.stringify(payload);
    try{if(!draft.requestId||(draft.submissionFingerprint&&draft.submissionFingerprint!==fingerprint))draft.requestId=progressRequestId();}catch(e){error.textContent=e.message;return;}
    draft.submissionFingerprint=fingerprint;payload.requestId=draft.requestId;
    if(!navigator.onLine||state.sync==='offline'){error.textContent='离线，未保存。';return;}
    historyBusy(true);textarea.disabled=true;button.textContent='保存中';error.textContent='';
    try{
      const board=await request('/api/progress/edit',{method:'POST',body:JSON.stringify(payload)});if(!state.board||board.revision>=state.board.revision)state.board=board;if(state.sync!=='reconnecting')state.sync='synced';
      m.historyEdits.delete(id);historyBusy(false);render();progressDirty();toast('已保存');
    }catch(e){
      if(e.status===409){
        try{const board=e.body?.current||await request('/api/board');if(!state.board||board.revision>=state.board.revision)state.board=board;render();const record=(state.board.progressRecords||[]).find(record=>record.id===id);if(record&&!record.deletion){draft.expectedVersion=1+recordEdits(record).length;draft.requestId=null;draft.submissionFingerprint=null;draft.originalContent=recordContent(record);button.textContent='用当前内容再保存';error.textContent='内容已被修改，草稿已保留。';}else{markHistoryDeleted(id);}}
        catch{button.textContent='保存';error.textContent='未保存，请重试。';}
      }else{button.textContent='保存';error.textContent=e.message;}
      textarea.disabled=false;historyBusy(false);revealHistoryEditor(id);
    }
  }
  function markHistoryDeleted(id){
    const node=historyNode(id);if(!node)return;
    node.classList.add('history-deleted-draft');
    const error=node.querySelector('.history-edit-error'),save=node.querySelector('.history-edit-save');
    if(error)error.textContent='记录已删除，草稿保留';if(save){save.disabled=true;save.textContent='保存';}
    for(const button of node.querySelectorAll('.history-edit,.history-delete'))button.disabled=true;
  }
  async function deleteHistory(id){
    if(!editor()||state.pending||state.modal?.mode!=='progress')return;
    const m=state.modal,record=(state.board.progressRecords||[]).find(record=>record.id===id&&record.taskId===m.id);
    if(!record||record.deletion){refreshProgressHistory();toast('记录已删除');return;}
    if(!window.confirm('删除这条进展？'))return;
    let payload=m.historyDeletes.get(id);
    if(!payload){try{payload={recordId:id,expectedVersion:1+recordEdits(record).length,requestId:progressRequestId()};}catch(e){toast(e.message,true);return;}m.historyDeletes.set(id,payload);}
    if(!navigator.onLine||state.sync==='offline'){toast('离线，未删除。',true);return;}
    m.selfDeleting.add(id);historyBusy(true);
    try{
      const board=await request('/api/progress/delete',{method:'POST',body:JSON.stringify(payload)});if(!state.board||board.revision>=state.board.revision)state.board=board;if(state.sync!=='reconnecting')state.sync='synced';
      m.historyEdits.delete(id);m.historyDeletes.delete(id);m.selfDeleting.delete(id);historyBusy(false);render();progressDirty();toast('已删除');
    }catch(e){
      if(e.status===409){
        try{const board=e.body?.current||await request('/api/board');if(!state.board||board.revision>=state.board.revision)state.board=board;const latest=(state.board.progressRecords||[]).find(record=>record.id===id);m.historyDeletes.delete(id);m.selfDeleting.delete(id);if(!latest||latest.deletion)m.historyEdits.delete(id);historyBusy(false);render();progressDirty();toast(!latest||latest.deletion?'记录已删除':'内容已修改，请确认后再删除。',!latest||latest.deletion?false:true);}
        catch{m.selfDeleting.delete(id);historyBusy(false);toast('未删除，请重试。',true);}
      }else{if(e.status)m.selfDeleting.delete(id);historyBusy(false);toast(e.message,true);}
    }
  }
  function resetProgressDraft(){
    const m=state.modal;if(m?.mode!=='progress')return;
    const item=state.board.tasks.find(task=>task.id===m.id);if(item){m.item=item;m.version=item.version;$('[name="status"]').value=item.status;$('[name="progress"]').value=Number(item.progress)||0;$('#progress-output').textContent=(Number(item.progress)||0)+'%';}
    const content=$('#progress-content');if(content)content.value='';m.conflict=false;m.submissionFingerprint=null;try{m.requestId=progressRequestId();}catch{m.requestId=null;}
    $('#edit-error').textContent='';$('#save-button').textContent='保存';historyBusy(false);progressDirty();
  }
  function fillProgress(id){
    const item=state.board.tasks.find(t=>t.id===id);if(!item)return;
    const readonly=!editor();let requestId=null;try{if(!readonly)requestId=progressRequestId();}catch{}
    state.modal={kind:'task',id,create:false,version:item.version,dirty:false,conflict:false,mode:'progress',item,requestId,submissionFingerprint:null,historyEdits:new Map(),historyDeletes:new Map(),selfDeleting:new Set()};
    modal(item.title,`<form id="edit-form" data-mode="progress"><section class="progress-history" aria-label="进展记录"><div class="history-list" id="progress-history" tabindex="0">${progressHistory(id)}</div></section><fieldset ${readonly?'disabled':''}><div class="form-row status-row">${select('状态','status',item.status,Object.entries(statusNames))}<label class="progress-label">进度 <output id="progress-output">${Number(item.progress)||0}%</output><input name="progress" type="range" min="0" max="100" step="5" value="${Number(item.progress)||0}" aria-label="进度"></label></div>${!readonly?'<label>新增进展<textarea id="progress-content" name="content" rows="3" maxlength="4000" placeholder="写下本次进展"></textarea></label>':''}</fieldset><p id="edit-error" class="form-error" role="alert"></p><footer class="modal-footer"><button type="button" class="button subtle" data-action="close-modal">${readonly?'关闭':'取消'}</button>${!readonly?'<button type="submit" id="save-button" class="button primary">保存</button>':''}</footer></form>`);
    requestAnimationFrame(()=>{const list=$('.history-list');if(list)list.scrollTop=list.scrollHeight;if(!readonly)$('#progress-content')?.focus();});
  }
  async function saveProgress(form){
    if(state.pending||state.modal?.conflict)return;
    if(!editor()){ $('#edit-error').textContent='只读，无法修改。';return; }
    const data=Object.fromEntries(new FormData(form)),m=state.modal;
    let progress=Number(data.progress),status=data.status;
    if(status==='done')progress=100;if(status==='todo'&&progress>0)status='doing';
    const changed=progress!==Number(m.item.progress)||status!==m.item.status,content=String(data.content||'').trim();
    if(!content&&!changed){$('#edit-error').textContent='填写进展或调整进度';return;}
    const payload={taskId:m.id,content,...(changed?{expectedVersion:m.version,progress,status}:{})};
    const fingerprint=JSON.stringify(payload);
    try{if(!m.requestId||(m.submissionFingerprint&&m.submissionFingerprint!==fingerprint))m.requestId=progressRequestId();}catch(e){$('#edit-error').textContent=e.message;return;}
    m.submissionFingerprint=fingerprint;payload.requestId=m.requestId;
    if(!navigator.onLine||state.sync==='offline'){$('#edit-error').textContent='离线，未保存。';return;}
    historyBusy(true);$('fieldset',form).disabled=true;$('#save-button').textContent='保存中';$('#edit-error').textContent='';
    try{const board=await request('/api/progress',{method:'POST',body:JSON.stringify(payload)});if(!state.board||board.revision>=state.board.revision)state.board=board;if(state.sync!=='reconnecting')state.sync='synced';$('fieldset',form).disabled=false;historyBusy(false);render();resetProgressDraft();toast('已保存');}
    catch(e){if(!conflict(e)){$('#edit-error').textContent=e.message;$('#save-button').disabled=false;$('#save-button').textContent='保存';}else{$('#edit-error').textContent='进度已被修改。草稿已保留，请复制后重新打开。';$('#save-button').textContent='需重新打开';}$('fieldset',form).disabled=false;historyBusy(false);}
  }
  async function change(kind,action,id,version,fields){
    if(!editor())throw new Error('只读，无法修改。');
    if(!navigator.onLine||state.sync==='offline')throw new Error('离线，未保存。');
    const payload=action==='create'?{kind,action,fields}:{kind,action,id,expectedVersion:version,...(action==='delete'?{}:{fields})};
    const board=await request('/api/changes',{method:'POST',body:JSON.stringify(payload)});state.board=board;if(state.sync!=='reconnecting')state.sync='synced';render();
  }
  function conflict(e){if(e.status===409&&e.body?.current){state.board=e.body.current;render();state.modal.conflict=true;$('#save-button').disabled=true;$('#edit-error').textContent='内容已被修改。草稿已保留，请复制后重新打开。';return true;}return false;}
  async function save(form){
    if(state.modal?.mode==='progress'){await saveProgress(form);return;}
    if(state.pending||state.modal?.conflict)return;
    const fields=Object.fromEntries(new FormData(form)),m={...state.modal};
    if(m.kind==='task'){fields.progress=Number(fields.progress);if(fields.status==='done')fields.progress=100;if(fields.status==='todo'&&fields.progress>0)fields.status='doing';}
    state.pending=true;$('#save-button').disabled=true;$('#save-button').textContent='保存中';$('#edit-error').textContent='';
    try{await change(m.kind,m.create?'create':'update',m.id,m.version,fields);state.pending=false;close();toast('已保存');}
    catch(e){if(!conflict(e)){$('#edit-error').textContent=e.message;$('#save-button').disabled=false;$('#save-button').textContent='保存';}else $('#save-button').textContent='需重新打开';state.pending=false;}
  }
  async function remove(button){
    if(!editor()||state.pending||state.modal?.conflict)return;
    const m={...state.modal};let message='删除这条内容？';
    if(m.kind==='resourceGroup'){const n=state.board.resources.filter(x=>x.status===m.id).length;message=`删除分类，同时删除其中 ${n} 条资源？`;}
    if(m.kind==='timeGroup'){const n=state.board.tasks.filter(x=>x.groupId===m.id).length;message=`删除分组，同时删除其中 ${n} 条安排？`;}
    if(!window.confirm(message))return;
    state.pending=true;button.disabled=true;$('#edit-error').textContent='';
    try{await change(m.kind,'delete',m.id,m.version,{});state.pending=false;close();toast('已删除');}
    catch(e){if(!conflict(e)){$('#edit-error').textContent=e.message;button.disabled=false;}state.pending=false;}
  }
  async function complete(button){const t=state.board.tasks.find(t=>t.id===button.dataset.id);if(!t)return;button.disabled=true;try{await change('task','update',t.id,t.version,{status:t.status==='done'?'todo':'done',progress:t.status==='done'?0:100});}catch(e){if(e.status===409&&e.body?.current){state.board=e.body.current;render();toast('内容已更新，请重试。',true);}else{toast(e.message,true);button.disabled=false;}}}
  document.addEventListener('click',async e=>{
    const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
    const action=button.dataset.action;
    if(action==='edit')edit(button.dataset.kind,button.dataset.id);
    else if(action==='fill')fillProgress(button.dataset.id);
    else if(action==='history-edit')beginHistoryEdit(button.dataset.recordId);
    else if(action==='history-delete')await deleteHistory(button.dataset.recordId);
    else if(action==='history-save')await saveHistoryEdit(button.dataset.recordId);
    else if(action==='history-cancel')cancelHistoryEdit(button.dataset.recordId);
    else if(action==='timeline-edit'){if(editable()){state.taskEditing=!state.taskEditing;render();}}
    else if(action==='create'){if(editable())edit(button.dataset.kind,'',button.dataset.group);}
    else if(action==='close'||action==='close-modal')close();
    else if(action==='delete')await remove(button);
    else if(action==='complete')await complete(button);
  });
  document.addEventListener('submit',async e=>{if(e.target.id==='edit-form'){e.preventDefault();await save(e.target);}else if(e.target.id==='login-form'){e.preventDefault();const data=new FormData(e.target),button=$('button[type="submit"]',e.target);button.disabled=true;button.textContent='连接中';await login(String(data.get('code')).trim(),String(data.get('name')).trim());}});
  document.addEventListener('input',e=>{if(e.target.closest('#edit-form')&&state.modal)state.modal.dirty=true;if(e.target.classList.contains('history-edit-content')){const id=e.target.closest('.history-record').dataset.recordId,draft=state.modal?.historyEdits?.get(id);if(draft)draft.dirty=e.target.value!==draft.originalContent;}if(e.target.name==='progress')$('#progress-output').textContent=e.target.value+'%';if(state.modal?.mode==='progress')progressDirty();});
  document.addEventListener('change',e=>{if(e.target.closest('#edit-form')&&state.modal)state.modal.dirty=true;if(e.target.name==='status'&&e.target.value==='done'){const range=$('[name="progress"]');range.value=100;$('#progress-output').textContent='100%';}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal&&!state.modal.dirty)close();if(e.key==='Tab'&&state.modal){const nodes=[...$('#modal-root').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  window.addEventListener('offline',()=>{state.sync='offline';render();});
  window.addEventListener('online',async()=>{if(state.session?.authenticated){try{state.board=await request('/api/board');connect();render();}catch(e){toast(e.message,true);}}});
  window.addEventListener('beforeunload',e=>{if(state.modal?.dirty){e.preventDefault();e.returnValue='';}});
  initialize();
})();
