/* ============================================
   FIREBASE — SDK v10 (compat via CDN)
============================================ */
let _db = null;
function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    _db = firebase.firestore();
    // O SDK "compat" (usado aqui) ainda não expõe a API nova de cache
    // (persistentLocalCache/persistentMultipleTabManager) — isso só existe
    // na API modular do Firebase. Enquanto o app usar o compat, o método
    // abaixo é o correto; o aviso de depreciação no console pode ser
    // ignorado com segurança até uma eventual migração para o SDK modular.
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
    if (!this.get('entradas')) this.set('entradas', []);
    if (!this.get('categoriasDespesa')) this.set('categoriasDespesa', ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Cartão de Crédito', 'Reserva de Emergência', 'Outros']);
    else {
      let cats = this.get('categoriasDespesa');
      const temReserva = cats.some(c => normalizarTexto(c) === 'reserva de emergencia' || normalizarTexto(c) === 'reserva');
      if (!temReserva) cats = [...cats, 'Reserva de Emergência'];
      const temCartao = cats.some(c => normalizarTexto(c) === 'cartao de credito');
      if (!temCartao) cats = [...cats, 'Cartão de Crédito'];
      this.set('categoriasDespesa', cats);
    }
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
function normalizarTexto(s) { return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function ehInvestimento(categoria) {
  const c = normalizarTexto(categoria);
  return c === 'reserva' || c === 'reserva de emergencia';
}
function ehCartaoCredito(categoria) {
  return normalizarTexto(categoria) === 'cartao de credito';
}

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
  entradas: { col: 'ref', dir: 'desc' },
  despesas: { col: 'ref', dir: 'desc' },
  investimentos: { col: 'ref', dir: 'desc' }
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
  entrarComoPessoa(pessoa);
}

function entrarComoPessoa(pessoa) {
  currentUser = pessoa;
  localStorage.setItem('painelCasal_uid', pessoa.id);
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appWrapper').classList.remove('hidden');
  aplicarCorTema(pessoa.cor);
  atualizarTopoUsuario();
  renderAll();
}

function tentarRestaurarSessao() {
  const uid = localStorage.getItem('painelCasal_uid');
  if (!uid) return false;
  const pessoa = (DB.get('pessoas') || []).find(p => p.id === uid);
  if (!pessoa) { localStorage.removeItem('painelCasal_uid'); return false; }
  entrarComoPessoa(pessoa);
  return true;
}

function fazerLogout() {
  currentUser = null;
  localStorage.removeItem('painelCasal_uid');
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
  const atual = sel.value;
  let html = includeAll ? '<option value="">Todas as pessoas</option>' : '';
  html += pessoas.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  sel.innerHTML = html;
  if (pessoas.some(p => p.id === atual) || (includeAll && atual === '')) sel.value = atual;
}
function populaCategoriaSelect(selId, includeAll) {
  const cats = DB.get('categoriasDespesa') || [];
  const sel = document.getElementById(selId);
  const atual = sel.value;
  let html = includeAll ? '<option value="">Todas</option>' : '';
  html += cats.map(c => `<option value="${c}">${c}</option>`).join('');
  sel.innerHTML = html;
  if (cats.includes(atual) || (includeAll && atual === '')) sel.value = atual;
}
function populaOrigemSelect(selId, registros, includeAll) {
  const sel = document.getElementById(selId);
  const atual = sel.value;
  const origens = [...new Set(registros.map(r => (r.origem || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let html = includeAll ? '<option value="">Todas</option>' : '';
  html += origens.map(o => `<option value="${o}">${o}</option>`).join('');
  sel.innerHTML = html;
  if (origens.includes(atual) || (includeAll && atual === '')) sel.value = atual;
}
function populaDivisaoSelect(selId) {
  const pessoas = DB.get('pessoas') || [];
  const sel = document.getElementById(selId);
  const atual = sel.value;
  let html = '<option value="">Todas</option><option value="dividida">Dividida</option>';
  html += pessoas.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  sel.innerHTML = html;
  const valores = ['', 'dividida', ...pessoas.map(p => p.id)];
  if (valores.includes(atual)) sel.value = atual;
}
function populaTipoExtraSelect(selId) {
  const tipos = DB.get('tiposExtra') || [];
  document.getElementById(selId).innerHTML = tipos.map(t => `<option value="${t}">${t}</option>`).join('');
}
function populaRefFiltro(selId, registros) {
  const sel = document.getElementById(selId);
  const atual = sel.value;
  const refs = [...new Set(registros.map(r => r.ref))].sort(); // do mais antigo para o mais novo
  sel.innerHTML = '<option value="">Todos os períodos</option>' + refs.map(r => `<option value="${r}">${Fmt.ref(r)}</option>`).join('');
  if (refs.includes(atual)) {
    sel.value = atual;
  } else if (!sel.dataset.inicializado) {
    const hoje = new Date();
    const refAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
    if (refs.includes(refAtual)) sel.value = refAtual;
  }
  sel.dataset.inicializado = '1';
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
/* ============================================
   VALE REFEIÇÃO — saldo acumulado
   O saldo de cada lançamento é o saldo anterior
   da mesma pessoa + recebido - utilizado, em
   ordem cronológica (por data, com fallback na
   referência mês/ano).
============================================ */
function chaveCronologicaVR(r) {
  return r.data ? r.data : (r.ref || '0000-00') + '-01';
}
function calcularSaldosAcumuladosVR(registros) {
  const ordenados = [...registros].sort((a, b) => {
    const ka = chaveCronologicaVR(a), kb = chaveCronologicaVR(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return (a.id || '').localeCompare(b.id || '');
  });
  const acumuladoPorPessoa = {};
  const saldoPorId = {};
  ordenados.forEach(r => {
    const acumulado = (acumuladoPorPessoa[r.pessoaId] || 0) + (r.recebido || 0) - (r.utilizado || 0);
    acumuladoPorPessoa[r.pessoaId] = acumulado;
    saldoPorId[r.id] = acumulado;
  });
  return { saldoPorId, acumuladoPorPessoa };
}

function renderVR() {
  const registros = DB.get('valeRefeicao') || [];
  populaRefFiltro('filtroRefVr', registros);
  populaPessoaSelect('filtroPessoaVr', true);
  const ref = document.getElementById('filtroRefVr').value;
  const pessoaId = document.getElementById('filtroPessoaVr').value;

  const { saldoPorId, acumuladoPorPessoa } = calcularSaldosAcumuladosVR(registros);

  let filtrados = registros.filter(r => (!ref || r.ref === ref) && (!pessoaId || r.pessoaId === pessoaId) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('vr', filtrados, (r, col) => {
    switch (col) {
      case 'pessoa': return pessoaNome(r.pessoaId);
      case 'data': return r.data || '';
      case 'recebido': return r.recebido || 0;
      case 'utilizado': return r.utilizado || 0;
      case 'saldo': return saldoPorId[r.id] ?? 0;
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('vr');
  document.getElementById('vrBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('vrBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => {
    const saldo = saldoPorId[r.id] ?? ((r.recebido || 0) - (r.utilizado || 0));
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
  const saldoAtualGeral = Object.values(acumuladoPorPessoa).reduce((s, v) => s + v, 0);
  document.getElementById('statsVR').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total Recebido</div><div class="stat-value income">${Fmt.brl(totalRecebido)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Total Utilizado</div><div class="stat-value neutral">${Fmt.brl(totalUtilizado)}</div><div class="stat-sub">Consumo no período</div></div>
    <div class="stat-card blue"><div class="stat-label">Saldo Atual</div><div class="stat-value neutral">${Fmt.brl(saldoAtualGeral)}</div><div class="stat-sub">Acumulado de todas as pessoas</div></div>`;
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
   ENTRADAS (valores recebidos de terceiros)
============================================ */
function onEntradaTipoChange() {
  const tipo = document.getElementById('ent_tipo').value;
  const wrap = document.getElementById('ent_parcelas_wrap');
  const label = document.getElementById('ent_parcelas_label');
  const hint = document.getElementById('ent_valor_hint');
  const valorLabel = document.getElementById('ent_valor_label');
  const parcelasInput = document.getElementById('ent_parcelas');
  if (tipo === 'parcelada') {
    wrap.style.display = 'block';
    label.textContent = 'Total de Parcelas';
    parcelasInput.min = 2;
    if (!parcelasInput.value || +parcelasInput.value < 2) parcelasInput.value = 2;
    hint.style.display = 'none';
    valorLabel.textContent = 'Valor (R$)';
  } else if (tipo === 'recorrente') {
    wrap.style.display = 'block';
    label.textContent = 'Gerar quantos meses';
    parcelasInput.min = 1;
    if (!parcelasInput.value || +parcelasInput.value < 1) parcelasInput.value = 12;
    hint.style.display = 'block';
    valorLabel.textContent = 'Valor Previsto (R$)';
  } else {
    wrap.style.display = 'none';
    hint.style.display = 'none';
    valorLabel.textContent = 'Valor (R$)';
  }
}
function abrirModalEntrada(id) {
  populaPessoaSelect('ent_pessoa', false);
  const registros = DB.get('entradas') || [];
  const item = registros.find(r => r.id === id);
  document.getElementById('tituloModalEntrada').textContent = item ? 'Editar Entrada' : 'Nova Entrada';
  document.getElementById('ent_id').value = id || '';
  populaMesAno('ent_mes', 'ent_ano', item ? item.ref : null);
  document.getElementById('ent_descricao').value = item ? item.descricao : '';
  document.getElementById('ent_origem').value = item ? (item.origem || '') : '';
  if (item) document.getElementById('ent_pessoa').value = item.pessoaId || '';
  document.getElementById('ent_valor').value = item ? Fmt.toInput(item.valor) : '';
  document.getElementById('ent_tipo').value = item ? (item.tipo || 'avista') : 'avista';
  document.getElementById('ent_parcelas').value = item ? (item.totalParcelas || 2) : 2;
  document.getElementById('ent_status').value = item ? item.status : 'pendente';
  onEntradaTipoChange();
  // ao editar uma ocorrência já gerada (parcela ou recorrência), não permite mudar tipo/quantidade —
  // só descrição, origem, pessoa, valor daquele mês específico e status
  document.getElementById('ent_tipo').disabled = !!item && (item.tipo === 'parcelada' || item.tipo === 'recorrente');
  if (item) document.getElementById('ent_parcelas_wrap').style.display = 'none';
  abrirModal('modalEntrada');
}
function salvarEntrada() {
  const id = document.getElementById('ent_id').value;
  const descricao = document.getElementById('ent_descricao').value.trim();
  if (!descricao) { toast('Informe a descrição da entrada.', 'error'); return; }
  const pessoaId = document.getElementById('ent_pessoa').value;
  if (!pessoaId) { toast('Selecione quem recebeu.', 'error'); return; }
  const origem = document.getElementById('ent_origem').value.trim();
  const valor = Fmt.parse(document.getElementById('ent_valor').value);
  const tipo = document.getElementById('ent_tipo').value;
  const status = document.getElementById('ent_status').value;
  const refBase = lerRef('ent_mes', 'ent_ano');
  let registros = DB.get('entradas') || [];

  if (id) {
    registros = registros.map(r => r.id === id ? { ...r, descricao, origem, pessoaId, valor, ref: refBase, status } : r);
    DB.set('entradas', registros);
    toast('Entrada atualizada.');
  } else if (tipo === 'parcelada') {
    const totalParcelas = Math.max(2, parseInt(document.getElementById('ent_parcelas').value) || 2);
    const grupoId = Fmt.uid();
    const [anoBase, mesBase] = refBase.split('-').map(Number);
    for (let i = 0; i < totalParcelas; i++) {
      const d = new Date(anoBase, mesBase - 1 + i, 1);
      const ref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      registros.push({
        id: Fmt.uid(), descricao, origem, pessoaId, valor, ref, tipo, status,
        parcelaAtual: i + 1, totalParcelas, grupoId
      });
    }
    DB.set('entradas', registros);
    toast('Entrada parcelada em ' + totalParcelas + 'x criada.');
  } else if (tipo === 'recorrente') {
    const totalMeses = Math.max(1, parseInt(document.getElementById('ent_parcelas').value) || 12);
    const grupoId = Fmt.uid();
    const [anoBase, mesBase] = refBase.split('-').map(Number);
    for (let i = 0; i < totalMeses; i++) {
      const d = new Date(anoBase, mesBase - 1 + i, 1);
      const ref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      registros.push({
        id: Fmt.uid(), descricao, origem, pessoaId, valor, valorPrevisto: valor, ref, tipo, status,
        recorrenteId: grupoId
      });
    }
    DB.set('entradas', registros);
    toast('Entrada recorrente gerada para ' + totalMeses + ' meses. Você pode editar o valor de cada mês individualmente.');
  } else {
    registros.push({ id: Fmt.uid(), descricao, origem, pessoaId, valor, ref: refBase, tipo, status });
    DB.set('entradas', registros);
    toast('Entrada salva.');
  }
  fecharModal('modalEntrada');
  renderEntradas(); renderResumo();
}
function excluirEntrada(id) {
  const registros = DB.get('entradas') || [];
  const item = registros.find(r => r.id === id);
  if (item && possuiOcorrenciasFuturas(item, registros)) { abrirModalExcluirParcela(id, 'entradas'); return; }
  if (!confirm('Excluir esta entrada?')) return;
  DB.set('entradas', registros.filter(r => r.id !== id));
  renderEntradas(); renderResumo();
  toast('Entrada excluída.');
}
function alternarStatusEntrada(id) {
  const registros = (DB.get('entradas') || []).map(r => r.id === id ? { ...r, status: r.status === 'recebido' ? 'pendente' : 'recebido' } : r);
  DB.set('entradas', registros);
  renderEntradas(); renderResumo();
}
function renderEntradas() {
  const registros = DB.get('entradas') || [];
  populaRefFiltro('filtroRefEnt', registros);
  populaPessoaSelect('filtroPessoaEnt', true);
  populaOrigemSelect('filtroOrigemEnt', registros, true);
  const ref = document.getElementById('filtroRefEnt').value;
  const pessoaId = document.getElementById('filtroPessoaEnt').value;
  const status = document.getElementById('filtroStatusEnt').value;
  const origemFiltro = document.getElementById('filtroOrigemEnt').value;
  let filtrados = registros.filter(r => (!ref || r.ref === ref) && (!pessoaId || r.pessoaId === pessoaId) && (!status || r.status === status) && (!origemFiltro || r.origem === origemFiltro) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('entradas', filtrados, (r, col) => {
    switch (col) {
      case 'descricao': return r.descricao || '';
      case 'origem': return r.origem || '';
      case 'pessoa': return pessoaNome(r.pessoaId);
      case 'valor': return r.valor || 0;
      case 'status': return r.status || '';
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('entradas');
  document.getElementById('entBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('entBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => `<tr>
      <td>${r.descricao}</td><td>${r.origem || '—'}</td><td>${pessoaTag(r.pessoaId)}</td><td>${Fmt.ref(r.ref)}</td>
      <td>${r.tipo === 'parcelada' ? r.parcelaAtual + '/' + r.totalParcelas : (r.tipo === 'recorrente' ? '🔁 Recorrente' : 'À vista')}</td>
      <td style="color:var(--income,#3ddc84);font-weight:600;">${Fmt.brl(r.valor)}</td>
      <td><span class="pill ${r.status === 'recebido' ? 'ok' : 'pend'}" style="cursor:pointer;" onclick="alternarStatusEntrada('${r.id}')">${r.status === 'recebido' ? 'Recebido' : 'Pendente'}</span></td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalEntrada('${r.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirEntrada('${r.id}')" title="Excluir">🗑</button></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="8">Nenhuma entrada encontrada.</td></tr>';

  const total = filtrados.reduce((s, r) => s + (r.valor || 0), 0);
  const totalRecebido = filtrados.filter(r => r.status === 'recebido').reduce((s, r) => s + (r.valor || 0), 0);
  document.getElementById('statsEntradas').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total de Entradas</div><div class="stat-value income">${Fmt.brl(total)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card blue"><div class="stat-label">Já Recebido</div><div class="stat-value income">${Fmt.brl(totalRecebido)}</div><div class="stat-sub">Confirmado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Pendente</div><div class="stat-value neutral">${Fmt.brl(total - totalRecebido)}</div><div class="stat-sub">A receber no período</div></div>`;
}

/* ============================================
   DESPESAS
============================================ */
function onDespesaTipoChange() {
  const tipo = document.getElementById('desp_tipo').value;
  const wrap = document.getElementById('desp_parcelas_wrap');
  const label = document.getElementById('desp_parcelas_label');
  const hint = document.getElementById('desp_valor_hint');
  const valorLabel = document.getElementById('desp_valor_label');
  const parcelasInput = document.getElementById('desp_parcelas');
  if (tipo === 'parcelada') {
    wrap.style.display = 'block';
    label.textContent = 'Total de Parcelas';
    parcelasInput.min = 2;
    if (!parcelasInput.value || +parcelasInput.value < 2) parcelasInput.value = 2;
    hint.style.display = 'none';
    valorLabel.textContent = 'Valor (R$)';
  } else if (tipo === 'recorrente') {
    wrap.style.display = 'block';
    label.textContent = 'Gerar quantos meses';
    parcelasInput.min = 1;
    if (!parcelasInput.value || +parcelasInput.value < 1) parcelasInput.value = 12;
    hint.style.display = 'block';
    valorLabel.textContent = 'Valor Previsto (R$)';
  } else {
    wrap.style.display = 'none';
    hint.style.display = 'none';
    valorLabel.textContent = 'Valor (R$)';
  }
}
function onDivisaoChange() {
  const divisao = document.getElementById('desp_divisao').value;
  document.getElementById('desp_pessoa_wrap').style.display = divisao === 'individual' ? 'block' : 'none';
  atualizarHintDivisao();
}
function atualizarHintDivisao() {
  const divisao = document.getElementById('desp_divisao').value;
  const hint = document.getElementById('desp_divisao_hint');
  const hintText = document.getElementById('desp_divisao_hint_text');
  if (divisao === 'dividida') {
    const pessoas = DB.get('pessoas') || [];
    const n = Math.max(1, pessoas.length);
    const valor = Fmt.parse(document.getElementById('desp_valor').value);
    hintText.textContent = 'Cada pessoa fica com ' + Fmt.brl(valor / n) + ' (dividido entre ' + n + (n === 1 ? ' pessoa' : ' pessoas') + ').';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}
function abrirModalDespesa(id) {
  populaCategoriaSelect('desp_categoria', false);
  populaPessoaSelect('desp_pessoa', false);
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
  document.getElementById('desp_divisao').value = item ? (item.divisao || 'individual') : 'individual';
  if (item && item.divisao === 'individual') document.getElementById('desp_pessoa').value = item.pessoaId || '';
  document.getElementById('desp_status').value = item ? item.status : 'pendente';
  onDespesaTipoChange();
  onDivisaoChange();
  // ao editar uma ocorrência já gerada (parcela ou recorrência), não permite mudar tipo/quantidade —
  // só descrição, categoria, valor daquele mês específico, divisão e status
  document.getElementById('desp_tipo').disabled = !!item && (item.tipo === 'parcelada' || item.tipo === 'recorrente');
  if (item) document.getElementById('desp_parcelas_wrap').style.display = 'none';
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
  const divisao = document.getElementById('desp_divisao').value;
  const pessoaId = divisao === 'individual' ? document.getElementById('desp_pessoa').value : null;
  if (divisao === 'individual' && !pessoaId) { toast('Selecione quem comprou.', 'error'); return; }
  const refBase = lerRef('desp_mes', 'desp_ano');
  let registros = DB.get('despesas') || [];

  if (id) {
    registros = registros.map(r => r.id === id ? { ...r, descricao, categoria, valor, ref: refBase, status, divisao, pessoaId } : r);
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
        id: Fmt.uid(), descricao, categoria, valor, ref, tipo, status, divisao, pessoaId,
        parcelaAtual: i + 1, totalParcelas, grupoId
      });
    }
    DB.set('despesas', registros);
    toast('Despesa parcelada em ' + totalParcelas + 'x criada.');
  } else if (tipo === 'recorrente') {
    const totalMeses = Math.max(1, parseInt(document.getElementById('desp_parcelas').value) || 12);
    const grupoId = Fmt.uid();
    const [anoBase, mesBase] = refBase.split('-').map(Number);
    for (let i = 0; i < totalMeses; i++) {
      const d = new Date(anoBase, mesBase - 1 + i, 1);
      const ref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      registros.push({
        id: Fmt.uid(), descricao, categoria, valor, valorPrevisto: valor, ref, tipo, status, divisao, pessoaId,
        recorrenteId: grupoId
      });
    }
    DB.set('despesas', registros);
    toast('Despesa recorrente gerada para ' + totalMeses + ' meses. Você pode editar o valor de cada mês individualmente.');
  } else {
    registros.push({ id: Fmt.uid(), descricao, categoria, valor, ref: refBase, tipo, status, divisao, pessoaId });
    DB.set('despesas', registros);
    toast('Despesa salva.');
  }
  fecharModal('modalDespesa');
  renderDespesas(); renderResumo(); renderInvestimentos();
}
function possuiOcorrenciasFuturas(item, registros) {
  if (item.tipo === 'parcelada' && item.grupoId) {
    return registros.some(r => r.grupoId === item.grupoId && r.ref > item.ref);
  }
  if (item.tipo === 'recorrente' && item.recorrenteId) {
    return registros.some(r => r.recorrenteId === item.recorrenteId && r.ref > item.ref);
  }
  return false;
}
function excluirDespesa(id) {
  const registros = DB.get('despesas') || [];
  const item = registros.find(r => r.id === id);
  if (item && possuiOcorrenciasFuturas(item, registros)) { abrirModalExcluirParcela(id, 'despesas'); return; }
  if (!confirm('Excluir esta despesa?')) return;
  DB.set('despesas', registros.filter(r => r.id !== id));
  renderDespesas(); renderResumo(); renderInvestimentos();
  toast('Despesa excluída.');
}
function abrirModalExcluirParcela(id, tabela) {
  document.getElementById('excl_parcela_id').value = id;
  document.getElementById('excl_parcela_tabela').value = tabela;
  const registros = DB.get(tabela) || [];
  const item = registros.find(r => r.id === id);
  const ehParcelada = !!item && item.tipo === 'parcelada';
  document.getElementById('excl_opcao_recalcular_wrap').style.display = ehParcelada ? 'flex' : 'none';
  document.getElementById('excl_parcela_texto').textContent = ehParcelada
    ? 'Este lançamento faz parte de uma compra parcelada e existem parcelas futuras. O que deseja fazer?'
    : 'Este lançamento é recorrente e existem meses futuros já gerados. O que deseja fazer?';
  document.getElementById('excl_opcao_somente_texto').textContent = ehParcelada ? 'Excluir somente esta parcela' : 'Excluir somente este mês';
  document.getElementById('excl_opcao_subsequentes_texto').textContent = ehParcelada ? 'Excluir esta e todas as parcelas futuras' : 'Excluir este e todos os meses futuros';
  document.getElementById('tituloModalExcluirParcela').textContent = ehParcelada ? 'Excluir Parcela' : 'Excluir Recorrência';
  const radio = document.querySelector('input[name="exclParcelaOpcao"][value="somente"]');
  if (radio) radio.checked = true;
  abrirModal('modalExcluirParcela');
}
function confirmarExclusaoParcela() {
  const id = document.getElementById('excl_parcela_id').value;
  const tabela = document.getElementById('excl_parcela_tabela').value || 'despesas';
  const opcaoEl = document.querySelector('input[name="exclParcelaOpcao"]:checked');
  const opcao = opcaoEl ? opcaoEl.value : 'somente';
  let registros = DB.get(tabela) || [];
  const item = registros.find(r => r.id === id);
  if (!item) { fecharModal('modalExcluirParcela'); return; }
  const grupoField = item.tipo === 'recorrente' ? 'recorrenteId' : 'grupoId';
  const grupoValor = item[grupoField];

  if (opcao === 'subsequentes') {
    registros = registros.filter(r => !(r[grupoField] === grupoValor && r.ref >= item.ref));
  } else if (opcao === 'recalcular' && item.tipo === 'parcelada') {
    const parcelaExcluida = item.parcelaAtual;
    registros = registros
      .filter(r => r.id !== id)
      .map(r => r.grupoId === grupoValor
        ? { ...r, parcelaAtual: r.parcelaAtual > parcelaExcluida ? r.parcelaAtual - 1 : r.parcelaAtual, totalParcelas: r.totalParcelas - 1 }
        : r);
  } else {
    registros = registros.filter(r => r.id !== id);
  }
  DB.set(tabela, registros);
  fecharModal('modalExcluirParcela');
  if (tabela === 'entradas') { renderEntradas(); renderResumo(); }
  else { renderDespesas(); renderResumo(); renderInvestimentos(); }
  toast(tabela === 'entradas' ? 'Entrada excluída.' : 'Despesa excluída.');
}
function alternarStatusDespesa(id) {
  const registros = (DB.get('despesas') || []).map(r => r.id === id ? { ...r, status: r.status === 'pago' ? 'pendente' : 'pago' } : r);
  DB.set('despesas', registros);
  renderDespesas(); renderResumo(); renderInvestimentos();
}
function divisaoLabel(r) {
  if (r.divisao === 'dividida') {
    const pessoas = DB.get('pessoas') || [];
    const n = Math.max(1, pessoas.length);
    return 'Dividida (' + Fmt.brl((r.valor || 0) / n) + '/pessoa)';
  }
  if (r.pessoaId) return pessoaTag(r.pessoaId);
  return '—';
}
function renderDespesas() {
  const registros = DB.get('despesas') || [];
  populaRefFiltro('filtroRefDesp', registros);
  populaCategoriaSelect('filtroCatDesp', true);
  populaDivisaoSelect('filtroDivisaoDesp');
  const ref = document.getElementById('filtroRefDesp').value;
  const status = document.getElementById('filtroStatusDesp').value;
  const categoria = document.getElementById('filtroCatDesp').value;
  const divisao = document.getElementById('filtroDivisaoDesp').value;
  const descricaoBusca = normalizarTexto(document.getElementById('filtroDescDesp').value);
  let filtrados = registros.filter(r =>
    (!ref || r.ref === ref) &&
    (!status || r.status === status) &&
    (!categoria || r.categoria === categoria) &&
    (!divisao || (divisao === 'dividida' ? r.divisao === 'dividida' : (r.divisao === 'individual' && r.pessoaId === divisao))) &&
    (!descricaoBusca || normalizarTexto(r.descricao).includes(descricaoBusca)) &&
    dentroDoPeriodo(r.ref));
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
      <td>${r.tipo === 'parcelada' ? r.parcelaAtual + '/' + r.totalParcelas : (r.tipo === 'recorrente' ? '🔁 Recorrente' : 'À vista')}</td>
      <td>${divisaoLabel(r)}</td>
      <td>${Fmt.brl(r.valor)}</td>
      <td><span class="pill ${r.status === 'pago' ? 'ok' : 'pend'}" style="cursor:pointer;" onclick="alternarStatusDespesa('${r.id}')">${r.status === 'pago' ? 'Pago' : 'Pendente'}</span></td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalDespesa('${r.id}')" title="Editar">✎</button><button class="icon-btn del" onclick="excluirDespesa('${r.id}')" title="Excluir">🗑</button></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="8">Nenhuma despesa encontrada.</td></tr>';

  const totalGeral = filtrados.reduce((s, r) => s + (r.valor || 0), 0);
  const totalPago = filtrados.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor || 0), 0);
  const totalPendente = totalGeral - totalPago;
  let statsHtml = `
    <div class="stat-card danger"><div class="stat-label">Total de Despesas</div><div class="stat-value expense">${Fmt.brl(totalGeral)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card green"><div class="stat-label">Já Pago</div><div class="stat-value income">${Fmt.brl(totalPago)}</div><div class="stat-sub">Quitado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Pendente</div><div class="stat-value neutral">${Fmt.brl(totalPendente)}</div><div class="stat-sub">A pagar no período</div></div>`;

  const pessoasCasal = DB.get('pessoas') || [];
  const n = Math.max(1, pessoasCasal.length);
  const totalDividido = filtrados.filter(r => r.divisao === 'dividida').reduce((s, r) => s + (r.valor || 0), 0);
  const parteDividida = totalDividido / n;
  statsHtml += pessoasCasal.map(p => {
    const totalIndividual = filtrados.filter(r => r.divisao === 'individual' && r.pessoaId === p.id).reduce((s, r) => s + (r.valor || 0), 0);
    const totalPessoa = totalIndividual + parteDividida;
    return `
    <div class="stat-card blue"><div class="stat-label">Soma de Divisão ${p.nome}</div><div class="stat-value neutral">${Fmt.brl(totalPessoa)}</div><div class="stat-sub">Individual + parte das divididas</div></div>`;
  }).join('');

  document.getElementById('statsDespesas').innerHTML = statsHtml;
}

function marcarCartaoComoPago() {
  const ref = document.getElementById('filtroRefDesp').value;
  if (!ref) { toast('Selecione um Mês/Ano específico no filtro para marcar o cartão daquele mês como pago.', 'error'); return; }
  const registros = DB.get('despesas') || [];
  const alvo = registros.filter(r => r.ref === ref && ehCartaoCredito(r.categoria) && r.status !== 'pago');
  if (!alvo.length) { toast('Nenhuma despesa pendente de Cartão de Crédito encontrada para ' + Fmt.ref(ref) + '.', 'error'); return; }
  if (!confirm('Marcar ' + alvo.length + ' despesa(s) de Cartão de Crédito de ' + Fmt.ref(ref) + ' como pagas?')) return;
  const atualizados = registros.map(r => (r.ref === ref && ehCartaoCredito(r.categoria) && r.status !== 'pago') ? { ...r, status: 'pago' } : r);
  DB.set('despesas', atualizados);
  renderDespesas(); renderResumo(); renderInvestimentos();
  toast(alvo.length + ' despesa(s) de Cartão de Crédito marcada(s) como pagas.');
}

/* ============================================
   INVESTIMENTOS (despesas de categoria Reserva / Reserva de Emergência)
============================================ */
function renderInvestimentos() {
  const despesas = DB.get('despesas') || [];
  const registros = despesas.filter(r => ehInvestimento(r.categoria));
  populaRefFiltro('filtroRefInv', registros);
  const ref = document.getElementById('filtroRefInv').value;
  let filtrados = registros.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  filtrados = aplicarOrdenacao('investimentos', filtrados, (r, col) => {
    switch (col) {
      case 'descricao': return r.descricao || '';
      case 'valor': return r.valor || 0;
      case 'status': return r.status || '';
      default: return r.ref || '';
    }
  });
  atualizarIconesOrdenacao('investimentos');
  document.getElementById('invBadge').textContent = filtrados.length + ' registro' + (filtrados.length === 1 ? '' : 's');
  const body = document.getElementById('invBody');
  body.innerHTML = filtrados.length ? filtrados.map(r => `<tr>
      <td>${r.descricao}</td><td>${r.categoria}</td><td>${Fmt.ref(r.ref)}</td>
      <td style="font-weight:600;">${Fmt.brl(r.valor)}</td>
      <td><span class="pill ${r.status === 'pago' ? 'ok' : 'pend'}">${r.status === 'pago' ? 'Realizado' : 'Pendente'}</span></td>
      <td class="row-actions"><button class="icon-btn" onclick="abrirModalDespesa('${r.id}')" title="Editar">✎</button></td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="6">Nenhum investimento encontrado.</td></tr>';

  const total = filtrados.reduce((s, r) => s + (r.valor || 0), 0);
  const totalRealizado = filtrados.filter(r => r.status === 'pago').reduce((s, r) => s + (r.valor || 0), 0);
  document.getElementById('statsInvestimentos').innerHTML = `
    <div class="stat-card blue"><div class="stat-label">Total Investido</div><div class="stat-value income">${Fmt.brl(total)}</div><div class="stat-sub">Somado no período</div></div>
    <div class="stat-card green"><div class="stat-label">Já Realizado</div><div class="stat-value income">${Fmt.brl(totalRealizado)}</div><div class="stat-sub">Confirmado no período</div></div>
    <div class="stat-card warn"><div class="stat-label">Lançamentos</div><div class="stat-value neutral">${filtrados.length}</div><div class="stat-sub">Registros no filtro atual</div></div>`;
}

function renovarRecorrentes(tabela) {
  // Para cada lançamento recorrente (despesa ou entrada), garante que sempre
  // existam pelo menos 12 meses gerados à frente do mês atual, usando o
  // último registro do grupo como modelo para os novos.
  tabela = tabela || 'despesas';
  const registros = DB.get(tabela) || [];
  const ultimaPorGrupo = {};
  registros.forEach(r => {
    if (r.tipo === 'recorrente' && r.recorrenteId) {
      if (!ultimaPorGrupo[r.recorrenteId] || r.ref > ultimaPorGrupo[r.recorrenteId].ref) {
        ultimaPorGrupo[r.recorrenteId] = r;
      }
    }
  });
  const hoje = new Date();
  const MESES_A_FRENTE = 12;
  const limiteAlvo = new Date(hoje.getFullYear(), hoje.getMonth() + MESES_A_FRENTE, 1);
  let novos = [];
  Object.values(ultimaPorGrupo).forEach(ultimo => {
    const [anoU, mesU] = ultimo.ref.split('-').map(Number);
    let i = 1;
    let d = new Date(anoU, mesU - 1 + i, 1);
    while (d < limiteAlvo) {
      const ref = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      novos.push({
        ...ultimo,
        id: Fmt.uid(),
        ref,
        valor: ultimo.valorPrevisto ?? ultimo.valor,
        valorPrevisto: ultimo.valorPrevisto ?? ultimo.valor,
        status: 'pendente'
      });
      i++;
      d = new Date(anoU, mesU - 1 + i, 1);
    }
  });
  if (novos.length) {
    DB.set(tabela, [...registros, ...novos]);
    if (tabela === 'entradas') { renderEntradas(); renderResumo(); }
    else { renderDespesas(); renderResumo(); renderInvestimentos(); }
    toast(novos.length + ' mês(es) gerado(s) para ' + (tabela === 'entradas' ? 'entradas' : 'despesas') + ' recorrentes.');
  } else {
    toast('Nenhuma ' + (tabela === 'entradas' ? 'entrada' : 'despesa') + ' recorrente precisa de renovação agora.');
  }
}

/* ============================================
   RESUMO CONSOLIDADO
============================================ */
function renderResumo() {
  const salarios = DB.get('salarios') || [];
  const vr = DB.get('valeRefeicao') || [];
  const extras = DB.get('extras') || [];
  const entradasTerceiros = DB.get('entradas') || [];
  const despesas = DB.get('despesas') || [];
  const pessoas = DB.get('pessoas') || [];

  const todasRefs = [...new Set([...salarios, ...vr, ...extras, ...entradasTerceiros, ...despesas].map(r => r.ref))];
  populaRefFiltro('filtroRefResumo', todasRefs.map(ref => ({ ref })));
  const ref = document.getElementById('filtroRefResumo').value;

  const fS = salarios.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fV = vr.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fE = extras.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fEnt = entradasTerceiros.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));
  const fD = despesas.filter(r => (!ref || r.ref === ref) && dentroDoPeriodo(r.ref));

  const totalSal = fS.reduce((s, r) => s + (r.adiantamento || 0) + (r.pagamento || 0), 0);
  const totalVr = fV.reduce((s, r) => s + (r.recebido || 0), 0);
  const totalExt = fE.reduce((s, r) => s + (r.liquido || 0), 0);
  const totalEnt = fEnt.reduce((s, r) => s + (r.valor || 0), 0);
  const totalEntradas = totalSal + totalVr + totalExt + totalEnt;
  const totalDespesas = fD.reduce((s, r) => s + (r.valor || 0), 0);
  const saldo = totalEntradas - totalDespesas;

  document.getElementById('statsResumoGeral').innerHTML = `
    <div class="stat-card green"><div class="stat-label">Total de Entradas</div><div class="stat-value income">${Fmt.brl(totalEntradas)}</div><div class="stat-sub">Salários + VR + Extras + Entradas</div></div>
    <div class="stat-card danger"><div class="stat-label">Total de Despesas</div><div class="stat-value expense">${Fmt.brl(totalDespesas)}</div><div class="stat-sub">Todas as despesas do período</div></div>
    <div class="stat-card blue"><div class="stat-label">Saldo do Casal</div><div class="stat-value ${saldo >= 0 ? 'income' : 'expense'}">${Fmt.brl(saldo)}</div><div class="stat-sub">Entradas − Despesas</div></div>`;

  const bodyPessoa = document.getElementById('resumoPessoaBody');
  bodyPessoa.innerHTML = pessoas.map(p => {
    const s = fS.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.adiantamento || 0) + (r.pagamento || 0), 0);
    const v = fV.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.recebido || 0), 0);
    const e = fE.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.liquido || 0), 0);
    const en = fEnt.filter(r => r.pessoaId === p.id).reduce((s, r) => s + (r.valor || 0), 0);
    return `<tr><td>${pessoaTag(p.id)}</td><td>${Fmt.brl(s)}</td><td>${Fmt.brl(v)}</td><td>${Fmt.brl(e)}</td><td>${Fmt.brl(en)}</td><td style="font-weight:700;color:${corMonetaria(s + v + e + en)};">${Fmt.brl(s + v + e + en)}</td></tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="6">Nenhuma pessoa cadastrada.</td></tr>';

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
  renderEntradas();
  renderDespesas();
  renderInvestimentos();
  renderResumo();
  renderConfiguracao();
}
RENDER_POR_TABELA.salarios = renderSalarios;
RENDER_POR_TABELA.vr = renderVR;
RENDER_POR_TABELA.extras = renderExtras;
RENDER_POR_TABELA.entradas = renderEntradas;
RENDER_POR_TABELA.despesas = renderDespesas;
RENDER_POR_TABELA.investimentos = renderInvestimentos;

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
  tentarRestaurarSessao();

  DB.listenAll(() => {
    if (document.getElementById('appWrapper').classList.contains('hidden')) return;
    renderAll();
  });
});
