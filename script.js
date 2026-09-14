/* ============================================
   FIREBASE — SDK v10 (compat via CDN)
============================================ */
let _db = null;
function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    _db = firebase.firestore();
    _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) {
    console.error('Erro ao iniciar Firebase:', e);
  }
}

/* ============================================
   DB — todas as chaves são compartilhadas entre
   os dois parceiros em /global/dados/{chave}
============================================ */
const DB = {
  _cache: {},
  _unsubscribe: null,

  _col() { return _db.collection('global').doc('dados').collection('chaves'); },

  get(k) { return this._cache[k] !== undefined ? this._cache[k] : null; },

  set(k, v) {
    this._cache[k] = v;
    if (_db) {
      this._col().doc(k).set({ data: JSON.stringify(v) })
        .catch(err => console.error('Firestore set error:', k, err));
    }
  },

  async loadAll() {
    if (!_db) return;
    try {
      const snap = await this._col().get();
      snap.forEach(doc => {
        try { this._cache[doc.id] = JSON.parse(doc.data().data); } catch {}
      });
    } catch (err) { console.error('Firestore loadAll error:', err); }
  },

  listenAll(onUpdate) {
    if (!_db) return;
    if (this._unsubscribe) { this._unsubscribe(); this._unsubscribe = null; }
    this._unsubscribe = this._col().onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'removed') delete this._cache[change.doc.id];
        else { try { this._cache[change.doc.id] = JSON.parse(change.doc.data().data); } catch {} }
      });
      if (onUpdate) onUpdate();
    }, err => console.error('Firestore listener:', err));
  },

  init() {
    if (!this.get('pessoas')) this.set('pessoas', [
      { id: 'p1', nome: 'Parceiro 1', login: 'parceiro1', senha: '1234', cor: '#3ddc84' },
      { id: 'p2', nome: 'Parceiro 2', login: 'parceiro2', senha: '1234', cor: '#5aa2ff' }
    ]);
    if (!this.get('salarios')) this.set('salarios', []);
    if (!this.get('valeRefeicao')) this.set('valeRefeicao', []);
    if (!this.get('extras')) this.set('extras', []);
    if (!this.get('despesas')) this.set('despesas', []);
    if (!this.get('categoriasDespesa')) this.set('categoriasDespesa', ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Outros']);
    if (!this.get('tiposExtra')) this.set('tiposExtra', ['Hora Extra', 'Bônus', 'PLR', 'Comissão', 'Outro']);
    if (!this.get('theme')) this.set('theme', 'dark');
  }
};

/* ============================================
   FMT
============================================ */
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const Fmt = {
  brl(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
  parse(s) { return parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.')) || 0; },
  toInput(v) { if (!v && v !== 0) return ''; return (+v).toFixed(2).replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.'); },
  ref(r) { if (!r) return '—'; const [y, m] = r.split('-'); return MESES[+m - 1] + '/' + y; },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
};

/* ============================================
   MÁSCARA DE VALORES (R$) — só números, separa
   milhares e centavos automaticamente
============================================ */
function formatarInputMoeda(e) {
  const el = e.target;
  let digits = el.value.replace(/\D/g, '');
  if (!digits) { el.value = ''; return; }
  digits = digits.replace(/^0+(?=\d)/, '');
  while (digits.length < 3) digits = '0' + digits;
  let centavos = digits.slice(-2);
  let inteiro = digits.slice(0, -2).replace(/^0+(?=\d)/, '');
  inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  el.value = inteiro + ',' + centavos;
}
function configurarMascarasMoeda() {
  document.querySelectorAll('.money-input').forEach(el => {
    el.addEventListener('input', formatarInputMoeda);
    el.addEventListener('paste', () => setTimeout(() => formatarInputMoeda({ target: el }), 0));
  });
}

/* ============================================
   ORDENAÇÃO DE TABELAS
============================================ */
const sortState = {
  salarios: { col: 'ref', dir: 'desc' },
  vr: { col: 'ref', dir: 'desc' },
  extras: { col: 'ref', dir: 'desc' },
  despesas: { col: 'ref', dir: 'desc' }
};
const RENDER_POR_TABELA = {};
function ordenarTabela(tabela, col, tipo) {
  const st = sortState[tabela];
  if (st.col === col) {
    st.dir = st.dir === 'asc' ? 'desc' : 'asc';
  } else {
    st.col = col;
    st.dir = tipo === 'texto' || tipo === 'data' ? 'asc' : 'desc';
  }
  if (RENDER_POR_TABELA[tabela]) RENDER_POR_TABELA[tabela]();
}
function aplicarOrdenacao(tabela, lista, getValor) {
  const st = sortState[tabela];
  const dir = st.dir === 'asc' ? 1 : -1;
  return [...lista].sort((a, b) => {
    let va = getValor(a, st.col);
    let vb = getValor(b, st.col);
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}
function atualizarIconesOrdenacao(tabela) {
  document.querySelectorAll(`th.sortable[data-tabela="${tabela}"]`).forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    const st = sortState[tabela];
    icon.textContent = st.col === th.dataset.col ? (st.dir === 'asc' ? '▲' : '▼') : '⇅';
  });
}
function configurarOrdenacaoTabelas() {
  document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => ordenarTabela(th.dataset.tabela, th.dataset.col, th.dataset.tipo));
  });
}

/* ============================================
   FILTRO DE PERÍODO GLOBAL (painel)
============================================ */
function dentroDoPeriodo(ref) {
  const sel = document.getElementById('filtroPeriodoGlobal');
  const val = sel ? sel.value : 'todos';
  if (!val || val === 'todos') return true;
  if (!ref) return false;
  const meses = parseInt(val, 10);
  const [y, m] = ref.split('-').map(Number);
  if (!y || !m) return false;
  const dataRef = new Date(y, m - 1, 1);
  const hoje = new Date();
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);
  return dataRef >= limite;
}

/* ============================================
   TEMA DE COR DINÂMICO — segue a cor da pessoa
============================================ */
function hexParaRgb(hex) {
  let c = (hex || '').replace('#', '');
  if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
  const num = parseInt(c, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function ajustarCor(hex, percent) {
  const { r, g, b } = hexParaRgb(hex);
  const ajusta = v => Math.min(255, Math.max(0, Math.round(v + 255 * percent)));
  return '#' + [ajusta(r), ajusta(g), ajusta(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function corDeContraste(hex) {
  const { r, g, b } = hexParaRgb(hex);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? '#0d1a13' : '#ffffff';
}
function aplicarCorTema(hex) {
  if (!hex || !/^#?[0-9a-fA-F]{3,6}$/.test(hex)) return;
  const { r, g, b } = hexParaRgb(hex);
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent2', ajustarCor(hex, -0.16));
  root.setProperty('--accent-text', corDeContraste(hex));
  root.setProperty('--accent-rgb', `${r},${g},${b}`);
}
function limparCorTema() {
  const root = document.documentElement.style;
  ['--accent', '--accent2', '--accent-text', '--accent-rgb'].forEach(v => root.removeProperty(v));
}

function corMonetaria(v) {
  return (v || 0) >= 0 ? 'var(--income)' : 'var(--danger)';
}

/* ============================================
   AUTH
============================================ */
let currentUser = null;
let selectedLoginId = null;

function renderLoginPeople() {
  const pessoas = DB.get('pessoas') || [];
  const wrap = document.getElementById('loginPeople');
  wrap.innerHTML = pessoas.map(p => `
    <div class="login-chip ${selectedLoginId === p.id ? 'active' : ''}" onclick="selecionarPessoaLogin('${p.id}')">
      <div class="dot" style="background:${p.cor};margin:0 auto 6px;width:22px;height:22px;"></div>
      <div class="nm">${p.nome}</div>
    </div>`).join('');
}
function selecionarPessoaLogin(id) {
  selectedLoginId = id;
  renderLoginPeople();
  document.getElementById('loginError').classList.remove('show');
  const pessoas = DB.get('pessoas') || [];
  const p = pessoas.find(p => p.id === id);
  if (p) aplicarCorTema(p.cor);
}

function fazerLogin() {
  const pessoas = DB.get('pessoas') || [];
  const senha = document.getElementById('loginPass').value;
  const pessoa = pessoas.find(p => p.id === selectedLoginId);
  if (!pessoa || pessoa.senha !== senha) {
    document.getElementById('loginError').classList.add('show');
    return;
  }
  currentUser = pessoa;
  sessionStorage.setItem('painelCasal_uid', pessoa.id);
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appWrapper').classList.remove('hidden');
  aplicarCorTema(pessoa.cor);
  atualizarTopoUsuario();
  renderAll();
}

function fazerLogout() {
  currentUser = null;
  sessionStorage.removeItem('painelCasal_uid');
  document.getElementById('loginPass').value = '';
  selectedLoginId = null;
  document.getElementById('appWrapper').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  limparCorTema();
  renderLoginPeople();
}

function atualizarTopoUsuario() {
  if (!currentUser) return;
  const avatar = document.getElementById('userAvatar');
  avatar.textContent = currentUser.nome.slice(0, 2).toUpperCase();
  avatar.style.background = currentUser.cor;
  avatar.style.color = corDeContraste(currentUser.cor);
  document.getElementById('dropdownName').textContent = currentUser.nome;
}

function togglePwd(id, btn) {
  const el = document.getElementById(id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

function toggleUserDropdown() { document.getElementById('userDropdown').classList.toggle('show'); }
document.addEventListener('click', e => {
  if (!e.target.closest('.avatar-wrap')) document.getElementById('userDropdown')?.classList.remove('show');
});

function abrirTrocarSenha() { toggleUserDropdown(); abrirModal('modalSenha'); }
function trocarSenha() {
  const n1 = document.getElementById('nova_senha').value;
  const n2 = document.getElementById('conf_senha').value;
  if (!n1 || n1 !== n2) { toast('As senhas não coincidem.', 'error'); return; }
  const pessoas = DB.get('pessoas') || [];
  const p = pessoas.find(p => p.id === currentUser.id);
  if (p) { p.senha = n1; DB.set('pessoas', pessoas); currentUser.senha = n1; }
  toast('Senha atualizada.');
  fecharModal('modalSenha');
}

/* ============================================
   THEME / SIDEBAR / NAV
============================================ */
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const novo = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', novo);
  DB.set('theme', novo);
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  const collapsed = sb.classList.contains('collapsed');
  document.getElementById('collapseIcon').textContent = collapsed ? '›' : '‹';
  DB.set('sidebarCollapsed', collapsed);
}
function toggleMobileSidebar() { document.getElementById('sidebar').classList.toggle('mobile-open'); document.getElementById('sidebarBackdrop').classList.toggle('show'); }
function closeMobileSidebar() { document.getElementById('sidebar').classList.remove('mobile-open'); document.getElementById('sidebarBackdrop').classList.remove('show'); }

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const tab = item.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('topbarTitle').textContent = item.querySelector('span').textContent;
    closeMobileSidebar();
  });
});

function atualizarData() {
  const d = new Date();
  document.getElementById('topbarDate').textContent = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

/* ============================================
   TOAST
============================================ */
function toast(msg, type = 'success') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ============================================
   MODAL HELPERS
============================================ */
function abrirModal(id) { document.getElementById(id).classList.add('show'); }
function fecharModal(id) { document.getElementById(id).classList.remove('show'); }

function populaMesAno(selMes, selAno, ref) {
  const mesSel = document.getElementById(selMes), anoSel = document.getElementById(selAno);
  mesSel.innerHTML = MESES.map((m, i) => `<option value="${String(i + 1).padStart(2, '0')}">${m}</option>`).join('');
  const anoAtual = new Date().getFullYear();
  let anos = [];
  for (let a = anoAtual - 3; a <= anoAtual + 2; a++) anos.push(a);
  anoSel.innerHTML = anos.map(a => `<option value="${a}">${a}</option>`).join('');
  if (ref) {
    const [y, m] = ref.split('-');
    mesSel.value = m; anoSel.value = y;
  } else {
    mesSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
    anoSel.value = anoAtual;
  }
}
function lerRef(selMes, selAno) { return document.getElementById(selAno).value + '-' + document.getElementById(selMes).value; }

function populaPessoaSelect(selId, includeAll) {
  const pessoas = DB.get('pessoas') || [];
  const sel = document.getElementById(selId);
  let html = includeAll ? '<option value="">Todas as pessoas</option>' : '';
  html += pessoas.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  sel.innerHTML = html;
}
function populaCategoriaSelect(selId, includeAll) {
  const cats = DB.get('categoriasDespesa') || [];
  const sel = document.getElementById(selId);
  let html = includeAll ? '<option value="">Todas</option>' : '';
  html += cats.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.innerHTML = html;
}
function populaTipoExtraSelect(selId) {
  const tipos = DB.get('tiposExtra') || [];
  document.getElementById(selId).innerHTML = tipos.map(t => `<option value="${t}">${t}</option>`).join('');
}
function populaRefFiltro(selId, registros) {
  const sel = document.getElementById(selId);
  const atual = sel.value;
  const refs = [...new Set(registros.map(r => r.ref))].sort().reverse();
  sel.innerHTML = '<option value="">Todos os períodos</option>' + refs.map(r => `<option value="${r}">${Fmt.ref(r)}</option>`).join('');
  if (refs.includes(atual)) sel.value = atual;
}
function pessoaNome(id) { const p = (DB.get('pessoas') || []).find(p => p.id === id); return p ? p.nome : '—'; }
function pessoaCor(id) { const p = (DB.get('pessoas') || []).find(p => p.id === id); return p ? p.cor : '#888'; }
function pessoaTag(id) { return `<span class="pessoa-tag"><span class="pessoa-dot" style="background:${pessoaCor(id)}"></span>${pessoaNome(id)}</span>`; }

/* ============================================
   SALÁRIOS
============================================ */
function abrirModalSalario(id) {
  populaPessoaSelect('sal_pessoa', false);
  const registros = DB.get('salarios') || [];
  const item = registros.find(r => r.id === id);
  document.getElementById('tituloModalSalario').textContent = item ? 'Editar Salário' : 'Novo Salário';
  document.getElementById('sal_id').value = id || '';
  populaMesAno('sal_mes', 'sal_ano', item ? item.ref : null);
  if (item) document.getElementById('sal_pessoa').value = item.pessoaId;
  document.getElementById('sal_adiantamento').value = item ? Fmt.toInput(item.adiantamento) : '';
  document.getElementById('sal_pagamento').value = item ? Fmt.toInput(item.pagamento) : '';
  document.getElementById('sal_bruto').value = item ? Fmt.toInput(item.bruto) : '';
  abrirModal('modalSalario');
}
function salvarSalario() {
  const id = document.getElementById('sal_id').value;
  const pessoaId = document.getElementById('sal_pessoa').value;
  if (!pessoaId) { toast('Selecione uma pessoa.', 'error'); return; }
  const novo = {
    id: id || Fmt.uid(),
    pessoaId,
    ref: lerRef('sal_mes', 'sal_ano'),
    adiantamento: Fmt.parse(document.getElementById('sal_adiantamento').value),
    pagamento: Fmt.parse(document.getElementById('sal_pagamento').value),
    bruto: Fmt.parse(document.getElementById('sal_bruto').value)
  };
  let registros = DB.get('salarios') || [];
  if (id) registros = registros.map(r => r.id === id ? novo : r);
  else registros.push(novo);
  DB.set('salarios', registros);
  fecharModal('modalSalario');
  toast('Salário salvo.');
  renderSalarios(); renderResumo();
}
function excluirSalario(id) {
  if (!confirm('Excluir este lançamento de salário?')) return;
  DB.set('salarios', (DB.get('salarios') || []).filter(r => r.id !== id));
  renderSalarios(); renderResumo();
  toast('Registro excluído.');
}
function renderSalarios() {
  const registros = DB.get('salarios') || [];
  populaRefFiltro('filtroRefSal', registros);
  populaPessoaSelect('filtroPessoaSal', true);
  const ref = document.getElementById('filtroRefSal').value;
  const pessoaId = document.getElementById('filtroPessoaSal').value;
  let filtrados = registros.filter(r => (!ref || r.ref === ref) && (!pessoaId || r.pessoaId === pessoaId) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('salarios', filtrados, (r, col) => {
    switch (col) {
      case 'pessoa': return pessoaNome(r.pessoaId);
      case 'adiantamento': return r.adiantamento || 0;
      case 'pagamento': return r.pagamento || 0;
      case 'liquido': return (r.adiantamento || 0) + (r.pagamento || 0);
      case 'bruto': return r.bruto || 0;
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('salarios');
  document.getElementById('salBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('salBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => {
    const liquido = (r.adiantamento || 0) + (r.pagamento || 0);
    return `<tr>
      <td>${pessoaTag(r.pessoaId)}</td><td>${Fmt.ref(r.ref)}</td>
      <td>${Fmt.brl(r.adiantamento)}</td><td>${Fmt.brl(r.pagamento)}</td>
      <td style="color:${corMonetaria(liquido)};font-weight:600;">${Fmt.brl(liquido)}</td><td>${Fmt.brl(r.bruto)}</td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalSalario('${r.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirSalario('${r.id}')" title="Excluir">🗑</button></td>
    </tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="7">Nenhum lançamento encontrado.</td></tr>';

  const totalLiquido = filtrados.reduce((s, r) => s + (r.adiantamento || 0) + (r.pagamento || 0), 0);
  const totalBruto = filtrados.reduce((s, r) => s + (r.bruto || 0), 0);
  document.getElementById('statsSalarios').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Salário Líquido</div><div class="stat-value income">${Fmt.brl(totalLiquido)}</div><div class="stat-sub">Adiantamento + Pagamento</div></div>
    <div class="stat-card blue"><div class="stat-label">Salário Bruto</div><div class="stat-value neutral">${Fmt.brl(totalBruto)}</div><div class="stat-sub">Total bruto do período</div></div>
    <div class="stat-card warn"><div class="stat-label">Lançamentos</div><div class="stat-value neutral">${filtrados.length}</div><div class="stat-sub">Registros no filtro atual</div></div>`;
}

/* ============================================
   VALE REFEIÇÃO
============================================ */
function abrirModalVR(id) {
  populaPessoaSelect('vr_pessoa', false);
  const registros = DB.get('valeRefeicao') || [];
  const item = registros.find(r => r.id === id);
  document.getElementById('tituloModalVR').textContent = item ? 'Editar Vale Refeição' : 'Novo Vale Refeição';
  document.getElementById('vr_id').value = id || '';
  populaMesAno('vr_mes', 'vr_ano', item ? item.ref : null);
  if (item) document.getElementById('vr_pessoa').value = item.pessoaId;
  document.getElementById('vr_recebido').value = item ? Fmt.toInput(item.recebido) : '';
  document.getElementById('vr_utilizado').value = item ? Fmt.toInput(item.utilizado) : '';
  document.getElementById('vr_data').value = item ? (item.data || '') : '';
  document.getElementById('vr_obs').value = item ? (item.obs || '') : '';
  abrirModal('modalVR');
}
function salvarVR() {
  const id = document.getElementById('vr_id').value;
  const pessoaId = document.getElementById('vr_pessoa').value;
  if (!pessoaId) { toast('Selecione uma pessoa.', 'error'); return; }
  const novo = {
    id: id || Fmt.uid(),
    pessoaId,
    ref: lerRef('vr_mes', 'vr_ano'),
    recebido: Fmt.parse(document.getElementById('vr_recebido').value),
    utilizado: Fmt.parse(document.getElementById('vr_utilizado').value),
    data: document.getElementById('vr_data').value,
    obs: document.getElementById('vr_obs').value.trim()
  };
  let registros = DB.get('valeRefeicao') || [];
  if (id) registros = registros.map(r => r.id === id ? novo : r);
  else registros.push(novo);
  DB.set('valeRefeicao', registros);
  fecharModal('modalVR');
  toast('Vale refeição salvo.');
  renderVR(); renderResumo();
}
function excluirVR(id) {
  if (!confirm('Excluir este lançamento de vale refeição?')) return;
  DB.set('valeRefeicao', (DB.get('valeRefeicao') || []).filter(r => r.id !== id));
  renderVR(); renderResumo();
  toast('Registro excluído.');
}
function renderVR() {
  const registros = DB.get('valeRefeicao') || [];
  populaRefFiltro('filtroRefVr', registros);
  populaPessoaSelect('filtroPessoaVr', true);
  const ref = document.getElementById('filtroRefVr').value;
  const pessoaId = document.getElementById('filtroPessoaVr').value;
  let filtrados = registros.filter(r => (!ref || r.ref === ref) && (!pessoaId || r.pessoaId === pessoaId) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('vr', filtrados, (r, col) => {
    switch (col) {
      case 'pessoa': return pessoaNome(r.pessoaId);
      case 'data': return r.data || '';
      case 'recebido': return r.recebido || 0;
      case 'utilizado': return r.utilizado || 0;
      case 'saldo': return (r.recebido || 0) - (r.utilizado || 0);
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('vr');
  document.getElementById('vrBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('vrBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => {
    const saldo = (r.recebido || 0) - (r.utilizado || 0);
    const dataFmt = r.data ? new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    return `<tr>
      <td>${pessoaTag(r.pessoaId)}</td><td>${Fmt.ref(r.ref)}</td><td>${dataFmt}</td>
      <td>${Fmt.brl(r.recebido)}</td><td style="color:var(--danger);font-weight:600;">${Fmt.brl(r.utilizado)}</td>
      <td style="color:${corMonetaria(saldo)};font-weight:600;">${Fmt.brl(saldo)}</td>
      <td>${r.obs ? r.obs : '—'}</td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalVR('${r.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirVR('${r.id}')" title="Excluir">🗑</button></td>
    </tr>`;
  }).join('') : '<tr class="empty-row"><td colspan="8">Nenhum lançamento encontrado.</td></tr>';

  const totalRecebido = filtrados.reduce((s, r) => s + (r.recebido || 0), 0);
  const totalUtilizado = filtrados.reduce((s, r) => s + (r.utilizado || 0), 0);
  document.getElementById('statsVR').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total Recebido</div><div class="stat-value income">${Fmt.brl(totalRecebido)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Total Utilizado</div><div class="stat-value neutral">${Fmt.brl(totalUtilizado)}</div><div class="stat-sub">Consumo no período</div></div>
    <div class="stat-card blue"><div class="stat-label">Saldo</div><div class="stat-value neutral">${Fmt.brl(totalRecebido - totalUtilizado)}</div><div class="stat-sub">Recebido − Utilizado</div></div>`;
}

/* ============================================
   EXTRAS
============================================ */
function abrirModalExtra(id) {
  populaPessoaSelect('ext_pessoa', false);
  populaTipoExtraSelect('ext_tipo');
  const registros = DB.get('extras') || [];
  const item = registros.find(r => r.id === id);
  document.getElementById('tituloModalExtra').textContent = item ? 'Editar Extra' : 'Novo Extra';
  document.getElementById('ext_id').value = id || '';
  populaMesAno('ext_mes', 'ext_ano', item ? item.ref : null);
  if (item) { document.getElementById('ext_pessoa').value = item.pessoaId; document.getElementById('ext_tipo').value = item.tipo; }
  document.getElementById('ext_liquido').value = item ? Fmt.toInput(item.liquido) : '';
  document.getElementById('ext_bruto').value = item ? Fmt.toInput(item.bruto) : '';
  abrirModal('modalExtra');
}
function salvarExtra() {
  const id = document.getElementById('ext_id').value;
  const pessoaId = document.getElementById('ext_pessoa').value;
  if (!pessoaId) { toast('Selecione uma pessoa.', 'error'); return; }
  const novo = {
    id: id || Fmt.uid(),
    pessoaId,
    ref: lerRef('ext_mes', 'ext_ano'),
    tipo: document.getElementById('ext_tipo').value,
    liquido: Fmt.parse(document.getElementById('ext_liquido').value),
    bruto: Fmt.parse(document.getElementById('ext_bruto').value)
  };
  let registros = DB.get('extras') || [];
  if (id) registros = registros.map(r => r.id === id ? novo : r);
  else registros.push(novo);
  DB.set('extras', registros);
  fecharModal('modalExtra');
  toast('Extra salvo.');
  renderExtras(); renderResumo();
}
function excluirExtra(id) {
  if (!confirm('Excluir este lançamento extra?')) return;
  DB.set('extras', (DB.get('extras') || []).filter(r => r.id !== id));
  renderExtras(); renderResumo();
  toast('Registro excluído.');
}
function renderExtras() {
  const registros = DB.get('extras') || [];
  populaRefFiltro('filtroRefExt', registros);
  populaPessoaSelect('filtroPessoaExt', true);
  const ref = document.getElementById('filtroRefExt').value;
  const pessoaId = document.getElementById('filtroPessoaExt').value;
  let filtrados = registros.filter(r => (!ref || r.ref === ref) && (!pessoaId || r.pessoaId === pessoaId) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('extras', filtrados, (r, col) => {
    switch (col) {
      case 'pessoa': return pessoaNome(r.pessoaId);
      case 'tipo': return r.tipo || '';
      case 'liquido': return r.liquido || 0;
      case 'bruto': return r.bruto || 0;
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('extras');
  document.getElementById('extBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('extBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => `<tr>
      <td>${pessoaTag(r.pessoaId)}</td><td>${Fmt.ref(r.ref)}</td><td>${r.tipo}</td>
      <td style="color:${corMonetaria(r.liquido)};font-weight:600;">${Fmt.brl(r.liquido)}</td><td>${Fmt.brl(r.bruto)}</td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalExtra('${r.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirExtra('${r.id}')" title="Excluir">🗑</button></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="6">Nenhum lançamento encontrado.</td></tr>';

  const totalLiquido = filtrados.reduce((s, r) => s + (r.liquido || 0), 0);
  const totalBruto = filtrados.reduce((s, r) => s + (r.bruto || 0), 0);
  document.getElementById('statsExtras').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total Líquido</div><div class="stat-value income">${Fmt.brl(totalLiquido)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card blue"><div class="stat-label">Total Bruto</div><div class="stat-value neutral">${Fmt.brl(totalBruto)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Lançamentos</div><div class="stat-value neutral">${filtrados.length}</div><div class="stat-sub">Registros no filtro atual</div></div>`;
}

/* ============================================
   DESPESAS
============================================ */
function onDespesaTipoChange() {
  document.getElementById('desp_parcelas_wrap').style.display = document.getElementById('desp_tipo').value === 'parcelada' ? 'block' : 'none';
}
function abrirModalDespesa(id) {
  populaCategoriaSelect('desp_categoria', false);
  const registros = DB.get('despesas') || [];
  const item = registros.find(r => r.id === id);
  document.getElementById('tituloModalDespesa').textContent = item ? 'Editar Despesa' : 'Nova Despesa';
  document.getElementById('desp_id').value = id || '';
  populaMesAno('desp_mes', 'desp_ano', item ? item.ref : null);
  document.getElementById('desp_descricao').value = item ? item.descricao : '';
  if (item) document.getElementById('desp_categoria').value = item.categoria;
  document.getElementById('desp_valor').value = item ? Fmt.toInput(item.valor) : '';
  document.getElementById('desp_tipo').value = item ? item.tipo : 'avista';
  document.getElementById('desp_parcelas').value = item ? (item.totalParcelas || 2) : 2;
  document.getElementById('desp_status').value = item ? item.status : 'pendente';
  onDespesaTipoChange();
  // ao editar uma parcela já gerada, não permite mudar a quantidade de parcelas
  document.getElementById('desp_tipo').disabled = !!item && item.tipo === 'parcelada';
  abrirModal('modalDespesa');
}
function salvarDespesa() {
  const id = document.getElementById('desp_id').value;
  const descricao = document.getElementById('desp_descricao').value.trim();
  if (!descricao) { toast('Informe a descrição da despesa.', 'error'); return; }
  const categoria = document.getElementById('desp_categoria').value;
  const valor = Fmt.parse(document.getElementById('desp_valor').value);
  const tipo = document.getElementById('desp_tipo').value;
  const status = document.getElementById('desp_status').value;
  const refBase = lerRef('desp_mes', 'desp_ano');
  let registros = DB.get('despesas') || [];

  if (id) {
    registros = registros.map(r => r.id === id ? { ...r, descricao, categoria, valor, ref: refBase, status } : r);
    DB.set('despesas', registros);
    toast('Despesa atualizada.');
  } else if (tipo === 'parcelada') {
    const totalParcelas = Math.max(2, parseInt(document.getElementById('desp_parcelas').value) || 2);
    const grupoId = Fmt.uid();
    const [anoBase, mesBase] = refBase.split('-').map(Number);
    for (let i = 0; i < totalParcelas; i++) {
      const d = new Date(anoBase, mesBase - 1 + i, 1);
      const ref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      registros.push({
        id: Fmt.uid(), descricao, categoria, valor, ref, tipo, status,
        parcelaAtual: i + 1, totalParcelas, grupoId
      });
    }
    DB.set('despesas', registros);
    toast('Despesa parcelada em ' + totalParcelas + 'x criada.');
  } else {
    registros.push({ id: Fmt.uid(), descricao, categoria, valor, ref: refBase, tipo, status });
    DB.set('despesas', registros);
    toast('Despesa salva.');
  }
  fecharModal('modalDespesa');
  renderDespesas(); renderResumo();
}
function excluirDespesa(id) {
  if (!confirm('Excluir esta despesa?')) return;
  DB.set('despesas', (DB.get('despesas') || []).filter(r => r.id !== id));
  renderDespesas(); renderResumo();
  toast('Despesa excluída.');
}
function alternarStatusDespesa(id) {
  const registros = (DB.get('despesas') || []).map(r => r.id === id ? { ...r, status: r.status === 'pago' ? 'pendente' : 'pago' } : r);
  DB.set('despesas', registros);
  renderDespesas(); renderResumo();
}
function renderDespesas() {
  const registros = DB.get('despesas') || [];
  populaRefFiltro('filtroRefDesp', registros);
  populaCategoriaSelect('filtroCatDesp', true);
  const ref = document.getElementById('filtroRefDesp').value;
  const status = document.getElementById('filtroStatusDesp').value;
  const categoria = document.getElementById('filtroCatDesp').value;
  let filtrados = registros.filter(r => (!ref || r.ref === ref) && (!status || r.status === status) && (!categoria || r.categoria === categoria) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('despesas', filtrados, (r, col) => {
    switch (col) {
      case 'descricao': return r.descricao || '';
      case 'categoria': return r.categoria || '';
      case 'valor': return r.valor || 0;
      case 'status': return r.status || '';
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('despesas');
  document.getElementById('despBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('despBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => `<tr>
      <td>${r.descricao}</td><td>${r.categoria || '—'}</td><td>${Fmt.ref(r.ref)}</td>
      <td>${r.tipo === 'parcelada' ? r.parcelaAtual + '/' + r.totalParcelas : 'À vista'}</td>
      <td>${Fmt.brl(r.valor)}</td>
      <td><span class="pill ${r.status === 'pago' ? 'ok' : 'pend'}" style="cursor:pointer;" onclick="alternarStatusDespesa('${r.id}')">${r.status === 'pago' ? 'Pago' : 'Pendente'}</span></td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalDespesa('${r.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirDespesa('${r.id}')" title="Excluir">🗑</button></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="7">Nenhuma despesa encontrada.</td></tr>';

  const totalGeral = filtrados.reduce((s, r) => s + (r.valor || 0), 0);
  const totalPago = filtrados.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor || 0), 0);
  const totalPendente = totalGeral - totalPago;
  document.getElementById('statsDespesas').innerHTML = `
    <div class="stat-card danger"><div class="stat-label">Total de Despesas</div><div class="stat-value expense">${Fmt.brl(totalGeral)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card green"><div class="stat-label">Já Pago</div><div class="stat-value income">${Fmt.brl(totalPago)}</div><div class="stat-sub">Quitado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Pendente</div><div class="stat-value neutral">${Fmt.brl(totalPendente)}</div><div class="stat-sub">A pagar no período</div></div>`;
}

/* ============================================
   RESUMO CONSOLIDADO
============================================ */
function renderResumo() {
  const salarios = DB.get('salarios') || [];
  const vr = DB.get('valeRefeicao') || [];
  const extras = DB.get('extras') || [];
  const despesas = DB.get('despesas') || [];
  const pessoas = DB.get('pessoas') || [];

  const todasRefs = [...new Set([...salarios, ...vr, ...extras, ...despesas].map(r => r.ref))];
  populaRefFiltro('filtroRefResumo', todasRefs.map(ref => ({ ref })));
  const ref = document.getElementById('filtroRefResumo').value;

  const fS = salarios.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fV = vr.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fE = extras.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fD = despesas.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));

  const totalSal = fS.reduce((s, r) => s + (r.adiantamento || 0) + (r.pagamento || 0), 0);
  const totalVr = fV.reduce((s, r) => s + (r.recebido || 0), 0);
  const totalExt = fE.reduce((s, r) => s + (r.liquido || 0), 0);
  const totalEntradas = totalSal + totalVr + totalExt;
  const totalDespesas = fD.reduce((s, r) => s + (r.valor || 0), 0);
  const saldo = totalEntradas - totalDespesas;

  document.getElementById('statsResumoGeral').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total de Entradas</div><div class="stat-value income">${Fmt.brl(totalEntradas)}</div><div class="stat-sub">Salários + VR + Extras</div></div>
    <div class="stat-card danger"><div class="stat-label">Total de Despesas</div><div class="stat-value expense">${Fmt.brl(totalDespesas)}</div><div class="stat-sub">Todas as despesas do período</div></div>
    <div class="stat-card blue"><div class="stat-label">Saldo do Casal</div><div class="stat-value ${saldo >= 0 ? 'income' : 'expense'}">${Fmt.brl(saldo)}</div><div class="stat-sub">Entradas − Despesas</div></div>`;

  const bodyPessoa = document.getElementById('resumoPessoaBody');
  bodyPessoa.innerHTML = pessoas.map(p => {
    const s = fS.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.adiantamento || 0) + (r.pagamento || 0), 0);
    const v = fV.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.recebido || 0), 0);
    const e = fE.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.liquido || 0), 0);
    return `<tr><td>${pessoaTag(p.id)}</td><td>${Fmt.brl(s)}</td><td>${Fmt.brl(v)}</td><td>${Fmt.brl(e)}</td><td style="font-weight:700;color:${corMonetaria(s + v + e)};">${Fmt.brl(s + v + e)}</td></tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="5">Nenhuma pessoa cadastrada.</td></tr>';

  const categorias = DB.get('categoriasDespesa') || [];
  const bodyCat = document.getElementById('resumoCatBody');
  const linhasCat = categorias.map(c => {
    const itens = fD.filter(r => r.categoria === c);
    if (!itens.length) return null;
    const pago = itens.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor || 0), 0);
    const total = itens.reduce((s, r) => s + (r.valor || 0), 0);
    return `<tr><td>${c}</td><td>${Fmt.brl(pago)}</td><td>${Fmt.brl(total - pago)}</td><td style="font-weight:700;">${Fmt.brl(total)}</td></tr>`;
  }).filter(Boolean);
  bodyCat.innerHTML = linhasCat.length ? linhasCat.join('') : '<tr class="empty-row"><td colspan="4">Nenhuma despesa no período.</td></tr>';
}

/* ============================================
   CONFIGURAÇÃO — pessoas, categorias, tipos de extra
============================================ */
function previewCorPessoa(hex) {
  const id = document.getElementById('pes_id').value;
  if (currentUser && id === currentUser.id) aplicarCorTema(hex);
}
function fecharModalPessoa() {
  fecharModal('modalPessoa');
  if (currentUser) aplicarCorTema(currentUser.cor);
}
function abrirModalPessoa(id) {
  const pessoas = DB.get('pessoas') || [];
  const item = pessoas.find(p => p.id === id);
  document.getElementById('tituloModalPessoa').textContent = item ? 'Editar Pessoa' : 'Nova Pessoa';
  document.getElementById('pes_id').value = id || '';
  document.getElementById('pes_nome').value = item ? item.nome : '';
  document.getElementById('pes_login').value = item ? item.login : '';
  document.getElementById('pes_senha').value = '';
  document.getElementById('pes_senha').placeholder = item ? '••••••••' : 'Senha inicial';
  document.getElementById('pes_senha_hint').classList.toggle('hidden', !item);
  document.getElementById('pes_cor').value = item ? item.cor : '#3ddc84';
  abrirModal('modalPessoa');
}
function salvarPessoa() {
  const id = document.getElementById('pes_id').value;
  const nome = document.getElementById('pes_nome').value.trim();
  const login = document.getElementById('pes_login').value.trim();
  const senha = document.getElementById('pes_senha').value.trim();
  const cor = document.getElementById('pes_cor').value;
  if (!nome || !login || (!id && !senha)) { toast('Preencha todos os campos.', 'error'); return; }
  const pessoas = DB.get('pessoas') || [];
  if (id) {
    const idx = pessoas.findIndex(p => p.id === id);
    if (idx === -1) return;
    pessoas[idx] = { ...pessoas[idx], nome, login, cor, senha: senha || pessoas[idx].senha };
    if (currentUser && currentUser.id === id) {
      currentUser = pessoas[idx];
      atualizarTopoUsuario();
      aplicarCorTema(cor);
    }
    toast('Pessoa atualizada.');
  } else {
    pessoas.push({ id: Fmt.uid(), nome, login, senha, cor });
    toast('Pessoa adicionada.');
  }
  DB.set('pessoas', pessoas);
  fecharModal('modalPessoa');
  renderConfiguracao(); renderLoginPeople();
}
function excluirPessoa(id) {
  if (!confirm('Remover esta pessoa? Os lançamentos já feitos por ela serão mantidos.')) return;
  DB.set('pessoas', (DB.get('pessoas') || []).filter(p => p.id !== id));
  renderConfiguracao(); renderLoginPeople();
  toast('Pessoa removida.');
}
function renderConfiguracao() {
  const pessoas = DB.get('pessoas') || [];
  document.getElementById('pessoasLista').innerHTML = pessoas.map(p => `
    <div class="people-card">
      <div class="who"><span class="dot" style="background:${p.cor}"></span><div><strong>${p.nome}</strong><div style="font-size:.72rem;color:var(--text2);">login: ${p.login}</div></div></div>
      <div class="row-actions"><button class="icon-btn" onclick="abrirModalPessoa('${p.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirPessoa('${p.id}')" title="Remover">🗑</button></div>
    </div>`).join('') || '<div style="color:var(--text2);">Nenhuma pessoa cadastrada.</div>';

  const cats = DB.get('categoriasDespesa') || [];
  document.getElementById('categoriasLista').innerHTML = cats.map(c => `<div class="chip">${c}<button onclick="removerCategoria('${c}')">✕</button></div>`).join('');

  const tipos = DB.get('tiposExtra') || [];
  document.getElementById('tiposExtraLista').innerHTML = tipos.map(t => `<div class="chip">${t}<button onclick="removerTipoExtra('${t}')">✕</button></div>`).join('');
}
function adicionarCategoria() {
  const input = document.getElementById('novaCategoria');
  const v = input.value.trim();
  if (!v) return;
  const cats = DB.get('categoriasDespesa') || [];
  if (!cats.includes(v)) { cats.push(v); DB.set('categoriasDespesa', cats); renderConfiguracao(); }
  input.value = '';
}
function removerCategoria(c) {
  DB.set('categoriasDespesa', (DB.get('categoriasDespesa') || []).filter(x => x !== c));
  renderConfiguracao();
}
function adicionarTipoExtra() {
  const input = document.getElementById('novoTipoExtra');
  const v = input.value.trim();
  if (!v) return;
  const tipos = DB.get('tiposExtra') || [];
  if (!tipos.includes(v)) { tipos.push(v); DB.set('tiposExtra', tipos); renderConfiguracao(); }
  input.value = '';
}
function removerTipoExtra(t) {
  DB.set('tiposExtra', (DB.get('tiposExtra') || []).filter(x => x !== t));
  renderConfiguracao();
}

/* ============================================
   RENDER ALL
============================================ */
function renderAll() {
  renderSalarios();
  renderVR();
  renderExtras();
  renderDespesas();
  renderResumo();
  renderConfiguracao();
}
RENDER_POR_TABELA.salarios = renderSalarios;
RENDER_POR_TABELA.vr = renderVR;
RENDER_POR_TABELA.extras = renderExtras;
RENDER_POR_TABELA.despesas = renderDespesas;

/* ============================================
   START
============================================ */
window.addEventListener('DOMContentLoaded', async () => {
  atualizarData();
  configurarMascarasMoeda();
  configurarOrdenacaoTabelas();
  initFirebase();
  await DB.loadAll();
  DB.init();

  const theme = DB.get('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  if (DB.get('sidebarCollapsed')) {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('collapseIcon').textContent = '›';
  }

  renderLoginPeople();

  DB.listenAll(() => {
    if (document.getElementById('appWrapper').classList.contains('hidden')) return;
    renderAll();
  });
});
