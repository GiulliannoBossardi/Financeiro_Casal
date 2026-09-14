/* ============================================
   FIREBASE — SDK v10 (modular via CDN compat)
============================================ */
let _db = null;

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  _db = firebase.firestore();
  _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
}

/* ============================================
   DB — dados isolados por usuário no Firestore
   
   Estrutura no Firestore:
     /global/dados/{chave}          → compartilhado: lista de usuários
     /usuarios/{userId}/dados/{chave} → privado: dados de cada usuário
   
   Chaves globais (compartilhadas entre todos):
     usuarios, theme, sidebarCollapsed
   
   Chaves privadas (isoladas por usuário logado):
     salarios, extras, saidas, entradas,
     investimentos, criterios, tiposConta, tiposInvest
============================================ */
const CHAVES_GLOBAIS = new Set(['usuarios','theme','sidebarCollapsed']);

const DB = {
  _cache: {},
  _unsubscribe: null,   // cancela listener anterior ao trocar de usuário

  /* Retorna a coleção correta para a chave */
  _col(k) {
    if (CHAVES_GLOBAIS.has(k)) {
      return _db.collection('global').doc('dados').collection('chaves');
    }
    const uid = currentUser ? String(currentUser.id) : '_anon';
    return _db.collection('usuarios').doc(uid).collection('dados');
  },

  get(k) {
    return this._cache[k] !== undefined ? this._cache[k] : null;
  },

  set(k, v) {
    this._cache[k] = v;
    if (_db) {
      this._col(k).doc(k).set({ data: JSON.stringify(v) })
        .catch(err => console.error('Firestore set error:', k, err));
    }
  },

  /* Carrega dados globais + dados do usuário logado */
  async loadAll() {
    if (!_db) return;
    this._cache = {};
    try {
      // Dados globais
      const snapGlobal = await _db.collection('global').doc('dados').collection('chaves').get();
      snapGlobal.forEach(doc => {
        try { this._cache[doc.id] = JSON.parse(doc.data().data); } catch {}
      });
      // Dados privados do usuário logado
      if (currentUser) {
        const uid = String(currentUser.id);
        const snapUser = await _db.collection('usuarios').doc(uid).collection('dados').get();
        snapUser.forEach(doc => {
          try { this._cache[doc.id] = JSON.parse(doc.data().data); } catch {}
        });
      }
    } catch (err) {
      console.error('Firestore loadAll error:', err);
    }
  },

  /* Listener em tempo real — escuta global + dados do usuário logado */
  listenAll(onUpdate) {
    if (!_db) return;
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }

    const applyChanges = (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') {
          delete this._cache[change.doc.id];
        } else {
          try { this._cache[change.doc.id] = JSON.parse(change.doc.data().data); } catch {}
        }
      });
      if (onUpdate) onUpdate();
    };

    const unsubGlobal = _db.collection('global').doc('dados').collection('chaves')
      .onSnapshot(applyChanges, err => console.error('Firestore global listener:', err));

    let unsubUser = () => {};
    if (currentUser) {
      const uid = String(currentUser.id);
      unsubUser = _db.collection('usuarios').doc(uid).collection('dados')
        .onSnapshot(applyChanges, err => console.error('Firestore user listener:', err));
    }

    this._unsubscribe = () => { unsubGlobal(); unsubUser(); };
  },

  /* Ao fazer logout, limpa cache privado e cancela listener */
  clearUserData() {
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
    const keysToKeep = [...CHAVES_GLOBAIS];
    Object.keys(this._cache).forEach(k => {
      if (!keysToKeep.includes(k)) delete this._cache[k];
    });
  },

  /* Inicializa chaves padrão se não existirem */
  init() {
    if (!this.get('salarios'))     this.set('salarios', []);
    if (!this.get('extras'))       this.set('extras', []);
    if (!this.get('saidas'))       this.set('saidas', []);
    if (!this.get('entradas'))     this.set('entradas', []);
    if (!this.get('investimentos'))this.set('investimentos', []);
    if (!this.get('criterios'))    this.set('criterios', ['Hora Extra','Bônus','PLR','Comissão']);
    if (!this.get('tiposConta'))   this.set('tiposConta', ['Cartão de Crédito','Boleto','Financiamento','PIX','Salário','Aluguel']);
    if (!this.get('tiposInvest'))  this.set('tiposInvest', ['Renda Fixa','Ações','FII','Tesouro Direto','Criptomoedas','CDB']);
    if (!this.get('theme'))        this.set('theme', 'dark');
    if (!this.get('usuarios'))     this.set('usuarios', [{id:1,nome:'Administrador',perfil:'admin',senha:'admin123'}]);
  }
};


/* ── Lê filtro de coluna (retorna '' se elemento não existe) ── */
function cf(id){ const el=document.getElementById(id); return el?(el.value||'').toLowerCase().trim():''; }
/* ============================================
   FMT
============================================ */
const Fmt={
  brl(v){return(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});},
  parse(s){return parseFloat((s||'').replace(/\./g,'').replace(',','.'))||0;},
  ref(r){if(!r)return'—';const[y,m]=r.split('-');return['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]+'/'+y;},
  toInput(v){if(!v&&v!==0)return'';return(+v).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.');},
  uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2);},
  addMonths(ym,n){const[y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+n,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;},
  nowYM(){const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;}
};

/* ============================================
   TOAST
============================================ */
const Toast={show(msg,type='info',dur=3200){const c=document.getElementById('toastContainer');const t=document.createElement('div');t.className=`toast ${type}`;t.innerHTML=`<div class="toast-dot"></div><span>${msg}</span>`;c.appendChild(t);setTimeout(()=>{t.style.animation='toastOut .3s ease forwards';setTimeout(()=>t.remove(),300);},dur);}};

/* ============================================
   TEMA
============================================ */
function toggleTheme(){const n=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);DB.set('theme',n);}
function initTheme(){document.documentElement.setAttribute('data-theme',DB.get('theme')||'dark');}
function togglePwd(id,btn){const el=document.getElementById(id);const show=el.type==='password';el.type=show?'text':'password';btn.innerHTML=show?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;}

/* ============================================
   SIDEBAR COLLAPSE
============================================ */
let sidebarCollapsed=false;
function toggleSidebar(){
  sidebarCollapsed=!sidebarCollapsed;
  const sb=document.getElementById('sidebar');
  const icon=document.getElementById('collapseIcon');
  sb.classList.toggle('collapsed',sidebarCollapsed);
  icon.textContent=sidebarCollapsed?'›':'‹';
  DB.set('sidebarCollapsed',sidebarCollapsed);
}
function initSidebar(){
  sidebarCollapsed=DB.get('sidebarCollapsed')||false;
  if(sidebarCollapsed){
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('collapseIcon').textContent='›';
  }
}

/* ============================================
   AUTH — mantém sessão entre recargas
============================================ */
let currentUser=null;

async function fazerLogin(){
  const nome=document.getElementById('loginUser').value.trim();
  const senha=document.getElementById('loginPass').value;
  const err=document.getElementById('loginError');
  const user=(DB.get('usuarios')||[]).find(u=>u.nome.toLowerCase()===nome.toLowerCase()&&u.senha===senha);
  if(!user){err.classList.add('visible');document.getElementById('loginPass').value='';return;}
  err.classList.remove('visible');
  currentUser=user;
  sessionStorage.setItem('fp_session',JSON.stringify({userId:user.id}));
  /* Carrega os dados privados do usuário e inicia listener isolado */
  mostrarLoading('Carregando seus dados…');
  await DB.loadAll();
  DB.init();
  DB.listenAll(()=>{
    renderizarTudo();
    renderCriterios();renderTiposConta();renderTiposInvest();
  });
  ocultarLoading();
  entrarNoApp();
  Toast.show(`Bem-vindo, ${user.nome}!`,'success');
}

function entrarNoApp(silent=false){
  const ls=document.getElementById('loginScreen'),app=document.getElementById('appWrapper');
  ls.classList.add('hidden');
  setTimeout(()=>{ls.style.display='none';app.classList.add('visible');},350);
  atualizarAvatar();
  reconstruirFiltros();
  renderizarTudo();
  renderCriterios();renderTiposConta();renderTiposInvest();
  const ultimaAba=sessionStorage.getItem('fp_tab')||'salario';
  const abaValida=tabNames[ultimaAba]?ultimaAba:(ultimaAba==='saidas'||ultimaAba==='entradas'?'entradasaidas':'salario');
  navigateTo(abaValida,true);
}

function fazerLogout(){
  /* Para listener e limpa dados privados do cache */
  DB.clearUserData();
  currentUser=null;
  sessionStorage.removeItem('fp_session');
  sessionStorage.removeItem('fp_tab');
  closeUserDropdown();
  const ls=document.getElementById('loginScreen'),app=document.getElementById('appWrapper');
  ls.style.display='flex';
  app.classList.remove('visible');
  setTimeout(()=>ls.classList.remove('hidden'),10);
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
  document.getElementById('loginError').classList.remove('visible');
  Toast.show('Sessão encerrada','info');
}

async function tentarRestaurarSessao(){
  const sess=sessionStorage.getItem('fp_session');
  if(!sess)return false;
  try{
    const{userId}=JSON.parse(sess);
    const user=(DB.get('usuarios')||[]).find(u=>u.id===userId);
    if(!user)return false;
    currentUser=user;
    /* Carrega dados privados do usuário restaurado */
    await DB.loadAll();
    DB.init();
    DB.listenAll(()=>{
      renderizarTudo();
      renderCriterios();renderTiposConta();renderTiposInvest();
    });
    return true;
  }catch{return false;}
}

/* ============================================
   DROPDOWN
============================================ */
function toggleUserDropdown(){const dd=document.getElementById('userDropdown'),av=document.getElementById('userAvatar'),open=dd.classList.contains('open');dd.classList.toggle('open',!open);av.classList.toggle('open',!open);}
function closeUserDropdown(){document.getElementById('userDropdown').classList.remove('open');document.getElementById('userAvatar').classList.remove('open');}
document.addEventListener('click',e=>{const w=document.querySelector('.avatar-wrap');if(w&&!w.contains(e.target))closeUserDropdown();});
function abrirTrocarSenha(){closeUserDropdown();['novaSenha','confirmarSenha'].forEach(id=>document.getElementById(id).value='');const e=document.getElementById('senhaErro');e.style.display='none';e.textContent='';document.getElementById('modalTrocarSenha').classList.remove('hidden');}
function confirmarTrocarSenha(){const nova=document.getElementById('novaSenha').value,conf=document.getElementById('confirmarSenha').value;const errEl=document.getElementById('senhaErro');if(nova.length<4){errEl.textContent='A senha deve ter ao menos 4 caracteres.';errEl.style.display='block';return;}if(nova!==conf){errEl.textContent='As senhas não coincidem.';errEl.style.display='block';return;}errEl.style.display='none';const users=DB.get('usuarios')||[];const idx=users.findIndex(u=>u.id===currentUser.id);if(idx>-1){users[idx].senha=nova;currentUser.senha=nova;DB.set('usuarios',users);}closeModal('modalTrocarSenha');Toast.show('Senha alterada com sucesso','success');}

/* ============================================
   NAVEGAÇÃO
============================================ */
const tabNames={salario:'Salário',entradasaidas:'Entradas / Saídas',controle:'Controle',investimento:'Investimento',consolidado:'Consolidado',resumo:'Resumo',configuracao:'Configuração'};
function navigateTo(tab, skipSave=false){
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
  document.querySelectorAll('.tab-panel').forEach(el=>el.classList.toggle('active',el.id==='tab-'+tab));
  document.getElementById('topbarTitle').textContent=tabNames[tab]||tab;
  document.querySelector('.main').scrollTo({top:0,behavior:'smooth'});
  if(!skipSave)sessionStorage.setItem('fp_tab',tab);
  syncFiltroDisplays();
  if(tab==='controle')renderControle();
  if(tab==='consolidado')renderConsolidado();
  if(tab==='investimento'){renderInvestTable();atualizarStatsInvest();}
  if(tab==='entradasaidas'){renderSaidasTable();atualizarStatsSaida();renderEntradasTable();atualizarStatsEntrada();atualizarStatsES();}
  if(tab==='resumo'){initResumoTab();}
}
document.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',()=>navigateTo(item.dataset.tab)));
document.querySelectorAll('.sub-tab').forEach(tab=>{tab.addEventListener('click',()=>{const k=tab.dataset.subtab;document.querySelectorAll('.sub-tab').forEach(t=>t.classList.toggle('active',t.dataset.subtab===k));document.querySelectorAll('.sub-panel').forEach(p=>p.classList.toggle('active',p.id==='subtab-'+k));});});

/* ============================================
   MÁSCARA MOEDA
============================================ */
function maskCurrency(input){let v=input.value.replace(/\D/g,'');if(!v){input.value='';return;}v=(parseInt(v)/100).toFixed(2).replace('.',',').replace(/(\d)(?=(\d{3})+(?!\d))/g,'$1.');input.value=v;}

/* ============================================
   FILTRO GLOBAL
============================================ */
let filtroAno=String(new Date().getFullYear()), filtroRef='';

const abaFiltroAnos =['filtroAno','esFiltroAnoDisp','ctrlFiltroAnoDisp','investFiltroAnoDisp'];
const abaFiltroRefs =['filtroRef','esFiltroRefDisp','ctrlFiltroRefDisp','investFiltroRefDisp'];
const abaFiltroLabels=['filtroLabel','esFiltroLabel','ctrlFiltroLabel','investFiltroLabel'];

function getAllRefs(){
  const set=new Set();
  (DB.get('salarios')||[]).forEach(s=>set.add(s.ref));
  (DB.get('extras')||[]).forEach(e=>set.add(e.ref));
  [(DB.get('entradas')||[]),...(DB.get('saidas')||[]),...(DB.get('investimentos')||[])].forEach(e=>{
    if(!e)return;
    if(e.forma==='parcelado'&&e.primeiraParcela){
      for(let i=0;i<(e.nParcelas||1);i++)set.add(Fmt.addMonths(e.primeiraParcela,i));
    }else if(e.ref){set.add(e.ref);}
  });
  /* Ordem cronológica: do mais antigo para o mais novo */
  return[...set].sort();
}

function reconstruirFiltros(){
  const allRefs=getAllRefs();
  const anoAtual=String(new Date().getFullYear());
  const anos=[...new Set([...allRefs.map(r=>r.split('-')[0]),anoAtual])].sort();
  const refs=filtroAno?allRefs.filter(r=>r.startsWith(filtroAno+'-')):allRefs;

  abaFiltroAnos.forEach(id=>{
    const sel=document.getElementById(id); if(!sel)return;
    sel.innerHTML='<option value="">Todos</option>';
    anos.forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;sel.appendChild(o);});
    sel.value=filtroAno;
  });

  abaFiltroRefs.forEach(id=>{
    const sel=document.getElementById(id); if(!sel)return;
    sel.innerHTML='<option value="">Todos os períodos</option>';
    refs.forEach(r=>{const o=document.createElement('option');o.value=r;o.textContent=Fmt.ref(r);sel.appendChild(o);});
    sel.value=filtroRef;
  });

  atualizarLabels();
}

function atualizarLabels(){
  abaFiltroLabels.forEach(id=>{
    const lbl=document.getElementById(id); if(!lbl)return;
    if(filtroRef){lbl.textContent='Exibindo: '+Fmt.ref(filtroRef);lbl.style.display='inline';}
    else if(filtroAno){lbl.textContent='Ano: '+filtroAno;lbl.style.display='inline';}
    else{lbl.style.display='none';}
  });
}

function syncFiltroDisplays(){
  abaFiltroAnos.forEach(id=>{const s=document.getElementById(id);if(s)s.value=filtroAno;});
  abaFiltroRefs.forEach(id=>{const s=document.getElementById(id);if(s)s.value=filtroRef;});
  atualizarLabels();
}

function onFiltroAnoChange(){
  const src=abaFiltroAnos.find(id=>{const s=document.getElementById(id);return s&&document.activeElement===s;});
  filtroAno=document.getElementById(src||'filtroAno').value;
  filtroRef='';
  reconstruirFiltros();
  renderizarTudo();
}

function onFiltroRefChange(){
  const src=abaFiltroRefs.find(id=>{const s=document.getElementById(id);return s&&document.activeElement===s;});
  filtroRef=document.getElementById(src||'filtroRef').value;
  syncFiltroDisplays();
  renderizarTudo();
}

function limparFiltro(){
  filtroAno='';filtroRef='';
  reconstruirFiltros();
  renderizarTudo();
}

function renderizarTudo(){
  renderSalarioTable();renderExtrasTable();atualizarStats();
  renderSaidasTable();atualizarStatsSaida();
  renderEntradasTable();atualizarStatsEntrada();
  atualizarStatsES();
  renderInvestTable();atualizarStatsInvest();
  renderControle();
  renderConsolidado();
}

/* ============================================
   SORT helpers
============================================ */
const sortSt={salario:{col:'ref',dir:1},extras:{col:'ref',dir:1}};
function sortTable(tbl,col){if(sortSt[tbl].col===col)sortSt[tbl].dir*=-1;else{sortSt[tbl].col=col;sortSt[tbl].dir=1;}const tableEl=document.getElementById(tbl==='salario'?'salarioTable':'extrasTable');tableEl.querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(sortSt[tbl].dir===1?'↑':'↓'):'↕';});tbl==='salario'?renderSalarioTable():renderExtrasTable();}

/* ============================================
   ABA SALÁRIO
============================================ */
let editingSalRef=null;
function getSalRows(ano,ref){
  let raw=DB.get('salarios')||[];
  if(ref)raw=raw.filter(e=>e.ref===ref);else if(ano)raw=raw.filter(e=>e.ref.startsWith(ano+'-'));
  const map={};
  raw.forEach(e=>{if(!map[e.ref])map[e.ref]={ref:e.ref,adiantamento:0,pagamento:0,bruto:0};if(e.tipo==='adiantamento')map[e.ref].adiantamento+=e.valor;if(e.tipo==='pagamento')map[e.ref].pagamento+=e.valor;if(e.tipo==='bruto')map[e.ref].bruto+=e.valor;});
  return Object.values(map).map(r=>({...r,liquido:r.adiantamento+r.pagamento}));
}
function renderSalarioTable(){
  const tbody=document.getElementById('salarioBody');
  const srch=document.getElementById('filterSalario').value.toLowerCase();
  let rows=getSalRows(filtroAno,filtroRef);
  if(srch)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch));
  const{col,dir}=sortSt.salario;
  rows.sort((a,b)=>{const av=col==='ref'?a.ref:(a[col]||0),bv=col==='ref'?b.ref:(b[col]||0);return av<bv?-dir:av>bv?dir:0;});
  document.getElementById('salarioBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');
  atualizarStats();
  if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6">Nenhum registro encontrado.</td></tr>`;return;}
  tbody.innerHTML=rows.map(r=>r.ref===editingSalRef?buildSalEditRow(r):buildSalReadRow(r)).join('');
}
function buildSalReadRow(r){return`<tr><td class="td-ref">${Fmt.ref(r.ref)}</td><td class="td-value-income">${Fmt.brl(r.adiantamento)}</td><td class="td-value-income">${Fmt.brl(r.pagamento)}</td><td class="td-value-income" style="font-weight:600;">${Fmt.brl(r.liquido)}</td><td class="td-value-neutral">${r.bruto?Fmt.brl(r.bruto):'<span style="color:var(--text-muted)">—</span>'}</td><td><div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoSal('${r.ref}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirSalario('${r.ref}')" title="Excluir">✕</button></div></td></tr>`;}
function buildSalEditRow(r){return`<tr class="row-editing"><td><input type="month" class="inline-month" id="se_ref" value="${r.ref}" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="se_adi" value="${Fmt.toInput(r.adiantamento)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></div></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="se_pag" value="${Fmt.toInput(r.pagamento)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></div></td><td><span class="inline-auto">auto</span></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="se_bru" value="${Fmt.toInput(r.bruto)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'sal','${r.ref}')"/></div></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarSal('${r.ref}')" title="Confirmar">✔</button><button class="btn-icon cancel-edit" onclick="cancelarSal()" title="Cancelar">✕</button></div></td></tr>`;}
function iniciarEdicaoSal(ref){editingSalRef=ref;renderSalarioTable();setTimeout(()=>{const el=document.getElementById('se_ref');if(el)el.focus();},40);}
function cancelarSal(){editingSalRef=null;renderSalarioTable();}
function salvarSal(refOrig){const novaRef=document.getElementById('se_ref').value;if(!novaRef){Toast.show('Informe a referência','error');return;}const adi=Fmt.parse(document.getElementById('se_adi').value);const pag=Fmt.parse(document.getElementById('se_pag').value);const bru=Fmt.parse(document.getElementById('se_bru').value);let sal=DB.get('salarios')||[];sal=sal.filter(e=>e.ref!==refOrig);if(adi>0)sal.push({id:Fmt.uid(),ref:novaRef,tipo:'adiantamento',valor:adi});if(pag>0)sal.push({id:Fmt.uid(),ref:novaRef,tipo:'pagamento',valor:pag});if(bru>0)sal.push({id:Fmt.uid(),ref:novaRef,tipo:'bruto',valor:bru});DB.set('salarios',sal);editingSalRef=null;reconstruirFiltros();renderSalarioTable();atualizarStats();Toast.show('Salário atualizado','success');}

/* Extras */
let editingExtraId=null;
function renderExtrasTable(){
  const tbody=document.getElementById('extrasBody');
  const srch=document.getElementById('filterExtras').value.toLowerCase();
  let rows=DB.get('extras')||[];
  if(filtroRef)rows=rows.filter(r=>r.ref===filtroRef);else if(filtroAno)rows=rows.filter(r=>r.ref.startsWith(filtroAno+'-'));
  if(srch)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch)||r.tipo.toLowerCase().includes(srch));
  const{col,dir}=sortSt.extras;
  rows.sort((a,b)=>{const av=col==='ref'?a.ref:col==='liquido'?a.liquido:col==='bruto'?a.bruto:a.tipo,bv=col==='ref'?b.ref:col==='liquido'?b.liquido:col==='bruto'?b.bruto:b.tipo;return av<bv?-dir:av>bv?dir:0;});
  document.getElementById('extrasBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');
  atualizarStats();
  if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="5">Nenhum extra registrado.</td></tr>`;return;}
  const criterios=DB.get('criterios')||[];
  tbody.innerHTML=rows.map(r=>r.id===editingExtraId?buildExtEditRow(r,criterios):buildExtReadRow(r)).join('');
}
function buildExtReadRow(r){return`<tr><td class="td-ref">${Fmt.ref(r.ref)}</td><td><span class="td-tag">${r.tipo}</span></td><td class="td-value-income">${Fmt.brl(r.liquido||0)}</td><td class="td-value-neutral">${(r.bruto||0)?Fmt.brl(r.bruto):'<span style="color:var(--text-muted)">—</span>'}</td><td><div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoExt('${r.id}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirExtra('${r.id}')" title="Excluir">✕</button></div></td></tr>`;}
function buildExtEditRow(r,criterios){const opts=criterios.map(c=>`<option value="${c}"${c===r.tipo?' selected':''}>${c}</option>`).join('');return`<tr class="row-editing"><td><input type="month" class="inline-month" id="ee_ref" value="${r.ref}" onkeydown="handleInlineKey(event,'ext','${r.id}')"/></td><td><select class="inline-select" id="ee_tipo">${opts||`<option value="${r.tipo}">${r.tipo}</option>`}</select></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="ee_liq" value="${Fmt.toInput(r.liquido||0)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'ext','${r.id}')"/></div></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="ee_bru" value="${Fmt.toInput(r.bruto||0)}" placeholder="0,00" oninput="maskCurrency(this)" onkeydown="handleInlineKey(event,'ext','${r.id}')"/></div></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarExt('${r.id}')" title="Confirmar">✔</button><button class="btn-icon cancel-edit" onclick="cancelarExt()" title="Cancelar">✕</button></div></td></tr>`;}
function iniciarEdicaoExt(id){editingExtraId=id;renderExtrasTable();setTimeout(()=>{const el=document.getElementById('ee_ref');if(el)el.focus();},40);}
function cancelarExt(){editingExtraId=null;renderExtrasTable();}
function salvarExt(id){const novaRef=document.getElementById('ee_ref').value;const tipo=document.getElementById('ee_tipo').value;const liquido=Fmt.parse(document.getElementById('ee_liq').value);const bruto=Fmt.parse(document.getElementById('ee_bru').value);if(!novaRef){Toast.show('Informe a referência','error');return;}if(!tipo){Toast.show('Selecione o tipo','error');return;}if(!liquido&&!bruto){Toast.show('Informe ao menos o Líquido ou Bruto','error');return;}const ext=DB.get('extras')||[];const idx=ext.findIndex(e=>e.id===id);if(idx>-1)ext[idx]={...ext[idx],ref:novaRef,tipo,liquido,bruto};DB.set('extras',ext);editingExtraId=null;reconstruirFiltros();renderExtrasTable();atualizarStats();Toast.show('Extra atualizado','success');}
function handleInlineKey(e,tbl,key){if(e.key==='Enter'){e.preventDefault();tbl==='sal'?salvarSal(key):salvarExt(key);}if(e.key==='Escape'){tbl==='sal'?cancelarSal():cancelarExt();}}

/* Exclusão Salário */
let pendingDeleteSalRef=null;
function pedirExcluirSalario(ref){pendingDeleteSalRef=ref;document.getElementById('deleteSalarioMsg').innerHTML=`Excluir todos os registros de <strong style="color:var(--text-primary)">${Fmt.ref(ref)}</strong>?`;document.getElementById('modalExcluirSalario').classList.remove('hidden');}
function confirmarExclusaoSalario(){if(!pendingDeleteSalRef)return;DB.set('salarios',(DB.get('salarios')||[]).filter(e=>e.ref!==pendingDeleteSalRef));closeModal('modalExcluirSalario');pendingDeleteSalRef=null;reconstruirFiltros();renderSalarioTable();atualizarStats();Toast.show('Registros excluídos','error');}

/* Exclusão Extra */
let pendingDeleteExtraId=null;
function pedirExcluirExtra(id){const r=(DB.get('extras')||[]).find(x=>x.id===id);if(!r)return;pendingDeleteExtraId=id;document.getElementById('deleteExtraDesc').textContent=`${r.tipo} (${Fmt.ref(r.ref)})`;document.getElementById('modalExcluirExtra').classList.remove('hidden');}
function confirmarExclusaoExtra(){DB.set('extras',(DB.get('extras')||[]).filter(r=>r.id!==pendingDeleteExtraId));closeModal('modalExcluirExtra');pendingDeleteExtraId=null;reconstruirFiltros();renderExtrasTable();atualizarStats();Toast.show('Extra removido','error');}

/* Inserção Salário */
function onTabelaChange(){const t=document.getElementById('insertTabela').value;document.getElementById('salarioFields').style.display=t==='salario'?'block':'none';document.getElementById('extrasFields').style.display=t==='extras'?'block':'none';}
function confirmarInsercaoSalario(){
  const ref=document.getElementById('insertRef').value;
  if(!ref){Toast.show('Selecione a referência','error');return;}
  const tab=document.getElementById('insertTabela').value;
  if(tab==='salario'){
    const tipo=document.getElementById('salarioTipo').value;
    const valor=Fmt.parse(document.getElementById('salarioValor').value);
    if(!valor){Toast.show('Informe um valor válido','error');return;}
    const sal=DB.get('salarios')||[];sal.push({id:Fmt.uid(),ref,tipo,valor});DB.set('salarios',sal);
    document.getElementById('salarioValor').value='';
    Toast.show(`${tipo.charAt(0).toUpperCase()+tipo.slice(1)} de ${Fmt.brl(valor)} registrado`,'success');
  }else{
    const tipo=document.getElementById('extrasTipo').value;
    if(!tipo){Toast.show('Nenhum critério disponível','error');return;}
    const liquido=Fmt.parse(document.getElementById('extrasLiquido').value);
    const bruto=Fmt.parse(document.getElementById('extrasBruto').value);
    if(!liquido&&!bruto){Toast.show('Informe ao menos o Líquido ou Bruto','error');return;}
    const ext=DB.get('extras')||[];ext.push({id:Fmt.uid(),ref,tipo,liquido,bruto});DB.set('extras',ext);
    document.getElementById('extrasLiquido').value='';document.getElementById('extrasBruto').value='';
    Toast.show(`Extra "${tipo}" registrado`,'success');
  }
  reconstruirFiltros();renderSalarioTable();renderExtrasTable();atualizarStats();renderControle();
}

/* Stats Salário */
function atualizarStats(){
  const srchSal=(document.getElementById('filterSalario')?document.getElementById('filterSalario').value:'').toLowerCase();
  const srchExt=(document.getElementById('filterExtras')?document.getElementById('filterExtras').value:'').toLowerCase();
  let rows=getSalRows(filtroAno,filtroRef);
  if(srchSal)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srchSal));
  let ext=DB.get('extras')||[];
  if(filtroRef)ext=ext.filter(e=>e.ref===filtroRef);else if(filtroAno)ext=ext.filter(e=>e.ref.startsWith(filtroAno+'-'));
  if(srchExt)ext=ext.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srchExt)||r.tipo.toLowerCase().includes(srchExt));
  document.getElementById('statLiquido').textContent=Fmt.brl(rows.reduce((s,r)=>s+r.liquido,0));
  document.getElementById('statBruto').textContent=Fmt.brl(rows.reduce((s,r)=>s+r.bruto,0));
  document.getElementById('statExtras').textContent=Fmt.brl(ext.reduce((s,r)=>s+(r.liquido||0),0));
}

/* ============================================
   ABA ENTRADAS / SAÍDAS — tabela unificada
============================================ */
const esSortSt={col:'ref',dir:1};
let editingESId=null;   // {id, natureza}  natureza='entrada'|'saida'

function expandirSaidas(saidas,ano,ref){
  const rows=[];
  saidas.forEach(s=>{
    if(s.forma==='avista'){const r=s.ref;const ok=ref?r===ref:(ano?r.startsWith(ano+'-'):true);if(ok)rows.push({...s,parcelaNum:null,parcelaRef:r,parcelaTotal:1,valorExib:s.valor,_parcelaIdx:'av'});}
    else{for(let i=0;i<(s.nParcelas||1);i++){const pr=Fmt.addMonths(s.primeiraParcela,i);const ok=ref?pr===ref:(ano?pr.startsWith(ano+'-'):true);if(ok)rows.push({...s,parcelaNum:i+1,parcelaRef:pr,parcelaTotal:s.nParcelas,valorExib:s.valor,_parcelaIdx:i});}}
  });
  return rows;
}

function expandirEntradas(entradas,ano,ref){
  const rows=[];
  entradas.forEach(e=>{
    if(e.forma==='avista'){const r=e.ref;const ok=ref?r===ref:(ano?r.startsWith(ano+'-'):true);if(ok)rows.push({...e,parcelaNum:null,parcelaRef:r,parcelaTotal:1,valorExib:e.valor,_parcelaIdx:'av'});}
    else{for(let i=0;i<(e.nParcelas||1);i++){const pr=Fmt.addMonths(e.primeiraParcela,i);const ok=ref?pr===ref:(ano?pr.startsWith(ano+'-'):true);if(ok)rows.push({...e,parcelaNum:i+1,parcelaRef:pr,parcelaTotal:e.nParcelas,valorExib:e.valor,_parcelaIdx:i});}}
  });
  return rows;
}

function sortES(col){
  if(esSortSt.col===col)esSortSt.dir*=-1;else{esSortSt.col=col;esSortSt.dir=1;}
  document.getElementById('esTable').querySelectorAll('thead th').forEach(th=>{
    th.classList.toggle('sorted',th.dataset.col===col);
    if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(esSortSt.dir===1?'\u2191':'\u2193'):'\u2195';
  });
  renderESTable();
}

/* Aliases mantidos para compatibilidade com Controle e Resumo */
function renderSaidasTable(){renderESTable();}
function renderEntradasTable(){renderESTable();}

function renderESTable(){
  const tbody=document.getElementById('esBody');
  if(!tbody)return;
  const cfRef   =cf('cfESRef');
  const cfNatEl =document.getElementById('cfESNatureza');
  const cfNat   =cfNatEl?cfNatEl.value:'';
  const cfTipoEl=document.getElementById('cfESTipo');
  const cfDesc  =cf('cfESDesc');
  const cfVal   =cf('cfESValor');
  const cfStEl  =document.getElementById('cfESStatus');
  const cfStatus=cfStEl?cfStEl.value:'';

  let eRows=expandirEntradas(DB.get('entradas')||[],filtroAno,filtroRef).map(r=>({...r,_natureza:'entrada'}));
  let sRows=expandirSaidas (DB.get('saidas')  ||[],filtroAno,filtroRef).map(r=>({...r,_natureza:'saida'}));
  let rows=[...eRows,...sRows];

  /* Popula o dropdown de Tipo com as opções realmente presentes na coluna (período/filtros atuais) */
  if(cfTipoEl){
    const tiposPresentes=[...new Set(rows.map(r=>r.tipo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const valorAtual=cfTipoEl.value;
    cfTipoEl.innerHTML='<option value="">Todos</option>'+tiposPresentes.map(t=>`<option value="${t}">${t}</option>`).join('');
    cfTipoEl.value=tiposPresentes.includes(valorAtual)?valorAtual:'';
  }
  const cfTipoAtual=cfTipoEl?cfTipoEl.value:'';

  /* Aplica todos os filtros de coluna */
  if(cfRef)   rows=rows.filter(r=>Fmt.ref(r.parcelaRef).toLowerCase().includes(cfRef));
  if(cfNat)   rows=rows.filter(r=>r._natureza===cfNat);
  if(cfTipoAtual) rows=rows.filter(r=>r.tipo===cfTipoAtual);
  if(cfDesc)  rows=rows.filter(r=>(r.descricao||'').toLowerCase().includes(cfDesc));
  if(cfVal)   rows=rows.filter(r=>Fmt.brl(r.valorExib).toLowerCase().includes(cfVal));
  if(cfStatus){
    rows=rows.filter(r=>{
      const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
      const pago=(r.pagos||{})[key]||false;
      return cfStatus==='pago'?pago:!pago;
    });
  }

  const{col,dir}=esSortSt;
  rows.sort((a,b)=>{
    let av,bv;
    if(col==='ref')       av=a.parcelaRef,bv=b.parcelaRef;
    else if(col==='natureza') av=a._natureza,bv=b._natureza;
    else if(col==='tipo') av=a.tipo,bv=b.tipo;
    else if(col==='descricao') av=a.descricao,bv=b.descricao;
    else if(col==='valor') av=a.valorExib,bv=b.valorExib;
    else av=a.parcelaRef,bv=b.parcelaRef;
    return av<bv?-dir:av>bv?dir:0;
  });

  const badgeEl=document.getElementById('esBadge');
  if(badgeEl)badgeEl.textContent=rows.length+' registro'+(rows.length!==1?'s':'');

  /* Passa as rows JÁ FILTRADAS para os cards */
  const eRowsFilt=rows.filter(r=>r._natureza==='entrada');
  const sRowsFilt=rows.filter(r=>r._natureza==='saida');
  atualizarStatsES(eRowsFilt,sRowsFilt);

  if(!rows.length){tbody.innerHTML='<tr class="empty-row"><td colspan="8">Nenhum lan\u00e7amento encontrado.</td></tr>';return;}

  const tipos=DB.get('tiposConta')||[];
  tbody.innerHTML=rows.map(r=>{
    const isEdit=editingESId&&editingESId.id===r.id&&editingESId.natureza===r._natureza;
    const isPrimeira=(r.parcelaNum===1||r.parcelaNum===null);
    if(isEdit&&isPrimeira)return buildESEditRow(r,tipos);
    if(isEdit)return buildESReadRow(r,true);
    return buildESReadRow(r,false);
  }).join('');
}

function buildESReadRow(r,inEdit){
  const parcelaStr=r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'\u2014';
  const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
  const pago=(r.pagos||{})[key]||false;
  const isEntrada=r._natureza==='entrada';
  const sc=pago?'pago':'pendente';
  const st=pago?(isEntrada?'\u2714 Recebido':'\u2714 Pago'):(isEntrada?'\u25cf Pendente':'\u25cf Pendente');
  const valClass=isEntrada?'td-value-income':'td-value-expense';
  const valStr=isEntrada?`+${Fmt.brl(r.valorExib)}`:`\u2212${Fmt.brl(r.valorExib)}`;
  const natBadge=isEntrada
    ?'<span class="nature-badge receita">\u2191 Entrada</span>'
    :'<span class="nature-badge despesa">\u2193 Sa\u00edda</span>';
  const toggleFn=isEntrada?`toggleStatusEntrada('${r.id}','${r._parcelaIdx}')`:`toggleStatus('${r.id}','${r._parcelaIdx}')`;
  const editFn=isEntrada?`iniciarEdicaoES('${r.id}','entrada')`:`iniciarEdicaoES('${r.id}','saida')`;
  const delFn=isEntrada?`pedirExcluirEntrada('${r.id}')`:`pedirExcluirSaida('${r.id}')`;
  const acoes=inEdit?'':`<div class="actions-cell"><button class="btn-icon edit" onclick="${editFn}" title="Editar">\u270e</button><button class="btn-icon danger" onclick="${delFn}" title="Excluir">\u2715</button></div>`;
  return`<tr><td class="td-ref">${Fmt.ref(r.parcelaRef)}</td><td>${natBadge}</td><td><span class="td-tag">${r.tipo||'\u2014'}</span></td><td style="font-size:.84rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.descricao||'\u2014'}</td><td class="td-mono">${parcelaStr}</td><td class="${valClass}" style="font-family:var(--font-mono);font-weight:500;">${valStr}</td><td><button class="status-btn ${sc}" onclick="${toggleFn}">${st}<span class="status-dot"></span></button></td><td>${acoes}</td></tr>`;
}

function buildESEditRow(r,tipos){
  const tipoOpts=tipos.map(t=>`<option value="${t}"${t===r.tipo?' selected':''}>${t}</option>`).join('');
  const isParc=r.forma==='parcelado';
  const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
  const pago=(r.pagos||{})[key]||false;
  const isEntrada=r._natureza==='entrada';
  const sc=pago?'pago':'pendente';
  const st=pago?(isEntrada?'\u2714 Recebido':'\u2714 Pago'):'\u25cf Pendente';
  const toggleFn=isEntrada?`toggleStatusEntrada('${r.id}','${r._parcelaIdx}')`:`toggleStatus('${r.id}','${r._parcelaIdx}')`;
  const natBadge=isEntrada?'<span class="nature-badge receita">\u2191 Entrada</span>':'<span class="nature-badge despesa">\u2193 Sa\u00edda</span>';
  const parcelaCell=isParc
    ?`<div style="display:flex;gap:4px;align-items:center;"><input class="inline-input" id="esi_nparc" value="${r.nParcelas||1}" style="width:44px;text-align:center;" oninput="this.value=this.value.replace(/\\D/g,'')" onkeydown="handleInlineESKey(event,'${r.id}','${r._natureza}')"/><span style="color:var(--text-muted);font-size:.75rem;">parc.</span></div>`
    :'\u2014';
  return`<tr class="row-editing"><td class="td-ref">${Fmt.ref(r.parcelaRef)}</td><td>${natBadge}</td><td><select class="inline-select" id="esi_tipo" style="min-width:100px;">${tipoOpts}</select></td><td><input class="inline-input" id="esi_desc" value="${(r.descricao||'').replace(/"/g,'&quot;')}" style="min-width:110px;" onkeydown="handleInlineESKey(event,'${r.id}','${r._natureza}')"/></td><td class="td-mono">${parcelaCell}</td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="esi_val" value="${Fmt.toInput(r.valor)}" oninput="maskCurrency(this)" onkeydown="handleInlineESKey(event,'${r.id}','${r._natureza}')" style="min-width:80px;"/></div></td><td><button class="status-btn ${sc}" onclick="${toggleFn}">${st}<span class="status-dot"></span></button></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarES('${r.id}','${r._natureza}')">\u2714</button><button class="btn-icon cancel-edit" onclick="cancelarES()">\u2715</button></div></td></tr>`;
}

function iniciarEdicaoES(id,natureza){editingESId={id,natureza};renderESTable();setTimeout(()=>{const el=document.getElementById('esi_desc');if(el)el.focus();},40);}
function iniciarEdicaoSaida(id){iniciarEdicaoES(id,'saida');}
function iniciarEdicaoEntrada(id){iniciarEdicaoES(id,'entrada');}
function cancelarES(){editingESId=null;renderESTable();}
function cancelarSaida(){cancelarES();}
function cancelarEntrada(){cancelarES();}

function salvarES(id,natureza){
  const tipo=document.getElementById('esi_tipo').value;
  const descricao=document.getElementById('esi_desc').value.trim();
  const valor=Fmt.parse(document.getElementById('esi_val').value);
  if(!descricao){Toast.show('Informe a descri\u00e7\u00e3o','error');return;}
  if(!valor){Toast.show('Informe o valor','error');return;}
  const dbKey=natureza==='entrada'?'entradas':'saidas';
  const arr=DB.get(dbKey)||[];
  const idx=arr.findIndex(s=>s.id===id);
  if(idx<0)return;
  arr[idx].tipo=tipo;arr[idx].descricao=descricao;arr[idx].valor=valor;
  const npEl=document.getElementById('esi_nparc');
  if(npEl){const np=parseInt(npEl.value)||1;if(np!==arr[idx].nParcelas){arr[idx].nParcelas=np;const pagos=arr[idx].pagos||{};Object.keys(pagos).forEach(k=>{if(k!=='av'&&parseInt(k)>=np)delete pagos[k];});arr[idx].pagos=pagos;}}
  DB.set(dbKey,arr);editingESId=null;reconstruirFiltros();renderESTable();atualizarStatsES();renderControle();
  Toast.show(natureza==='entrada'?'Entrada atualizada':'Sa\u00edda atualizada','success');
}
function salvarSaida(id){salvarES(id,'saida');}
function salvarEntrada(id){salvarES(id,'entrada');}
function handleInlineESKey(e,id,nat){if(e.key==='Enter'){e.preventDefault();salvarES(id,nat);}if(e.key==='Escape')cancelarES();}
function handleInlineSaidaKey(e,id){handleInlineESKey(e,id,'saida');}
function handleInlineEntradaKey(e,id){handleInlineESKey(e,id,'entrada');}

function toggleStatus(id,parcelaIdx){
  const saidas=DB.get('saidas')||[];const idx=saidas.findIndex(s=>s.id===id);if(idx<0)return;
  if(!saidas[idx].pagos)saidas[idx].pagos={};
  const key=parcelaIdx==='av'?'av':parseInt(parcelaIdx);
  saidas[idx].pagos[key]=!saidas[idx].pagos[key];
  DB.set('saidas',saidas);renderESTable();
  Toast.show(saidas[idx].pagos[key]?'Marcado como pago':'Marcado como pendente','info');
}
function toggleStatusEntrada(id,parcelaIdx){
  const entradas=DB.get('entradas')||[];const idx=entradas.findIndex(e=>e.id===id);if(idx<0)return;
  if(!entradas[idx].pagos)entradas[idx].pagos={};
  const key=parcelaIdx==='av'?'av':parseInt(parcelaIdx);
  entradas[idx].pagos[key]=!entradas[idx].pagos[key];DB.set('entradas',entradas);renderESTable();
  Toast.show(entradas[idx].pagos[key]?'Marcado como recebido':'Marcado como pendente','info');
}

function atualizarStatsSaida(){atualizarStatsES();}
function atualizarStatsEntrada(){atualizarStatsES();}

function atualizarStatsES(eRows,sRows){
  /* Quando chamado sem args (ex: ao mudar período), aplica filtros de coluna */
  if(!eRows||!sRows){
    renderESTable(); /* renderESTable já chama atualizarStatsES com rows filtradas */
    return;
  }
  const totalE=eRows.reduce((s,r)=>s+r.valorExib,0);
  const totalS=sRows.reduce((s,r)=>s+r.valorExib,0);
  const saldo=totalE-totalS;
  let pagoE=0,pendE=0,pagoS=0,pendS=0;
  eRows.forEach(r=>{const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);if((r.pagos||{})[key])pagoE+=r.valorExib;else pendE+=r.valorExib;});
  sRows.forEach(r=>{const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);if((r.pagos||{})[key])pagoS+=r.valorExib;else pendS+=r.valorExib;});
  const g=id=>document.getElementById(id);
  if(g('entradaStatTotal'))g('entradaStatTotal').textContent=Fmt.brl(totalE);
  if(g('saidaStatTotal'))  g('saidaStatTotal').textContent=Fmt.brl(totalS);
  if(g('entradaStatPendente'))g('entradaStatPendente').textContent=Fmt.brl(pendE);
  if(g('saidaStatPendente'))  g('saidaStatPendente').textContent=Fmt.brl(pendS);
  const saldoEl=g('esStatSaldo');
  if(saldoEl){saldoEl.textContent=saldo>=0?Fmt.brl(saldo):`\u2212${Fmt.brl(Math.abs(saldo))}`;saldoEl.className='stat-value '+(saldo>=0?'income':'expense');}
  const cardEl=g('esSaldoCard');if(cardEl)cardEl.className='stat-card compact '+(saldo>=0?'green':'red');
  const confEl=g('esStatConfirmado');if(confEl)confEl.textContent=Fmt.brl(pagoE-pagoS);
}

/* Painel unificado Entradas/Saidas */
function onEsTipoLancamentoChange(){
  const tipo=document.getElementById('esTipoLancamento').value;
  const isEntrada=tipo==='entrada';
  const icon=document.getElementById('esPanelIcon');
  const title=document.getElementById('esPanelTitle');
  const sub=document.getElementById('esPanelSub');
  const btn=document.getElementById('esBtnConfirmar');
  const btnLabel=document.getElementById('esBtnLabel');
  const descEl=document.getElementById('esDescricao');
  const dividirLabel=document.getElementById('esDividirLabel');
  const divisaoValorLabel=document.getElementById('esDivisaoValorLabel');
  if(isEntrada){
    icon.style.background='rgba(0,201,122,.15)';icon.style.color='var(--income)';
    icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
    title.textContent='Registrar Entrada';sub.textContent='Adicionar recebimento';
    btn.style.background='var(--income)';btnLabel.textContent='Confirmar Entrada';
    descEl.placeholder='Ex: Aluguel, freelance...';
    if(dividirLabel)dividirLabel.textContent='Dividir esta receita com alguém';
    if(divisaoValorLabel)divisaoValorLabel.textContent='Valor da parte dela (a repassar)';
  } else {
    icon.style.background='rgba(255,77,106,.15)';icon.style.color='var(--expense)';
    icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 16 12 21 17 16"/><line x1="12" y1="21" x2="12" y2="9"/></svg>';
    title.textContent='Registrar Sa\u00edda';sub.textContent='Adicionar nova despesa';
    btn.style.background='var(--expense)';btnLabel.textContent='Confirmar Sa\u00edda';
    descEl.placeholder='Ex: Conta de luz, Nubank...';
    if(dividirLabel)dividirLabel.textContent='Dividir esta despesa com alguém';
    if(divisaoValorLabel)divisaoValorLabel.textContent='Valor da parte dela (a receber)';
  }
  atualizarValorLabelES();
  atualizarPreviewDivisaoES();
}
/* Rótulo do valor: à vista (1 parcela) vs parcelado (2+) — decidido pelo Nº de Parcelas */
function atualizarValorLabelES(){
  const tipo=document.getElementById('esTipoLancamento').value;
  const n=parseInt(document.getElementById('esNParcelas').value)||1;
  const valorLabel=document.getElementById('esValorLabel');
  if(!valorLabel)return;
  valorLabel.textContent=n>1?'Valor de cada parcela':(tipo==='entrada'?'Valor Recebido':'Valor Pago');
}

/* ============================================
   DIVISÃO DE LANÇAMENTO ENTRE 2 PESSOAS
============================================ */
let esDivisaoManual=false; // true quando o usuário editou o valor da divisão manualmente (não usar mais o auto 50/50)

function getPessoasConhecidas(){
  const saidas=DB.get('saidas')||[];
  const entradas=DB.get('entradas')||[];
  const set=new Set([...saidas,...entradas].map(r=>r.tipo).filter(t=>t&&!TIPOS_GENERICOS.has(t)));
  return [...set].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

function onEsDividirChange(){
  const on=document.getElementById('esDividir').checked;
  document.getElementById('esDivisaoDetalhes').style.display=on?'block':'none';
  if(on){
    document.getElementById('esPessoasList').innerHTML=getPessoasConhecidas().map(p=>`<option value="${p}"></option>`).join('');
    esDivisaoManual=false;
    aplicarDivisao50ES();
  }
}

function aplicarDivisao50ES(){
  const total=Fmt.parse(document.getElementById('esValor').value);
  const metade=total/2;
  document.getElementById('esDivisaoValor').value=metade>0?Fmt.toInput(metade):'';
  esDivisaoManual=false;
  atualizarPreviewDivisaoES();
}

/* Chamado a cada alteração no valor principal, para manter a divisão 50/50 em sincronia (se o usuário não a editou manualmente) */
function sincronizarDivisaoAoDigitarValorES(){
  if(document.getElementById('esDividir').checked && !esDivisaoManual){
    const total=Fmt.parse(document.getElementById('esValor').value);
    const metade=total/2;
    document.getElementById('esDivisaoValor').value=metade>0?Fmt.toInput(metade):'';
  }
  atualizarPreviewDivisaoES();
}

function atualizarPreviewDivisaoES(){
  const previewEl=document.getElementById('esDivisaoPreview');
  if(!previewEl)return;
  if(!document.getElementById('esDividir').checked){previewEl.textContent='';return;}
  const tipo=document.getElementById('esTipoLancamento').value;
  const total=Fmt.parse(document.getElementById('esValor').value);
  const parte=Fmt.parse(document.getElementById('esDivisaoValor').value);
  const pessoa=(document.getElementById('esDivisaoPessoa').value||'a pessoa').trim()||'a pessoa';
  if(!total||!parte){previewEl.textContent='Informe o valor total e o valor da parte dela para ver o resumo.';return;}
  const minhaParte=total-parte;
  if(tipo==='saida'){
    previewEl.innerHTML=`Você continua pagando o total (<strong>${Fmt.brl(total)}</strong>). Será criada automaticamente uma <strong style="color:var(--income)">Entrada de ${Fmt.brl(parte)}</strong> de <strong>${pessoa}</strong> (a receber) — sua parte líquida fica em ${Fmt.brl(minhaParte)}.`;
  } else {
    previewEl.innerHTML=`Você recebe o total (<strong>${Fmt.brl(total)}</strong>). Será criada automaticamente uma <strong style="color:var(--expense)">Saída de ${Fmt.brl(parte)}</strong> para ${pessoa} (a repassar) — sua parte líquida fica em ${Fmt.brl(minhaParte)}.`;
  }
}

function confirmarInsercaoES(){
  const tipo=document.getElementById('esTipoLancamento').value;
  const tipoConta=document.getElementById('esTipoConta').value;
  const descricao=document.getElementById('esDescricao').value.trim();
  const valor=Fmt.parse(document.getElementById('esValor').value);
  const nParcelas=parseInt(document.getElementById('esNParcelas').value)||0;
  const primeiraParcela=document.getElementById('esPrimeiraParcela').value;
  if(!tipoConta){Toast.show('Selecione o tipo de conta','error');return;}
  if(!descricao){Toast.show('Informe a descri\u00e7\u00e3o','error');return;}
  if(!valor){Toast.show('Informe o valor','error');return;}
  if(!primeiraParcela){Toast.show('Informe o m\u00eas/ano da 1\u00aa parcela (ou \u00fanica)','error');return;}
  if(!nParcelas||nParcelas<1){Toast.show('Informe o n\u00famero de parcelas (1 para \u00e0 vista)','error');return;}

  /* Divisão com outra pessoa */
  const dividir=document.getElementById('esDividir').checked;
  const pessoaDivisao=document.getElementById('esDivisaoPessoa').value.trim();
  const valorDivisao=Fmt.parse(document.getElementById('esDivisaoValor').value);
  if(dividir){
    if(!pessoaDivisao){Toast.show('Informe o nome da pessoa para dividir','error');return;}
    if(!valorDivisao){Toast.show('Informe o valor da parte dela','error');return;}
    if(valorDivisao>=valor){Toast.show('O valor da parte dela deve ser menor que o valor total','error');return;}
  }

  const dbKey=tipo==='entrada'?'entradas':'saidas';
  const forma=nParcelas>1?'parcelado':'avista';
  const rec={id:Fmt.uid(),ref:primeiraParcela,tipo:tipoConta,descricao,forma,valor,pagos:{},nParcelas,primeiraParcela};
  const arr=DB.get(dbKey)||[];arr.push(rec);DB.set(dbKey,arr);

  let msg=`${tipo==='entrada'?'Entrada':'Sa\u00edda'} "${descricao}" registrada`;
  if(dividir){
    const dbKey2=tipo==='entrada'?'saidas':'entradas';
    const rec2={id:Fmt.uid(),ref:primeiraParcela,tipo:pessoaDivisao,descricao,forma,valor:valorDivisao,pagos:{},nParcelas,primeiraParcela};
    const arr2=DB.get(dbKey2)||[];arr2.push(rec2);DB.set(dbKey2,arr2);
    msg+=` · ${tipo==='entrada'?'Sa\u00edda':'Entrada'} de ${Fmt.brl(valorDivisao)} para ${pessoaDivisao} criada automaticamente`;
  }
  Toast.show(msg,'success');

  ['esDescricao','esValor','esNParcelas','esPrimeiraParcela','esDivisaoPessoa','esDivisaoValor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('esDividir').checked=false;
  document.getElementById('esDivisaoDetalhes').style.display='none';
  esDivisaoManual=false;
  onEsTipoLancamentoChange();
  reconstruirFiltros();renderESTable();atualizarStatsES();renderControle();
}
function confirmarInsercaoSaida(){confirmarInsercaoES();}
function confirmarInsercaoEntrada(){confirmarInsercaoES();}

let pendingDeleteSaidaId=null;
function pedirExcluirSaida(id){const s=(DB.get('saidas')||[]).find(x=>x.id===id);if(!s)return;pendingDeleteSaidaId=id;document.getElementById('deleteSaidaDesc').textContent=s.descricao||'registro';document.getElementById('modalExcluirSaida').classList.remove('hidden');}
function confirmarExclusaoSaida(){DB.set('saidas',(DB.get('saidas')||[]).filter(s=>s.id!==pendingDeleteSaidaId));closeModal('modalExcluirSaida');pendingDeleteSaidaId=null;reconstruirFiltros();renderESTable();atualizarStatsES();renderControle();Toast.show('Sa\u00edda exclu\u00edda','error');}

let pendingDeleteEntradaId=null;
function pedirExcluirEntrada(id){const e=(DB.get('entradas')||[]).find(x=>x.id===id);if(!e)return;pendingDeleteEntradaId=id;document.getElementById('deleteEntradaDesc').textContent=e.descricao||'registro';document.getElementById('modalExcluirEntrada').classList.remove('hidden');}
function confirmarExclusaoEntrada(){DB.set('entradas',(DB.get('entradas')||[]).filter(e=>e.id!==pendingDeleteEntradaId));closeModal('modalExcluirEntrada');pendingDeleteEntradaId=null;reconstruirFiltros();renderESTable();atualizarStatsES();renderControle();Toast.show('Entrada exclu\u00edda','error');}


/* ============================================
   ABA INVESTIMENTO
============================================ */
const investSortSt={col:'ref',dir:1};
let editingInvestId=null;

function getInvestRows(ano,ref){
  let rows=DB.get('investimentos')||[];
  if(ref)rows=rows.filter(r=>r.ref===ref);else if(ano)rows=rows.filter(r=>r.ref.startsWith(ano+'-'));
  return rows;
}

function onInvestOperacaoChange(){
  const op=document.getElementById('investOperacao').value;
  const isRetirada=op==='retirada';
  document.getElementById('investValorLabel').textContent=isRetirada?'Valor Retirado':'Valor Aportado';
  const btn=document.getElementById('investBtnConfirmar');
  btn.style.background=isRetirada?'var(--expense)':'var(--invest)';
  document.getElementById('investBtnLabel').textContent=isRetirada?'Confirmar Retirada':'Confirmar Aporte';
}

function sortInvest(col){if(investSortSt.col===col)investSortSt.dir*=-1;else{investSortSt.col=col;investSortSt.dir=1;}document.getElementById('investTable').querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(investSortSt.dir===1?'↑':'↓'):'↕';});renderInvestTable();}

function renderInvestTable(){
  const tbody=document.getElementById('investBody');
  const srch=(document.getElementById('filterInvest').value||'').toLowerCase();
  let rows=getInvestRows(filtroAno,filtroRef);
  if(srch)rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||(r.descricao||'').toLowerCase().includes(srch)||(r.operacao||'aporte').toLowerCase().includes(srch));
  const cfIRef=cf('cfInvestRef'),cfIOp=cf('cfInvestOp'),cfITipo=cf('cfInvestTipoF'),cfIDesc=cf('cfInvestDesc'),cfIVal=cf('cfInvestValor');
  if(cfIRef)  rows=rows.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(cfIRef));
  if(cfIOp)   rows=rows.filter(r=>(r.operacao||'aporte').toLowerCase().includes(cfIOp));
  if(cfITipo) rows=rows.filter(r=>(r.tipo||'').toLowerCase().includes(cfITipo));
  if(cfIDesc) rows=rows.filter(r=>(r.descricao||'').toLowerCase().includes(cfIDesc));
  if(cfIVal)  rows=rows.filter(r=>Fmt.brl(r.valor).toLowerCase().includes(cfIVal));
  const{col,dir}=investSortSt;
  rows.sort((a,b)=>{let av,bv;if(col==='ref')av=a.ref,bv=b.ref;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='operacao')av=a.operacao||'aporte',bv=b.operacao||'aporte';else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valor,bv=b.valor;else av=a.ref,bv=b.ref;return av<bv?-dir:av>bv?dir:0;});
  document.getElementById('investBadge').textContent=rows.length+' registro'+(rows.length!==1?'s':'');
  atualizarStatsInvest();
  if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="6">Nenhum registro encontrado.</td></tr>`;return;}
  const tiposInvest=DB.get('tiposInvest')||[];
  tbody.innerHTML=rows.map(r=>{
    if(r.id===editingInvestId)return buildInvestEditRow(r,tiposInvest);
    const op=r.operacao||'aporte';
    const isRetirada=op==='retirada';
    const opBadge=isRetirada?`<span class="nature-badge despesa">📉 Retirada</span>`:`<span class="nature-badge receita">📈 Aporte</span>`;
    const valClass=isRetirada?'td-value-expense':'td-value-invest';
    return`<tr><td class="td-ref">${Fmt.ref(r.ref)}</td><td>${opBadge}</td><td><span class="td-tag">${r.tipo||'—'}</span></td><td style="font-size:.84rem;">${r.descricao||'—'}</td><td style="font-family:var(--font-mono);font-weight:500;" class="${valClass}">${isRetirada?'−':''}${Fmt.brl(r.valor)}</td><td><div class="actions-cell"><button class="btn-icon edit" onclick="iniciarEdicaoInvest('${r.id}')" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirInvest('${r.id}')" title="Excluir">✕</button></div></td></tr>`;
  }).join('');
}

function atualizarStatsInvest(){
  const srch=(document.getElementById('filterInvest')?document.getElementById('filterInvest').value:'').toLowerCase();
  let rowsFiltro=getInvestRows(filtroAno,filtroRef);
  if(srch)rowsFiltro=rowsFiltro.filter(r=>Fmt.ref(r.ref).toLowerCase().includes(srch)||(r.tipo||'').toLowerCase().includes(srch)||(r.descricao||'').toLowerCase().includes(srch)||(r.operacao||'aporte').toLowerCase().includes(srch));
  const allRows=DB.get('investimentos')||[];
  const totalAportes=rowsFiltro.filter(r=>(r.operacao||'aporte')==='aporte').reduce((s,r)=>s+r.valor,0);
  const totalRetiradas=rowsFiltro.filter(r=>r.operacao==='retirada').reduce((s,r)=>s+r.valor,0);
  const patrimonioLiquido=allRows.filter(r=>(r.operacao||'aporte')==='aporte').reduce((s,r)=>s+r.valor,0)
                         -allRows.filter(r=>r.operacao==='retirada').reduce((s,r)=>s+r.valor,0);
  document.getElementById('investStatTotal').textContent=Fmt.brl(totalAportes);
  document.getElementById('investStatRetiradas').textContent=Fmt.brl(totalRetiradas);
  document.getElementById('investStatPatrimonio').textContent=Fmt.brl(patrimonioLiquido);
}

function confirmarInsercaoInvest(){
  const ref=document.getElementById('investRef').value;
  const operacao=document.getElementById('investOperacao').value;
  const tipo=document.getElementById('investTipo').value;
  const descricao=document.getElementById('investDescricao').value.trim();
  const valor=Fmt.parse(document.getElementById('investValor').value);
  if(!ref){Toast.show('Selecione a referência','error');return;}
  if(!tipo){Toast.show('Selecione o tipo de investimento','error');return;}
  if(!valor){Toast.show('Informe o valor','error');return;}
  const inv=DB.get('investimentos')||[];
  inv.push({id:Fmt.uid(),ref,operacao,tipo,descricao,valor});
  DB.set('investimentos',inv);
  ['investRef','investDescricao','investValor'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('investOperacao').value='aporte';
  onInvestOperacaoChange();
  reconstruirFiltros();renderInvestTable();atualizarStatsInvest();renderControle();
  const label=operacao==='retirada'?'Retirada':'Aporte';
  Toast.show(`${label} de ${Fmt.brl(valor)} em ${tipo} registrado`,'success');
}


function buildInvestEditRow(r,tipos){
  const tipoOpts=tipos.map(t=>`<option value="${t}"${t===r.tipo?' selected':''}>${t}</option>`).join('');
  const opSel=`<select class="inline-select" id="ei_op" style="min-width:90px;"><option value="aporte"${(r.operacao||'aporte')==='aporte'?' selected':''}>Aporte</option><option value="retirada"${r.operacao==='retirada'?' selected':''}>Retirada</option></select>`;
  return`<tr class="row-editing"><td><input type="month" class="inline-month" id="ei_ref" value="${r.ref}" onkeydown="handleInlineInvestKey(event,'${r.id}')"/></td><td>${opSel}</td><td><select class="inline-select" id="ei_tipo" style="min-width:90px;">${tipoOpts}</select></td><td><input class="inline-input" id="ei_desc" value="${(r.descricao||'').replace(/"/g,'&quot;')}" style="min-width:100px;" onkeydown="handleInlineInvestKey(event,'${r.id}')"/></td><td><div class="inline-curr"><span class="inline-curr-pfx">R$</span><input class="inline-input" id="ei_val" value="${Fmt.toInput(r.valor)}" oninput="maskCurrency(this)" onkeydown="handleInlineInvestKey(event,'${r.id}')" style="min-width:80px;"/></div></td><td><div class="actions-cell"><button class="btn-icon confirm" onclick="salvarInvest('${r.id}')">✔</button><button class="btn-icon cancel-edit" onclick="cancelarInvest()">✕</button></div></td></tr>`;
}
function iniciarEdicaoInvest(id){editingInvestId=id;renderInvestTable();setTimeout(()=>{const el=document.getElementById('ei_desc');if(el)el.focus();},40);}
function cancelarInvest(){editingInvestId=null;renderInvestTable();}
function salvarInvest(id){
  const novaRef=document.getElementById('ei_ref').value;
  const operacao=document.getElementById('ei_op').value;
  const tipo=document.getElementById('ei_tipo').value;
  const descricao=document.getElementById('ei_desc').value.trim();
  const valor=Fmt.parse(document.getElementById('ei_val').value);
  if(!novaRef){Toast.show('Informe a referência','error');return;}
  if(!valor){Toast.show('Informe o valor','error');return;}
  const inv=DB.get('investimentos')||[];
  const idx=inv.findIndex(r=>r.id===id);
  if(idx<0)return;
  inv[idx]={...inv[idx],ref:novaRef,operacao,tipo,descricao,valor};
  DB.set('investimentos',inv);editingInvestId=null;reconstruirFiltros();renderInvestTable();atualizarStatsInvest();renderControle();
  Toast.show('Investimento atualizado','success');
}
function handleInlineInvestKey(e,id){if(e.key==='Enter'){e.preventDefault();salvarInvest(id);}if(e.key==='Escape')cancelarInvest();}

let pendingDeleteInvestId=null;
function pedirExcluirInvest(id){const r=(DB.get('investimentos')||[]).find(x=>x.id===id);if(!r)return;pendingDeleteInvestId=id;const op=r.operacao==='retirada'?'Retirada':'Aporte';document.getElementById('deleteInvestDesc').textContent=`${op}: ${r.tipo} — ${Fmt.brl(r.valor)} (${Fmt.ref(r.ref)})`;document.getElementById('modalExcluirInvest').classList.remove('hidden');}
function confirmarExclusaoInvest(){DB.set('investimentos',(DB.get('investimentos')||[]).filter(r=>r.id!==pendingDeleteInvestId));closeModal('modalExcluirInvest');pendingDeleteInvestId=null;reconstruirFiltros();renderInvestTable();atualizarStatsInvest();renderControle();Toast.show('Registro excluído','error');}

/* ============================================
   ABA CONTROLE
============================================ */
const ctrlSortSt={receitas:{col:'total',dir:-1},despesas:{col:'total',dir:-1}};
const ctrlMainSortSt={col:'ref',dir:1};

function getLinhasCtrl(ano,ref){
  const linhas=[];
  const salRows=getSalRows(ano,ref);
  salRows.forEach(r=>{if(r.liquido>0)linhas.push({ref:r.ref,origem:'Salário',tipo:'Salário Líquido',descricao:'Adiantamento + Pagamento',parcela:'—',valor:r.liquido,natureza:'receita'});});
  let extras=DB.get('extras')||[];
  if(ref)extras=extras.filter(e=>e.ref===ref);else if(ano)extras=extras.filter(e=>e.ref.startsWith(ano+'-'));
  extras.forEach(e=>{if((e.liquido||0)>0)linhas.push({ref:e.ref,origem:'Salário',tipo:e.tipo,descricao:'Extra — '+e.tipo,parcela:'—',valor:e.liquido||0,natureza:'receita'});});
  const entRows=expandirEntradas(DB.get('entradas')||[],ano,ref);
  entRows.forEach(r=>{const parc=r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'—';linhas.push({ref:r.parcelaRef,origem:'Entradas',tipo:r.tipo||'Entrada',descricao:r.descricao||(r.tipo||'Entrada'),parcela:parc,valor:r.valorExib,natureza:'receita'});});
  const saiRows=expandirSaidas(DB.get('saidas')||[],ano,ref);
  saiRows.forEach(r=>{const parc=r.parcelaNum!=null?`${r.parcelaNum}/${r.parcelaTotal}`:'—';linhas.push({ref:r.parcelaRef,origem:'Saídas',tipo:r.tipo||'Saída',descricao:r.descricao||(r.tipo||'Saída'),parcela:parc,valor:r.valorExib,natureza:'despesa'});});
  return linhas;
}

function agruparPorTipo(linhas,natureza){
  const map={};
  linhas.filter(l=>l.natureza===natureza).forEach(l=>{if(!map[l.tipo])map[l.tipo]={tipo:l.tipo,registros:0,total:0};map[l.tipo].registros++;map[l.tipo].total+=l.valor;});
  return Object.values(map);
}

function renderControle(){
  const linhas=getLinhasCtrl(filtroAno,filtroRef);
  const totalReceitas=linhas.filter(l=>l.natureza==='receita').reduce((s,l)=>s+l.valor,0);
  const totalDespesas=linhas.filter(l=>l.natureza==='despesa').reduce((s,l)=>s+l.valor,0);
  const investRows=getInvestRows(filtroAno,filtroRef);
  const totalInvest=investRows.filter(r=>(r.operacao||'aporte')==='aporte').reduce((s,r)=>s+r.valor,0)
                  -investRows.filter(r=>r.operacao==='retirada').reduce((s,r)=>s+r.valor,0);
  const saldo=totalReceitas-totalDespesas-totalInvest;
  document.getElementById('ctrlStatReceitas').textContent=Fmt.brl(totalReceitas);
  document.getElementById('ctrlStatDespesas').textContent=Fmt.brl(totalDespesas);
  document.getElementById('ctrlStatInvest').textContent=Fmt.brl(totalInvest);
  const saldoEl=document.getElementById('ctrlStatSaldo');
  saldoEl.textContent=Fmt.brl(saldo);saldoEl.className='stat-value '+(saldo>=0?'saldo-pos':'saldo-neg');
  document.getElementById('ctrlSaldoCard').className='stat-card '+(saldo>=0?'green':'red');
  renderCtrlGrupo('receitas',agruparPorTipo(linhas,'receita'),totalReceitas,'receita');
  renderCtrlGrupo('despesas',agruparPorTipo(linhas,'despesa'),totalDespesas,'despesa');
  renderCtrlTable();
  renderCtrlResumoOrigem();
}

function sortCtrl(tabela,col){
  const st=ctrlSortSt[tabela];if(st.col===col)st.dir*=-1;else{st.col=col;st.dir=1;}
  const tableId=tabela==='receitas'?'ctrlReceitasTable':'ctrlDespesasTable';
  document.getElementById(tableId).querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(st.dir===1?'↑':'↓'):'↕';});
  renderControle();
}

function renderCtrlGrupo(tabela,grupos,grandTotal,natureza){
  const st=ctrlSortSt[tabela];
  const badgeEl=document.getElementById(tabela==='receitas'?'ctrlReceitasBadge':'ctrlDespesasBadge');
  const tbody=document.getElementById(tabela==='receitas'?'ctrlReceitasBody':'ctrlDespesasBody');
  const barClass=natureza==='receita'?'receita':'despesa';
  const valClass=natureza==='receita'?'td-value-income':'td-value-expense';
  grupos.sort((a,b)=>{const av=st.col==='tipo'?a.tipo:st.col==='registros'?a.registros:st.col==='perc'?(a.total/grandTotal):a.total;const bv=st.col==='tipo'?b.tipo:st.col==='registros'?b.registros:st.col==='perc'?(b.total/grandTotal):b.total;return av<bv?-st.dir:av>bv?st.dir:0;});
  const cfTipoId=tabela==='receitas'?'cfReceitasTipo':'cfDespesasTipo';
  const cfTipoVal=cf(cfTipoId);
  if(cfTipoVal) grupos=grupos.filter(g=>(g.tipo||'').toLowerCase().includes(cfTipoVal));
  badgeEl.textContent=grupos.length+' tipo'+(grupos.length!==1?'s':'');
  if(!grupos.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="4">Nenhum registro no período.</td></tr>`;return;}
  const rows=grupos.map(g=>{const perc=grandTotal>0?(g.total/grandTotal*100):0;const barW=Math.round(perc*0.8);return`<tr><td style="font-size:.84rem;font-weight:500;">${g.tipo}</td><td class="td-mono" style="text-align:center;">${g.registros}</td><td class="${valClass}">${Fmt.brl(g.total)}</td><td><div class="perc-bar-wrap"><div class="perc-bar ${barClass}" style="width:${barW}px;"></div><span class="perc-val">${perc.toFixed(1)}%</span></div></td></tr>`;}).join('');
  const totalRow=`<tr class="ctrl-total-row"><td style="font-size:.82rem;">Total</td><td class="td-mono" style="text-align:center;">${grupos.reduce((s,g)=>s+g.registros,0)}</td><td class="${valClass}">${Fmt.brl(grandTotal)}</td><td><span class="perc-val">100%</span></td></tr>`;
  tbody.innerHTML=rows+totalRow;
}

function renderCtrlResumoOrigem(){
  const linhas=getLinhasCtrl(filtroAno,filtroRef);
  const srch=(document.getElementById('filterResumo')?document.getElementById('filterResumo').value:'').toLowerCase();
  const resumo={};
  linhas.forEach(l=>{const t=l.tipo;if(!resumo[t])resumo[t]={tipo:t,entradas:0,saidas:0};if(l.natureza==='receita')resumo[t].entradas+=l.valor;else resumo[t].saidas+=l.valor;});
  let rows=Object.values(resumo);
  if(srch)rows=rows.filter(r=>r.tipo.toLowerCase().includes(srch));
  rows.sort((a,b)=>(b.entradas-b.saidas)-(a.entradas-a.saidas));
  const tbody=document.getElementById('ctrlResumoBody');
  if(!tbody)return;
  document.getElementById('ctrlResumoBadge').textContent=rows.length+' tipo'+(rows.length!==1?'s':'');
  if(!rows.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="4">Nenhum dado no período.</td></tr>`;return;}
  const totalSaldo=rows.reduce((s,r)=>s+(r.entradas-r.saidas),0);
  tbody.innerHTML=rows.map(r=>{const saldo=r.entradas-r.saidas;const saldoClass=saldo>=0?'td-value-income':'td-value-expense';const saldoStr=saldo>=0?Fmt.brl(saldo):`−${Fmt.brl(Math.abs(saldo))}`;const entStr=r.entradas>0?`<span class="td-value-income">${Fmt.brl(r.entradas)}</span>`:`<span style="color:var(--text-muted)">—</span>`;const saiStr=r.saidas>0?`<span class="td-value-expense">−${Fmt.brl(r.saidas)}</span>`:`<span style="color:var(--text-muted)">—</span>`;return`<tr><td style="font-size:.84rem;font-weight:500;">${r.tipo}</td><td style="text-align:right;">${entStr}</td><td style="text-align:right;">${saiStr}</td><td style="text-align:right;"><span class="${saldoClass}" style="font-weight:600;">${saldoStr}</span></td></tr>`;}).join('');
  const totSaldoClass=totalSaldo>=0?'td-value-income':'td-value-expense';
  const totSaldoStr=totalSaldo>=0?Fmt.brl(totalSaldo):`−${Fmt.brl(Math.abs(totalSaldo))}`;
  const totEntradas=rows.reduce((s,r)=>s+r.entradas,0);
  const totSaidas=rows.reduce((s,r)=>s+r.saidas,0);
  tbody.innerHTML+=`<tr class="ctrl-total-row"><td style="font-size:.82rem;">Total</td><td style="text-align:right;" class="td-value-income">${Fmt.brl(totEntradas)}</td><td style="text-align:right;" class="td-value-expense">−${Fmt.brl(totSaidas)}</td><td style="text-align:right;"><span class="${totSaldoClass}" style="font-weight:700;">${totSaldoStr}</span></td></tr>`;
}
function sortCtrlMain(col){if(ctrlMainSortSt.col===col)ctrlMainSortSt.dir*=-1;else{ctrlMainSortSt.col=col;ctrlMainSortSt.dir=1;}document.getElementById('ctrlTable').querySelectorAll('thead th').forEach(th=>{th.classList.toggle('sorted',th.dataset.col===col);if(th.querySelector('.sort-icon'))th.querySelector('.sort-icon').textContent=th.dataset.col===col?(ctrlMainSortSt.dir===1?'↑':'↓'):'↕';});renderCtrlTable();}

function renderCtrlTable(){
  const tbody=document.getElementById('ctrlBody');
  let linhas=getLinhasCtrl(filtroAno,filtroRef);
  const cfCRef=cf('cfCtrlRef'),cfCOrig=cf('cfCtrlOrigem'),cfCTipo=cf('cfCtrlTipo'),cfCDesc=cf('cfCtrlDesc');
  if(cfCRef)  linhas=linhas.filter(l=>Fmt.ref(l.ref).toLowerCase().includes(cfCRef));
  if(cfCOrig) linhas=linhas.filter(l=>(l.origem||'').toLowerCase().includes(cfCOrig));
  if(cfCTipo) linhas=linhas.filter(l=>(l.tipo||'').toLowerCase().includes(cfCTipo));
  if(cfCDesc) linhas=linhas.filter(l=>(l.descricao||'').toLowerCase().includes(cfCDesc));
  const{col,dir}=ctrlMainSortSt;
  linhas.sort((a,b)=>{let av,bv;if(col==='ref')av=a.ref,bv=b.ref;else if(col==='origem')av=a.origem,bv=b.origem;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valor,bv=b.valor;else av=a.ref,bv=b.ref;return av<bv?-dir:av>bv?dir:0;});
  document.getElementById('ctrlTotalBadge').textContent=linhas.length+' registro'+(linhas.length!==1?'s':'');
  /* Saldo visível: receitas somam positivo, despesas subtraem */
  const saldoVisivel=linhas.reduce((s,l)=>s+(l.natureza==='receita'?l.valor:-l.valor),0);
  const totalEl=document.getElementById('ctrlTotalValor');
  if(totalEl){
    const saldoStr=saldoVisivel>=0?Fmt.brl(saldoVisivel):`−${Fmt.brl(Math.abs(saldoVisivel))}`;
    totalEl.textContent=saldoStr;
    totalEl.className=saldoVisivel>=0?'td-value-income':'td-value-expense';
    totalEl.style.fontFamily='var(--font-mono)';
    totalEl.style.fontWeight='700';
  }
  if(!linhas.length){tbody.innerHTML=`<tr class="empty-row"><td colspan="7">Nenhum dado no período selecionado.</td></tr>`;renderCtrlResumoOrigem();return;}
  tbody.innerHTML=linhas.map(l=>{const valClass=l.natureza==='receita'?'td-value-income':'td-value-expense';const naturezaBadge=l.natureza==='receita'?`<span class="nature-badge receita">↑ Receita</span>`:`<span class="nature-badge despesa">↓ Despesa</span>`;return`<tr><td class="td-ref">${Fmt.ref(l.ref)}</td><td><span class="origin-badge">${l.origem}</span></td><td><span class="td-tag">${l.tipo}</span></td><td style="font-size:.83rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.descricao}</td><td class="td-mono" style="text-align:center;">${l.parcela||'—'}</td><td class="${valClass}">${Fmt.brl(l.valor)}</td><td>${naturezaBadge}</td></tr>`;}).join('');
  renderCtrlResumoOrigem();
}


/* ============================================
   EXPORTAR CONSOLIDADO — XLSX
============================================ */
function exportarConsolidadoXlsx(){
  if(typeof XLSX==='undefined'){
    Toast.show('Biblioteca XLSX não carregada. Verifique sua conexão.','error',5000);
    return;
  }

  /* Coleta linhas filtradas (mesmo estado da tabela) */
  let linhas=getLinhasCtrl(filtroAno,filtroRef);
  const cfCRef=cf('cfCtrlRef'),cfCOrig=cf('cfCtrlOrigem'),cfCTipo=cf('cfCtrlTipo'),cfCDesc=cf('cfCtrlDesc');
  if(cfCRef)  linhas=linhas.filter(l=>Fmt.ref(l.ref).toLowerCase().includes(cfCRef));
  if(cfCOrig) linhas=linhas.filter(l=>(l.origem||'').toLowerCase().includes(cfCOrig));
  if(cfCTipo) linhas=linhas.filter(l=>(l.tipo||'').toLowerCase().includes(cfCTipo));
  if(cfCDesc) linhas=linhas.filter(l=>(l.descricao||'').toLowerCase().includes(cfCDesc));

  const{col,dir}=ctrlMainSortSt;
  linhas.sort((a,b)=>{let av,bv;if(col==='ref')av=a.ref,bv=b.ref;else if(col==='origem')av=a.origem,bv=b.origem;else if(col==='tipo')av=a.tipo,bv=b.tipo;else if(col==='descricao')av=a.descricao,bv=b.descricao;else if(col==='valor')av=a.valor,bv=b.valor;else av=a.ref,bv=b.ref;return av<bv?-dir:av>bv?dir:0;});

  if(!linhas.length){Toast.show('Nenhum dado para exportar','warn');return;}

  /* Cabeçalho */
  const wsData=[['Referência','Origem','Tipo','Descrição','Parcela','Valor (R$)','Natureza']];

  /* Linhas de dados — valor positivo para receita, negativo para despesa */
  linhas.forEach(l=>{
    const valorSinal=l.natureza==='receita'?l.valor:-l.valor;
    wsData.push([Fmt.ref(l.ref), l.origem||'', l.tipo||'', l.descricao||'', l.parcela||'—', valorSinal, l.natureza==='receita'?'Receita':'Despesa']);
  });

  /* Linha de saldo */
  const saldo=linhas.reduce((s,l)=>s+(l.natureza==='receita'?l.valor:-l.valor),0);
  wsData.push(['','','','SALDO',saldo,'']);

  const ws=XLSX.utils.aoa_to_sheet(wsData);

  /* Larguras das colunas */
  ws['!cols']=[{wch:12},{wch:14},{wch:20},{wch:36},{wch:10},{wch:16},{wch:12}];

  /* Formato numérico para coluna Valor */
  for(let i=1;i<wsData.length;i++){
    const cellRef=XLSX.utils.encode_cell({r:i,c:5});
    if(ws[cellRef]&&typeof ws[cellRef].v==='number'){
      ws[cellRef].t='n';
      ws[cellRef].z='"R$" #,##0.00;[Red]"R$"-#,##0.00';
    }
  }

  const wb=XLSX.utils.book_new();
  const periodo=filtroRef?Fmt.ref(filtroRef):(filtroAno?filtroAno:'Todos');
  const nomePlanilha=('Consolidado '+periodo).replace(/[:\\\/\?\*\[\]]/g,'-').slice(0,31);
  XLSX.utils.book_append_sheet(wb,ws,nomePlanilha);

  const nomeArq='FinPanel_Consolidado_'+periodo.replace('/','_')+'.xlsx';
  XLSX.writeFile(wb,nomeArq);
  Toast.show('Exportado: '+nomeArq,'success');
}


/* ============================================
   ABA RESUMO POR PESSOA
   Gera um card visual (tipo print) com o
   resumo financeiro de uma pessoa específica
   e permite compartilhar via WhatsApp ou
   salvar como imagem.
============================================ */

const TIPOS_GENERICOS = new Set([
  'Cartão de Crédito','Boleto','Financiamento','PIX','Salário','Aluguel',
  'Telefone','Casa','Diversas','Mercado','Luz','Água','Internet',
  'cartão de crédito','boleto','financiamento','pix','salário','aluguel'
]);

function initResumoTab(){
  /* Período padrão: mês atual */
  const periodoEl = document.getElementById('resumoPeriodo');
  if(!periodoEl.value) periodoEl.value = Fmt.nowYM();
  popularPessoasResumo();
}

function popularPessoasResumo(){
  const ref = document.getElementById('resumoPeriodo').value;
  const sel = document.getElementById('resumoPessoa');
  const saidas   = _expandirRef(DB.get('saidas')||[], ref, 'saida');
  const entradas = _expandirRef(DB.get('entradas')||[], ref, 'entrada');

  const pessoas = [...new Set([
    ...saidas.map(r=>r.tipo),
    ...entradas.map(r=>r.tipo)
  ].filter(t=>t&&!TIPOS_GENERICOS.has(t)))].sort();

  const atual = sel.value;
  sel.innerHTML = '<option value="">Todas as pessoas</option>';
  pessoas.forEach(p=>{
    const o=document.createElement('option');
    o.value=p; o.textContent=p;
    sel.appendChild(o);
  });
  if(atual) sel.value = atual;
}

/* Expande saidas ou entradas para um ref específico */
function _expandirRef(arr, ref, tipo){
  const rows=[];
  arr.forEach(s=>{
    if(s.forma==='avista'){
      if(s.ref===ref) rows.push({...s,parcelaNum:null,parcelaRef:s.ref,parcelaTotal:1,valorExib:s.valor,_parcelaIdx:'av'});
    } else {
      for(let i=0;i<(s.nParcelas||1);i++){
        const pr=Fmt.addMonths(s.primeiraParcela,i);
        if(pr===ref) rows.push({...s,parcelaNum:i+1,parcelaRef:pr,parcelaTotal:s.nParcelas,valorExib:s.valor,_parcelaIdx:i});
      }
    }
  });
  return rows;
}

function calcularResumoPessoa(ref, pessoaFiltro){
  const saidas   = _expandirRef(DB.get('saidas')||[], ref, 'saida');
  const entradas = _expandirRef(DB.get('entradas')||[], ref, 'entrada');

  const todasPessoas = pessoaFiltro
    ? [pessoaFiltro]
    : [...new Set([...saidas.map(r=>r.tipo),...entradas.map(r=>r.tipo)]
        .filter(t=>t&&!TIPOS_GENERICOS.has(t)))].sort();

  const _isPago = r => { const key = r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx); return (r.pagos||{})[key]||false; };

  return todasPessoas.map(pessoa=>{
    const sP = saidas.filter(r=>r.tipo===pessoa);
    const eP = entradas.filter(r=>r.tipo===pessoa);
    const totSaidas   = sP.reduce((s,r)=>s+r.valorExib,0);
    const totEntradas = eP.reduce((s,r)=>s+r.valorExib,0);
    /* Apenas itens ainda pendentes (não marcados como pago/recebido) entram no saldo */
    const totSaidasPend   = sP.filter(r=>!_isPago(r)).reduce((s,r)=>s+r.valorExib,0);
    const totEntradasPend = eP.filter(r=>!_isPago(r)).reduce((s,r)=>s+r.valorExib,0);
    const saldo = totEntradasPend - totSaidasPend;
    return {pessoa, saidas:sP, entradas:eP, totSaidas, totEntradas, totSaidasPend, totEntradasPend, saldo};
  }).filter(p=>p.saidas.length>0||p.entradas.length>0);
}

function gerarResumoVisual(){
  const ref    = document.getElementById('resumoPeriodo').value;
  const pessoa = document.getElementById('resumoPessoa').value;

  if(!ref){ Toast.show('Selecione um período','error'); return; }

  popularPessoasResumo();
  const dados = calcularResumoPessoa(ref, pessoa||null);

  if(!dados.length){
    document.getElementById('resumoArea').style.display='none';
    document.getElementById('resumoEmpty').style.display='block';
    document.getElementById('resumoEmpty').innerHTML='Nenhum lançamento com pessoa identificada em <strong>'+Fmt.ref(ref)+'</strong>.';
    document.getElementById('btnShareWpp').style.display='none';
    document.getElementById('btnSalvarImg').style.display='none';
    return;
  }

  /* Gera o card visual */
  const card = document.getElementById('resumoCard');
  card.innerHTML = buildResumoCard(dados, ref, pessoa||null);

  document.getElementById('resumoArea').style.display='block';
  document.getElementById('resumoEmpty').style.display='none';
  document.getElementById('btnShareWpp').style.display='flex';
  document.getElementById('btnSalvarImg').style.display='flex';
}

function buildResumoCard(dados, ref, pessoaFiltro){
  const agora = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  /* Saldo geral considera apenas os itens ainda pendentes (não pagos/recebidos) */
  const totEntPend = dados.reduce((s,d)=>s+d.totEntradasPend,0);
  const totSaiPend = dados.reduce((s,d)=>s+d.totSaidasPend,0);
  const saldoGeral = totEntPend - totSaiPend;
  const sgClass = saldoGeral>=0?'resumo-pos':'resumo-neg';
  const sgDesc  = saldoGeral>0?'No total, me devem':'No total, eu devo';

  let html = `
  <div class="resumo-print" id="resumoPrint">
    <!-- Cabeçalho do card -->
    <div class="resumo-print-header">
      <div class="resumo-print-logo">
        <div class="resumo-print-logo-icon">
          <svg viewBox="0 0 18 18" fill="none" stroke="#05120D" stroke-width="2.2" stroke-linecap="round">
            <rect x="1" y="4" width="16" height="11" rx="2"/>
            <path d="M5 4V3a1 1 0 011-1h6a1 1 0 011 1v1"/>
            <path d="M9 9v2M7 9h4"/>
          </svg>
        </div>
        <div>
          <div class="resumo-print-nome">FinPanel</div>
          <div class="resumo-print-sub">Resumo Financeiro</div>
        </div>
      </div>
      <div class="resumo-print-periodo">${Fmt.ref(ref)}</div>
    </div>`;

  /* Saldo geral: só faz sentido quando o resumo cobre mais de uma pessoa */
  if(!pessoaFiltro){
    html += `
    <div class="resumo-saldo-geral">
      <div class="resumo-saldo-label">Saldo Geral</div>
      <div class="resumo-saldo-valor ${sgClass}">
        ${saldoGeral>=0?Fmt.brl(saldoGeral):'−'+Fmt.brl(Math.abs(saldoGeral))}
      </div>
      <div class="resumo-saldo-desc">${sgDesc} ${Fmt.brl(Math.abs(saldoGeral))}</div>
    </div>`;
  }

  dados.forEach(({pessoa, saidas, entradas, totSaidas, totEntradas, saldo})=>{
    const sClass = saldo>0?'resumo-pos':saldo<0?'resumo-neg':'resumo-zero';
    const sDesc  = saldo>0?`me deve ${Fmt.brl(saldo)}`
                 : saldo<0?`Eu devo ${Fmt.brl(Math.abs(saldo))}`
                 : `Quites ✅`;

    html += `<div class="resumo-pessoa-block">
      <div class="resumo-pessoa-header">
        <div class="resumo-pessoa-avatar">${pessoa.slice(0,2).toUpperCase()}</div>
        <div class="resumo-pessoa-info">
          <div class="resumo-pessoa-nome">${pessoa}</div>
          <div class="resumo-pessoa-saldo ${sClass}">${sDesc}</div>
        </div>
      </div>
      <div class="resumo-cols">
        <div class="resumo-col">`;

    /* Entradas */
    if(entradas.length){
      html += `<div class="resumo-grupo-label resumo-grupo-ent">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Entradas · <span>${Fmt.brl(totEntradas)}</span>
      </div>`;
      entradas.forEach(r=>{
        const key  = r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
        const pago = (r.pagos||{})[key]||false;
        const parc = r.parcelaNum!=null?` ${r.parcelaNum}/${r.parcelaTotal}`:'';
        html += `<div class="resumo-item">
          <div class="resumo-item-left">
            <span class="resumo-item-desc">${r.descricao||'—'}</span>${parc?`<span class="resumo-item-parc">${parc}</span>`:''}
          </div>
          <div class="resumo-item-right">
            <span class="resumo-item-val resumo-pos">+${Fmt.brl(r.valorExib)}</span>
            <span class="resumo-status ${pago?'resumo-pago':'resumo-pendente'}">${pago?'✔':'●'}</span>
          </div>
        </div>`;
      });
    } else {
      html += `<div class="resumo-col-vazio">—</div>`;
    }

    html += `</div><div class="resumo-col">`;

    /* Saídas */
    if(saidas.length){
      html += `<div class="resumo-grupo-label resumo-grupo-sai">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 16 12 21 17 16"/><line x1="12" y1="21" x2="12" y2="9"/></svg>
        Saídas · <span>${Fmt.brl(totSaidas)}</span>
      </div>`;
      saidas.forEach(r=>{
        const key  = r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
        const pago = (r.pagos||{})[key]||false;
        const parc = r.parcelaNum!=null?` ${r.parcelaNum}/${r.parcelaTotal}`:'';
        html += `<div class="resumo-item">
          <div class="resumo-item-left">
            <span class="resumo-item-desc">${r.descricao||'—'}</span>${parc?`<span class="resumo-item-parc">${parc}</span>`:''}
          </div>
          <div class="resumo-item-right">
            <span class="resumo-item-val resumo-neg">−${Fmt.brl(r.valorExib)}</span>
            <span class="resumo-status ${pago?'resumo-pago':'resumo-pendente'}">${pago?'✔':'●'}</span>
          </div>
        </div>`;
      });
    } else {
      html += `<div class="resumo-col-vazio">—</div>`;
    }

    html += `</div></div>`; /* fecha resumo-cols */
    html += `</div>`; /* fecha pessoa-block */
  });

  html += `
    <div class="resumo-print-footer">Gerado em ${agora} · FinPanel</div>
  </div>`;

  return html;
}

/* ── Salvar como imagem usando html2canvas ── */
async function salvarImagemResumo(){
  if(typeof html2canvas==='undefined'){
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(s);
    await new Promise(r=>s.onload=r);
  }
  const el=document.getElementById('resumoPrint');
  Toast.show('Gerando imagem…','info',2000);
  const canvas=await html2canvas(el,{
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-surface').trim()||'#13161E',
    scale:2,
    useCORS:true,
    logging:false
  });
  const link=document.createElement('a');
  const ref=document.getElementById('resumoPeriodo').value;
  const pessoa=document.getElementById('resumoPessoa').value||'geral';
  link.download=`FinPanel_Resumo_${Fmt.ref(ref).replace('/','_')}_${pessoa}.png`;
  link.href=canvas.toDataURL('image/png');
  link.click();
  Toast.show('Imagem salva!','success');
}

/* ── Compartilhar via WhatsApp (texto formatado) ── */
function compartilharResumoWpp(){
  const ref    = document.getElementById('resumoPeriodo').value;
  const pessoa = document.getElementById('resumoPessoa').value;
  const dados  = calcularResumoPessoa(ref, pessoa||null);
  if(!dados.length){ Toast.show('Nenhum dado','warn'); return; }

  const linhas=[`📊 *FinPanel — ${Fmt.ref(ref)}*\n`];
  dados.forEach(({pessoa,entradas,saidas,totEntradas,totSaidas,saldo})=>{
    linhas.push(`👤 *${pessoa}*`);
    if(entradas.length){
      linhas.push(`  ↑ _Entradas_ — ${Fmt.brl(totEntradas)}`);
      entradas.forEach(r=>{
        const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
        const pago=(r.pagos||{})[key];
        const parc=r.parcelaNum!=null?` (${r.parcelaNum}/${r.parcelaTotal})`:'';
        linhas.push(`    ${pago?'✔':'●'} ${r.descricao}${parc}: +${Fmt.brl(r.valorExib)}`);
      });
    }
    if(saidas.length){
      linhas.push(`  ↓ _Saídas_ — ${Fmt.brl(totSaidas)}`);
      saidas.forEach(r=>{
        const key=r._parcelaIdx==='av'?'av':parseInt(r._parcelaIdx);
        const pago=(r.pagos||{})[key];
        const parc=r.parcelaNum!=null?` (${r.parcelaNum}/${r.parcelaTotal})`:'';
        linhas.push(`    ${pago?'✔':'●'} ${r.descricao}${parc}: −${Fmt.brl(r.valorExib)}`);
      });
    }
    const saldoTxt=saldo>0?`➡️ ${pessoa} me deve *${Fmt.brl(saldo)}*`
      :saldo<0?`➡️ Eu devo *${Fmt.brl(Math.abs(saldo))}* a ${pessoa}`
      :'➡️ Quites ✅';
    linhas.push(`  ${saldoTxt}\n`);
  });

  window.open('https://wa.me/?text='+encodeURIComponent(linhas.join('\n')),'_blank');
}

/* ============================================
   CRITÉRIOS EXTRAS
============================================ */
function renderCriterios(){const crit=DB.get('criterios')||[];document.getElementById('criteriasEmpty').style.display=crit.length?'none':'block';document.getElementById('criteriaList').innerHTML=crit.map((c,i)=>`<div class="criteria-tag"><span>${c}</span><button class="criteria-remove" onclick="removerCriterio(${i})">✕</button></div>`).join('');const sel=document.getElementById('extrasTipo');sel.innerHTML=crit.length?crit.map(c=>`<option value="${c}">${c}</option>`).join(''):'<option value="">Nenhum critério</option>';}
function adicionarCriterio(){const el=document.getElementById('criterioInput'),val=el.value.trim();if(!val){Toast.show('Digite o nome do critério','error');return;}const crit=DB.get('criterios')||[];if(crit.includes(val)){Toast.show('Critério já existe','error');return;}crit.push(val);DB.set('criterios',crit);el.value='';renderCriterios();Toast.show(`Critério "${val}" adicionado`,'success');}
function removerCriterio(i){const crit=DB.get('criterios')||[];const nome=crit[i];crit.splice(i,1);DB.set('criterios',crit);renderCriterios();Toast.show(`Critério "${nome}" removido`,'info');}

/* ============================================
   TIPOS DE CONTA
============================================ */
function renderTiposConta(){const tipos=DB.get('tiposConta')||[];document.getElementById('tiposContaEmpty').style.display=tipos.length?'none':'block';document.getElementById('tiposContaList').innerHTML=tipos.map((t,i)=>`<div class="criteria-tag"><span>${t}</span><button class="criteria-remove" onclick="removerTipoConta(${i})">✕</button></div>`).join('');const opts=tipos.length?tipos.map(t=>`<option value="${t}">${t}</option>`).join(''):'<option value="">Nenhum tipo cadastrado</option>';['esTipoConta'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=opts;});}
function adicionarTipoConta(){const el=document.getElementById('tipoContaInput'),val=el.value.trim();if(!val){Toast.show('Digite o nome do tipo','error');return;}const tipos=DB.get('tiposConta')||[];if(tipos.includes(val)){Toast.show('Tipo já existe','error');return;}tipos.push(val);DB.set('tiposConta',tipos);el.value='';renderTiposConta();Toast.show(`Tipo "${val}" adicionado`,'success');}
function removerTipoConta(i){const tipos=DB.get('tiposConta')||[];const nome=tipos[i];tipos.splice(i,1);DB.set('tiposConta',tipos);renderTiposConta();Toast.show(`Tipo "${nome}" removido`,'info');}

/* ============================================
   TIPOS DE INVESTIMENTO
============================================ */
function renderTiposInvest(){const tipos=DB.get('tiposInvest')||[];document.getElementById('tiposInvestEmpty').style.display=tipos.length?'none':'block';document.getElementById('tiposInvestList').innerHTML=tipos.map((t,i)=>`<div class="criteria-tag"><span>${t}</span><button class="criteria-remove" onclick="removerTipoInvest(${i})">✕</button></div>`).join('');const opts=tipos.length?tipos.map(t=>`<option value="${t}">${t}</option>`).join(''):'<option value="">Nenhum tipo cadastrado</option>';const el=document.getElementById('investTipo');if(el)el.innerHTML=opts;}
function adicionarTipoInvest(){const el=document.getElementById('tipoInvestInput'),val=el.value.trim();if(!val){Toast.show('Digite o nome do tipo','error');return;}const tipos=DB.get('tiposInvest')||[];if(tipos.includes(val)){Toast.show('Tipo já existe','error');return;}tipos.push(val);DB.set('tiposInvest',tipos);el.value='';renderTiposInvest();Toast.show(`Tipo "${val}" adicionado`,'success');}
function removerTipoInvest(i){const tipos=DB.get('tiposInvest')||[];const nome=tipos[i];tipos.splice(i,1);DB.set('tiposInvest',tipos);renderTiposInvest();Toast.show(`Tipo "${nome}" removido`,'info');}

/* ============================================
   USUÁRIOS
============================================ */
const uColors=['#4D79FF','#00C97A','#FF4D6A','#FFB830','#9B59B6','#00B5D8'];
const gColor=id=>uColors[id%uColors.length];
function renderUsers(){const users=DB.get('usuarios')||[];const list=document.getElementById('userList');if(!users.length){list.innerHTML='<div class="text-muted" style="padding:20px 0;text-align:center;">Nenhum usuário cadastrado</div>';return;}list.innerHTML=users.map(u=>`<div class="user-card"><div class="user-avatar" style="background:${gColor(u.id)}22;color:${gColor(u.id)};">${u.nome.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}</div><div class="user-info"><div class="user-name">${u.nome}</div><div class="user-role-text">${u.perfil==='admin'?'Administrador':'Usuário'}</div></div><span class="badge badge-${u.perfil}">${u.perfil==='admin'?'Admin':'Usuário'}</span><div class="flex-gap" style="margin-left:6px;"><button class="btn-icon edit" onclick="editarUsuario(${u.id})" title="Editar">✎</button><button class="btn-icon danger" onclick="pedirExcluirUser(${u.id})" title="Excluir">✕</button></div></div>`).join('');}
function salvarUsuario(){const id=document.getElementById('editUserId').value;const nome=document.getElementById('userNome').value.trim();const perfil=document.getElementById('userPerfil').value;let users=DB.get('usuarios')||[];if(!nome){Toast.show('Informe o nome do usuário','error');return;}if(id){const idx=users.findIndex(u=>u.id==id),ns=document.getElementById('userSenhaEdit').value;if(idx>-1){users[idx].nome=nome;users[idx].perfil=perfil;if(ns.length>=4)users[idx].senha=ns;else if(ns.length>0){Toast.show('Senha deve ter ao menos 4 caracteres','error');return;}if(currentUser&&currentUser.id==id){currentUser.nome=nome;currentUser.perfil=perfil;if(ns.length>=4)currentUser.senha=ns;}}Toast.show('Usuário atualizado','success');}else{const senha=document.getElementById('userSenha').value;if(!senha||senha.length<4){Toast.show('Senha deve ter ao menos 4 caracteres','error');return;}const newId=users.length?Math.max(...users.map(u=>u.id))+1:1;users.push({id:newId,nome,perfil,senha});Toast.show(`Usuário "${nome}" criado`,'success');}DB.set('usuarios',users);limparUserForm();renderUsers();atualizarAvatar();}
function editarUsuario(id){const u=(DB.get('usuarios')||[]).find(x=>x.id===id);if(!u)return;document.getElementById('editUserId').value=u.id;document.getElementById('userNome').value=u.nome;document.getElementById('userPerfil').value=u.perfil;document.getElementById('userSenha').value='';document.getElementById('userSenhaEdit').value='';document.getElementById('senhaNovoGroup').style.display='none';document.getElementById('senhaEditGroup').style.display='block';document.getElementById('userFormTitle').textContent='Editar Usuário';}
function limparUserForm(){['editUserId','userNome','userSenha','userSenhaEdit'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('userPerfil').value='usuario';document.getElementById('senhaNovoGroup').style.display='block';document.getElementById('senhaEditGroup').style.display='none';document.getElementById('userFormTitle').textContent='Novo Usuário';}
let pendingDeleteId=null;
function pedirExcluirUser(id){const u=(DB.get('usuarios')||[]).find(x=>x.id===id);if(!u)return;pendingDeleteId=id;document.getElementById('deleteUserName').textContent=u.nome;document.getElementById('modalExcluirUser').classList.remove('hidden');}
function confirmarExclusaoUser(){DB.set('usuarios',(DB.get('usuarios')||[]).filter(u=>u.id!==pendingDeleteId));closeModal('modalExcluirUser');renderUsers();atualizarAvatar();Toast.show('Usuário excluído','error');pendingDeleteId=null;}

/* ============================================
   AVATAR
============================================ */
function atualizarAvatar(){if(!currentUser)return;const ini=currentUser.nome.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();document.getElementById('userAvatar').textContent=ini;document.getElementById('dropdownName').textContent=currentUser.nome;document.getElementById('dropdownRole').textContent=currentUser.perfil==='admin'?'Administrador':'Usuário';}

/* ============================================
   MODAL
============================================ */
function closeModal(id){document.getElementById(id).classList.add('hidden');}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden');}));

/* ============================================
   TELA DE CARREGAMENTO FIREBASE
============================================ */
function mostrarLoading(msg) {
  let el = document.getElementById('fbLoadingScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fbLoadingScreen';
    el.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:var(--bg-base, #0d1117);
      gap:16px;font-family:var(--font-sans,'DM Sans',sans-serif);
    `;
    el.innerHTML = `
      <div style="width:40px;height:40px;border:3px solid rgba(255,255,255,.1);border-top-color:#00C97A;border-radius:50%;animation:fbSpin .8s linear infinite;"></div>
      <div id="fbLoadingMsg" style="color:#aaa;font-size:.9rem;">${msg}</div>
      <style>@keyframes fbSpin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(el);
  } else {
    document.getElementById('fbLoadingMsg').textContent = msg;
  }
}
function ocultarLoading() {
  const el = document.getElementById('fbLoadingScreen');
  if (el) el.remove();
}


/* ============================================
   SIDEBAR MOBILE
============================================ */
function isMobile() { return window.innerWidth <= 900; }

function toggleMobileSidebar() {
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  const isOpen = sb.classList.contains('mobile-open');
  if (isOpen) {
    sb.classList.remove('mobile-open');
    bd.classList.remove('visible');
  } else {
    sb.classList.add('mobile-open');
    bd.classList.add('visible');
  }
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarBackdrop').classList.remove('visible');
}

function syncHamburger() {
  const btn = document.getElementById('hamburgerBtn');
  if (!btn) return;
  btn.style.display = isMobile() ? 'flex' : 'none';
  if (!isMobile()) closeMobileSidebar();
}

window.addEventListener('resize', syncHamburger);

/* Fecha sidebar ao navegar no mobile */
const _origNavigateTo = navigateTo;
// (monkey-patch feito no init)

/* ============================================
   ABA CONSOLIDADO
============================================ */
const consSortSt = { col: 'ref', dir: -1 };
let consFiltroAno = String(new Date().getFullYear());

function getConsolidadoRows(ano) {
  const refsSet = new Set();
  (DB.get('salarios') || []).forEach(s => refsSet.add(s.ref));
  (DB.get('extras')   || []).forEach(e => refsSet.add(e.ref));
  (DB.get('entradas') || []).forEach(e => {
    if (e.forma === 'parcelado' && e.primeiraParcela) {
      for (let i = 0; i < (e.nParcelas || 1); i++) refsSet.add(Fmt.addMonths(e.primeiraParcela, i));
    } else if (e.ref) refsSet.add(e.ref);
  });
  (DB.get('saidas') || []).forEach(s => {
    if (s.forma === 'parcelado' && s.primeiraParcela) {
      for (let i = 0; i < (s.nParcelas || 1); i++) refsSet.add(Fmt.addMonths(s.primeiraParcela, i));
    } else if (s.ref) refsSet.add(s.ref);
  });
  (DB.get('investimentos') || []).forEach(i => { if (i.ref) refsSet.add(i.ref); });

  let refs = [...refsSet].sort();
  if (ano) refs = refs.filter(r => r.startsWith(ano + '-'));

  return refs.map(ref => {
    const salRows  = getSalRows('', ref);
    const salLiq   = salRows.reduce((s, r) => s + r.liquido, 0);
    const extras   = (DB.get('extras') || []).filter(e => e.ref === ref);
    const extLiq   = extras.reduce((s, e) => s + (e.liquido || 0), 0);
    const entRows  = expandirEntradas(DB.get('entradas') || [], '', ref);
    const entTotal = entRows.reduce((s, r) => s + r.valorExib, 0);
    const entradas = salLiq + extLiq + entTotal;
    const saiRows  = expandirSaidas(DB.get('saidas') || [], '', ref);
    const saidas   = saiRows.reduce((s, r) => s + r.valorExib, 0);
    const invRows  = (DB.get('investimentos') || []).filter(i => i.ref === ref);
    const investimentos = invRows.filter(i => (i.operacao || 'aporte') === 'aporte').reduce((s, i) => s + i.valor, 0)
                        - invRows.filter(i => i.operacao === 'retirada').reduce((s, i) => s + i.valor, 0);
    return { ref, entradas, saidas, investimentos, saldo: entradas - saidas - investimentos };
  });
}

function reconstruirFiltroConsolidado() {
  const allRefs = getAllRefs();
  const anoAtual = String(new Date().getFullYear());
  const anos = [...new Set([...allRefs.map(r => r.split('-')[0]), anoAtual])].sort();
  const sel = document.getElementById('consFiltroAno');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  anos.forEach(a => { const o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o); });
  sel.value = consFiltroAno || atual;
  const lbl = document.getElementById('consFiltroLabel');
  if (lbl) { lbl.textContent = consFiltroAno ? 'Ano: ' + consFiltroAno : ''; lbl.style.display = consFiltroAno ? 'inline' : 'none'; }
}

function onConsFiltroAnoChange() {
  const sel = document.getElementById('consFiltroAno');
  consFiltroAno = sel ? sel.value : '';
  const lbl = document.getElementById('consFiltroLabel');
  if (lbl) { lbl.textContent = consFiltroAno ? 'Ano: ' + consFiltroAno : ''; lbl.style.display = consFiltroAno ? 'inline' : 'none'; }
  renderConsolidado();
}

function limparFiltroConsolidado() {
  consFiltroAno = '';
  const sel = document.getElementById('consFiltroAno');
  if (sel) sel.value = '';
  const lbl = document.getElementById('consFiltroLabel');
  if (lbl) lbl.style.display = 'none';
  renderConsolidado();
}

function sortConsolidado(col) {
  if (consSortSt.col === col) consSortSt.dir *= -1;
  else { consSortSt.col = col; consSortSt.dir = col === 'ref' ? -1 : 1; }
  document.getElementById('consolidadoTable').querySelectorAll('thead th').forEach(th => {
    th.classList.toggle('sorted', th.dataset.col === col);
    const si = th.querySelector('.sort-icon');
    if (si) si.textContent = th.dataset.col === col ? (consSortSt.dir === 1 ? '↑' : '↓') : '↕';
  });
  renderConsolidado();
}

function renderConsolidado() {
  reconstruirFiltroConsolidado();
  const tbody = document.getElementById('consolidadoBody');
  const tfoot = document.getElementById('consolidadoFoot');
  if (!tbody) return;

  let rows = getConsolidadoRows(consFiltroAno);
  const { col, dir } = consSortSt;
  rows.sort((a, b) => { const av = a[col] !== undefined ? a[col] : a.ref, bv = b[col] !== undefined ? b[col] : b.ref; return av < bv ? -dir : av > bv ? dir : 0; });

  const totEnt = rows.reduce((s, r) => s + r.entradas, 0);
  const totSai = rows.reduce((s, r) => s + r.saidas, 0);
  const totInv = rows.reduce((s, r) => s + r.investimentos, 0);
  const totSaldo = totEnt - totSai - totInv;

  const g = id => document.getElementById(id);
  if (g('consStatEntradas')) g('consStatEntradas').textContent = Fmt.brl(totEnt);
  if (g('consStatSaidas'))   g('consStatSaidas').textContent   = Fmt.brl(totSai);
  if (g('consStatInvest'))   g('consStatInvest').textContent   = Fmt.brl(totInv);
  if (g('consStatSaldo'))  { g('consStatSaldo').textContent = (totSaldo < 0 ? '−' : '') + Fmt.brl(Math.abs(totSaldo)); g('consStatSaldo').className = 'stat-value ' + (totSaldo >= 0 ? 'income' : 'expense'); }
  if (g('consSaldoCard'))    g('consSaldoCard').className = 'stat-card ' + (totSaldo >= 0 ? 'green' : 'red');
  if (g('consBadge'))        g('consBadge').textContent = rows.length + ' mês' + (rows.length !== 1 ? 'es' : '');

  if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum dado no período selecionado.</td></tr>'; tfoot.innerHTML = ''; return; }

  tbody.innerHTML = rows.map(r => {
    const sc = r.saldo >= 0 ? 'td-value-income' : 'td-value-expense';
    const sv = (r.saldo < 0 ? '−' : '') + Fmt.brl(Math.abs(r.saldo));
    const iv = r.investimentos !== 0 ? `<span class="td-value-invest">${r.investimentos < 0 ? '−' : ''}${Fmt.brl(Math.abs(r.investimentos))}</span>` : '<span style="color:var(--text-muted)">—</span>';
    return `<tr><td class="td-ref cons-ref">${Fmt.ref(r.ref)}</td><td class="td-value-income">${Fmt.brl(r.entradas)}</td><td class="td-value-expense">−${Fmt.brl(r.saidas)}</td><td>${iv}</td><td class="${sc}" style="font-weight:700;">${sv}</td></tr>`;
  }).join('');

  const tsc = totSaldo >= 0 ? 'td-value-income' : 'td-value-expense';
  const tsv = (totSaldo < 0 ? '−' : '') + Fmt.brl(Math.abs(totSaldo));
  const tiv = totInv !== 0 ? (totInv < 0 ? '−' : '') + Fmt.brl(Math.abs(totInv)) : '—';
  tfoot.innerHTML = `<tr class="ctrl-total-row cons-total"><td style="font-size:.82rem;text-align:right;padding-right:14px;">Total</td><td class="td-value-income">${Fmt.brl(totEnt)}</td><td class="td-value-expense">−${Fmt.brl(totSai)}</td><td class="td-value-invest">${tiv}</td><td class="${tsc}" style="font-weight:700;">${tsv}</td></tr>`;
}

function exportarConsolidadoMensalXlsx() {
  if (typeof XLSX === 'undefined') { Toast.show('Biblioteca XLSX não carregada.', 'error', 5000); return; }
  const rows = getConsolidadoRows(consFiltroAno);
  if (!rows.length) { Toast.show('Nenhum dado para exportar', 'warn'); return; }
  const { col, dir } = consSortSt;
  rows.sort((a, b) => { const av = a[col] !== undefined ? a[col] : a.ref, bv = b[col] !== undefined ? b[col] : b.ref; return av < bv ? -dir : av > bv ? dir : 0; });
  const wsData = [['Mês/Ano', 'Entradas (R$)', 'Saídas (R$)', 'Investimentos (R$)', 'Saldo (R$)']];
  rows.forEach(r => wsData.push([Fmt.ref(r.ref), r.entradas, -r.saidas, r.investimentos, r.saldo]));
  const totEnt = rows.reduce((s, r) => s + r.entradas, 0), totSai = rows.reduce((s, r) => s + r.saidas, 0), totInv = rows.reduce((s, r) => s + r.investimentos, 0);
  wsData.push(['TOTAL', totEnt, -totSai, totInv, totEnt - totSai - totInv]);
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];
  const fmt = '"R$" #,##0.00;[Red]"R$"-#,##0.00';
  for (let i = 1; i < wsData.length; i++) [1,2,3,4].forEach(c => { const ref = XLSX.utils.encode_cell({r:i,c}); if (ws[ref] && typeof ws[ref].v === 'number') { ws[ref].t = 'n'; ws[ref].z = fmt; } });
  const wb = XLSX.utils.book_new();
  const nome = 'Consolidado' + (consFiltroAno ? ' ' + consFiltroAno : ' Mensal');
  XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
  XLSX.writeFile(wb, 'FinPanel_Consolidado' + (consFiltroAno ? '_' + consFiltroAno : '_Mensal') + '.xlsx');
  Toast.show('Exportado com sucesso!', 'success');
}

/* ============================================
   INIT — agora assíncrono por causa do Firebase
============================================ */
async function init() {
  mostrarLoading('Conectando ao Firebase…');

  /* 1. Inicia o Firebase */
  try {
    initFirebase();
  } catch(err) {
    ocultarLoading();
    Toast.show('Erro ao iniciar Firebase. Verifique firebase-config.js', 'error', 8000);
    console.error('Firebase init error:', err);
    return;
  }

  /* 2. Carrega apenas dados GLOBAIS (usuarios, theme).
        Dados privados só são carregados APÓS o login. */
  mostrarLoading('Carregando dados…');
  await DB.loadAll();   // currentUser ainda é null -> só busca globais

  /* 3. Inicializa chaves globais padrão se banco estiver vazio */
  if (!DB.get('usuarios')) DB.set('usuarios', [{id:1,nome:'Administrador',perfil:'admin',senha:'admin123'}]);
  if (!DB.get('theme'))    DB.set('theme', 'dark');

  ocultarLoading();

  /* --- Setup visual --- */
  initTheme();
  initSidebar();

  const now = new Date();
  document.getElementById('topbarDate').textContent = now.toLocaleDateString('pt-BR', {weekday:'short',day:'2-digit',month:'short',year:'numeric'});

  const ym = Fmt.nowYM();
  ['insertRef','esRef','esPrimeiraParcela','investRef'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = ym;
  });

  filtroAno = ym.split('-')[0];
  filtroRef = ym;

  /* 4. Tenta restaurar sessao (carrega dados do usuario se sessao existir) */
  const restaurado = await tentarRestaurarSessao();
  if (restaurado) {
    entrarNoApp(true);
  }

  syncHamburger();

  /* Fecha sidebar ao clicar em item de menu no mobile */
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => { if (isMobile()) closeMobileSidebar(); });
  });

  document.getElementById('loginUser').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('loginPass').focus(); });
  document.getElementById('loginPass').addEventListener('keydown', e => { if(e.key==='Enter') fazerLogin(); });
}

init();
