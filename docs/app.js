/* ═══════════════════════════════════════════════════════════════
   CONTROLE DE IMPLANTAÇÃO — app.js
   Toda lógica frontend: API, tabela, filtros, modais, toasts, abas
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO GLOBAL ─────────────────────────────────────────────
let allRecords      = [];
let filteredRecords = [];
let sortState       = { col: null, dir: 'asc' };
let editingId       = null;
let deletingId      = null;
let currentTipo     = 'escalada';
let abaAtiva        = 'implantacoes';

// Responsáveis técnicos
let listaResponsaveis = [];
let editingRespId     = null;
let deletingRespId    = null;

// ID pendente para inauguração (vindo do dropdown de status)
let inaugurandoId   = null;

// ─── PORTAL DROPDOWN (status) ───────────────────────────────────
let portalDD       = null;
let portalTargetId = null;

function criarPortalDropdown() {
  if (portalDD) return;
  portalDD = document.createElement('div');
  portalDD.className = 'status-dropdown-portal';
  portalDD.style.display = 'none';
  portalDD.innerHTML = `
    <button class="status-dropdown-item" data-status="parado">
      <span class="dot dot-parado"></span> 🔴 Parado
    </button>
    <button class="status-dropdown-item" data-status="em_andamento">
      <span class="dot dot-andamento"></span> 🟡 Em Andamento
    </button>
    <button class="status-dropdown-item" data-status="inaugurado">
      <span class="dot dot-inaugurado"></span> 🟢 Inaugurado
    </button>
  `;
  document.body.appendChild(portalDD);

  portalDD.querySelectorAll('.status-dropdown-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (portalTargetId !== null) {
        const novoStatus = btn.dataset.status;
        const idAlvo = portalTargetId; // salva antes de fechar (fechar zera portalTargetId)
        if (novoStatus === 'inaugurado') {
          // Abre o modal de inauguração em vez de mudar direto
          fecharPortalDropdown();
          abrirModalInauguracao(idAlvo);
        } else {
          mudarStatus(idAlvo, novoStatus);
          fecharPortalDropdown();
        }
      }
    });
  });
}

function abrirPortalDropdown(e, id) {
  e.stopPropagation();
  criarPortalDropdown();

  // Toggle: se já está aberto para o mesmo botão, fecha
  if (portalTargetId === id) {
    fecharPortalDropdown();
    return;
  }

  portalTargetId = id;

  const rect     = e.currentTarget.getBoundingClientRect();
  const ddWidth  = 180;
  const ddHeight = 122;

  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= ddHeight + 8
    ? rect.bottom + 6
    : rect.top - ddHeight - 6;

  let left = rect.left;
  if (left + ddWidth > window.innerWidth - 8) {
    left = window.innerWidth - ddWidth - 8;
  }

  portalDD.style.top     = top  + 'px';
  portalDD.style.left    = left + 'px';
  portalDD.style.display = 'block';
}

function fecharPortalDropdown() {
  if (portalDD) portalDD.style.display = 'none';
  portalTargetId = null;
}

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  iniciarRelogio();
  carregarResponsaveis();
  carregarDados();

  // Carrega nome do usuário logado
  fetch('/api/auth/check')
    .then(r => r.json())
    .then(d => {
      if (!d.loggedIn) { location.replace('/login.html'); return; }
      const el = document.getElementById('header-username');
      if (el && d.usuario) el.textContent = d.usuario;
    });

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.status-dropdown-portal') &&
        !e.target.closest('.status-btn')) {
      fecharPortalDropdown();
    }
    // Fecha menus de exportação ao clicar fora
    if (!e.target.closest('.export-dropdown-wrap')) {
      document.querySelectorAll('.export-menu.open').forEach(m => m.classList.remove('open'));
    }
  });
});

// ─── LOGOUT ────────────────────────────────────────────────
async function fazerLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.replace('/login.html');
}

// ─── RELÓGIO ────────────────────────────────────────────────────
function iniciarRelogio() {
  const el = document.getElementById('header-time');
  const atualizar = () => {
    const agora = new Date();
    el.textContent = agora.toLocaleString('pt-BR', {
      weekday: 'short', day: '2-digit', month: '2-digit',
      year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };
  atualizar();
  setInterval(atualizar, 1000);
}

// ─── ABAS ────────────────────────────────────────────────────────
function mudarAba(aba) {
  abaAtiva = aba;

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.getElementById(`tab-btn-${aba}`).classList.add('active');
  document.getElementById(`aba-${aba}`).classList.add('active');

  if (aba === 'suporte') {
    carregarSuporte();
  }
  if (aba === 'responsaveis') {
    carregarResponsaveis();
  }
}

// ─── API ─────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
  if (res.status === 401) {
    location.replace('/login.html');
    throw new Error('Sessão expirada.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
}

// ─── CARREGAR DADOS ──────────────────────────────────────────────
async function carregarDados() {
  try {
    allRecords = await api('GET', '/api/implantacoes');
    aplicarFiltros();
    atualizarCards();
  } catch (e) {
    showToast('Erro ao carregar dados: ' + e.message, 'error');
  }
}

// ─── CARDS DE RESUMO ─────────────────────────────────────────────
function atualizarCards() {
  const total = allRecords.length;
  const agora = new Date();

  const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const estesMes = allRecords.filter(r => r.data_inauguracao && r.data_inauguracao.startsWith(anoMes)).length;

  const hoje      = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
  const segunda   = new Date(hoje); segunda.setDate(hoje.getDate() - diaSemana);
  const domingo   = new Date(segunda); domingo.setDate(segunda.getDate() + 6);
  const isoSeg    = segunda.toISOString().slice(0, 10);
  const isoDom    = domingo.toISOString().slice(0, 10);
  const essaSemana = allRecords.filter(r => r.data_inauguracao >= isoSeg && r.data_inauguracao <= isoDom).length;

  const emAndamento = allRecords.filter(r => r.status === 'em_andamento').length;
  const inaugurados = allRecords.filter(r => r.status === 'inaugurado').length;
  const parados     = allRecords.filter(r => r.status === 'parado').length;

  animarNumero('val-total',       total);
  animarNumero('val-mes',         estesMes);
  animarNumero('val-semana',      essaSemana);
  animarNumero('val-andamento',   emAndamento);
  animarNumero('val-inaugurados', inaugurados);
  animarNumero('val-parados',     parados);
}

function animarNumero(id, target) {
  const el     = document.getElementById(id);
  const start  = parseInt(el.textContent) || 0;
  const duracao = 500;
  const inicio = performance.now();
  const frame  = (agora) => {
    const prog = Math.min((agora - inicio) / duracao, 1);
    const ease = 1 - Math.pow(1 - prog, 3);
    el.textContent = Math.round(start + (target - start) * ease);
    if (prog < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ─── FILTROS ─────────────────────────────────────────────────────
function aplicarFiltros() {
  const fDataDe  = document.getElementById('f-data-de').value;
  const fDataAte = document.getElementById('f-data-ate').value;
  const fCliente = document.getElementById('f-cliente').value.toLowerCase().trim();
  const fLoja    = document.getElementById('f-loja').value.toLowerCase().trim();
  const fTipo    = document.getElementById('f-tipo').value;
  const fResp    = document.getElementById('f-responsavel').value.toLowerCase().trim();
  const fStatus  = document.getElementById('f-status').value;

  filteredRecords = allRecords.filter(r => {
    if (fDataDe  && r.data_inauguracao < fDataDe)  return false;
    if (fDataAte && r.data_inauguracao > fDataAte) return false;
    if (fCliente) {
      const campos = [r.nome_cliente, r.nome_cliente_antigo, r.nome_cliente_novo]
        .filter(Boolean).join(' ').toLowerCase();
      if (!campos.includes(fCliente)) return false;
    }
    if (fLoja   && !(r.nome_loja           || '').toLowerCase().includes(fLoja))   return false;
    if (fTipo   && r.tipo !== fTipo)                                                 return false;
    if (fResp   && !(r.responsavel_tecnico || '').toLowerCase().includes(fResp))   return false;
    if (fStatus && r.status !== fStatus)                                             return false;
    
    // Clientes inaugurados há mais de 15 dias não devem aparecer na tela de Implantações
    if (r.status === 'inaugurado' && (r.data_inauguracao_real || r.data_inauguracao)) {
      const dias = diasDesde(r.data_inauguracao_real || r.data_inauguracao);
      if (dias >= 15) return false;
    }
    
    return true;
  });

  aplicarOrdenacao();
  renderizarTabela();
  atualizarContador();
}

function limparFiltros() {
  ['f-data-de', 'f-data-ate', 'f-cliente', 'f-loja', 'f-responsavel'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['f-tipo', 'f-status'].forEach(id => {
    document.getElementById(id).value = '';
  });
  aplicarFiltros();
}

// ─── FILTRAR SEMANA (ao clicar no card) ──────────────────────────
function filtrarSemana() {
  // Garante que estamos na aba de implantações
  if (abaAtiva !== 'implantacoes') {
    mudarAba('implantacoes');
  }

  const hoje      = new Date();
  const hojeSem   = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const diaSemana = hojeSem.getDay() === 0 ? 6 : hojeSem.getDay() - 1;
  const segunda   = new Date(hojeSem);
  segunda.setDate(hojeSem.getDate() - diaSemana);
  const domingo   = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);

  const isoSeg = segunda.toISOString().slice(0, 10);
  const isoDom = domingo.toISOString().slice(0, 10);

  // Limpa outros filtros
  ['f-cliente', 'f-loja', 'f-responsavel'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['f-tipo', 'f-status'].forEach(id => {
    document.getElementById(id).value = '';
  });

  // Seta o filtro de período da semana
  document.getElementById('f-data-de').value  = isoSeg;
  document.getElementById('f-data-ate').value = isoDom;

  aplicarFiltros();
  showToast(`📅 Filtrando inaugurações da semana (${formatarData(isoSeg)} a ${formatarData(isoDom)})`, 'info');

  // Scroll suave até os filtros
  document.querySelector('.filters-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limparFiltrosSuporte() {
  document.getElementById('s-cliente').value = '';
  document.getElementById('s-loja').value    = '';
  carregarSuporte();
}

// ─── ORDENAÇÃO ────────────────────────────────────────────────────
function sortBy(col) {
  if (sortState.col === col) {
    sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sortState.col = col;
    sortState.dir = 'asc';
  }

  document.querySelectorAll('.main-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === col) {
      th.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });

  aplicarOrdenacao();
  renderizarTabela();
}

function aplicarOrdenacao() {
  if (!sortState.col) return;
  const { col, dir } = sortState;

  filteredRecords.sort((a, b) => {
    let va, vb;
    if (col === 'cliente') {
      va = clienteDisplay(a).toLowerCase();
      vb = clienteDisplay(b).toLowerCase();
    } else {
      va = (a[col] || '').toString().toLowerCase();
      vb = (b[col] || '').toString().toLowerCase();
    }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ─── RENDERIZAR TABELA ────────────────────────────────────────────
function renderizarTabela() {
  const tbody = document.getElementById('table-body');
  tbody.innerHTML = '';

  if (filteredRecords.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="9">
          <div class="empty-state">
            <i data-lucide="search-x" class="empty-icon"></i>
            <p>Nenhum registro encontrado</p>
          </div>
        </td>
      </tr>`;
    lucide.createIcons();
    return;
  }

  filteredRecords.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    const obs = r.observacao || '';
    const obsShort = obs.length > 55 ? obs.slice(0, 55) + '…' : obs;
    tr.innerHTML = `
      <td data-label="Tipo">${badgeTipo(r.tipo)}</td>
      <td data-label="Cliente">${escHtml(clienteDisplay(r))}</td>
      <td data-label="Loja">${escHtml(r.nome_loja || '—')}</td>
      <td data-label="Inauguração" style="white-space:nowrap">${formatarData(r.data_inauguracao)}</td>
      <td data-label="Responsável">${escHtml(r.responsavel_tecnico || '—')}</td>
      <td data-label="Status">${renderStatusBtn(r)}</td>
      <td data-label="Telefone" class="tel-cell">${r.telefone ? escHtml(r.telefone) : '<span style="opacity:.35">—</span>'}</td>
      <td data-label="Observação" class="obs-cell" title="${escHtml(obs)}">${obsShort ? escHtml(obsShort) : '<span style="opacity:.25">—</span>'}</td>
      <td data-label="Ações">
        <div class="acoes-wrap">
          <button class="btn-icon" title="Treinamentos" onclick="abrirModalTreinamentos(${r.id})">
            <i data-lucide="graduation-cap"></i>
          </button>
          <button class="btn-icon" title="Editar" onclick="abrirModalEdicao(${r.id})">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon danger" title="Excluir" onclick="abrirModalExcluir(${r.id})">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

function atualizarContador() {
  const el = document.getElementById('table-counter');
  const n  = filteredRecords.length;
  el.innerHTML = `<span>${n}</span> registro${n !== 1 ? 's' : ''} encontrado${n !== 1 ? 's' : ''}`;
}

// ─── HELPERS DE DISPLAY ───────────────────────────────────────────
function clienteDisplay(r) {
  if (r.tipo === 'troca_titularidade') {
    return `${r.nome_cliente_antigo || '?'} → ${r.nome_cliente_novo || '?'}`;
  }
  return r.nome_cliente || '—';
}

function formatarData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diasDesde(iso) {
  if (!iso) return null;
  const data = new Date(iso + 'T00:00:00');
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje - data) / (1000 * 60 * 60 * 24));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function badgeTipo(tipo) {
  const map = {
    escalada:           ['badge-escalada',    '📈 Escalada'],
    cliente_novo:       ['badge-cliente-novo','🆕 Cliente Novo'],
    troca_titularidade: ['badge-troca',       '🔄 Troca de Titularidade'],
  };
  const [cls, label] = map[tipo] || ['badge-escalada', tipo];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── STATUS BOTÃO (abre portal dropdown) ──────────────────────────
function renderStatusBtn(r) {
  const map = {
    parado:       ['🔴', 'Parado'],
    em_andamento: ['🟡', 'Em Andamento'],
    inaugurado:   ['🟢', 'Inaugurado'],
  };
  const [emoji, label] = map[r.status] || ['⚪', r.status];
  return `
    <div class="status-select-wrap">
      <button class="status-btn ${r.status}" onclick="abrirPortalDropdown(event, ${r.id})">
        ${emoji} ${label} <i data-lucide="chevron-down"></i>
      </button>
    </div>`;
}

// ─── MUDAR STATUS ─────────────────────────────────────────────────
async function mudarStatus(id, novoStatus) {
  try {
    const updated = await api('PATCH', `/api/implantacoes/${id}/status`, { status: novoStatus });
    const idx = allRecords.findIndex(r => r.id === id);
    if (idx !== -1) allRecords[idx] = updated;
    aplicarFiltros();
    atualizarCards();
    showToast('Status atualizado!', 'success');
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ─── MODAL DE INAUGURAÇÃO ─────────────────────────────────────────
function abrirModalInauguracao(id) {
  inaugurandoId = id;
  const r = allRecords.find(x => x.id === id);
  if (!r) return;

  document.getElementById('inaug-id').value = id;
  document.getElementById('inaug-cliente-display').textContent = clienteDisplay(r);

  // Preenche com dados existentes se já inaugurado antes
  document.getElementById('inaug-data').value          = r.data_inauguracao || ''; // Sincroniza a data
  document.getElementById('inaug-servidor').value      = r.servidor              || '';
  document.getElementById('inaug-login').value         = r.login_loja_express    || '';
  document.getElementById('inaug-senha').value         = r.senha_loja_express    || '';
  document.getElementById('inaug-telefone').value      = r.telefone              || '';
  document.getElementById('inaug-cupom').value         = r.emite_cupom_fiscal    || '';
  document.getElementById('inaug-chamado').checked     = !!r.abriu_chamado_teste;
  document.getElementById('inaug-observacao').value    = r.observacao            || '';

  abrirModal('modal-inauguracao');
}

function fecharModalInauguracao() {
  inaugurandoId = null;
  fecharModal('modal-inauguracao');
}

async function confirmarInauguracao() {
  const id      = document.getElementById('inaug-id').value;
  const data    = document.getElementById('inaug-data').value;
  const servidor= document.getElementById('inaug-servidor').value;
  const login   = document.getElementById('inaug-login').value.trim();
  const senha   = document.getElementById('inaug-senha').value.trim();
  const telefone= document.getElementById('inaug-telefone').value.trim();
  const cupom   = document.getElementById('inaug-cupom').value;
  const chamado = document.getElementById('inaug-chamado').checked;

  // Validação
  let ok = true;
  const checkRequired = (fieldId, val) => {
    if (!val) {
      document.getElementById(fieldId).classList.add('error');
      ok = false;
    } else {
      document.getElementById(fieldId).classList.remove('error');
    }
  };

  checkRequired('inaug-data', data);
  checkRequired('inaug-servidor', servidor);
  checkRequired('inaug-login', login);
  checkRequired('inaug-senha', senha);
  checkRequired('inaug-telefone', telefone);
  checkRequired('inaug-cupom', cupom);

  if (!ok) {
    showToast('Preencha os campos obrigatórios.', 'error');
    return;
  }

  const btn = document.getElementById('btn-confirmar-inauguracao');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Confirmando...';
  lucide.createIcons();

  try {
    const updated = await api('PATCH', `/api/implantacoes/${id}/inaugurar`, {
      data_inauguracao_real: data,
      servidor,
      login_loja_express: login,
      senha_loja_express: senha,
      telefone,
      emite_cupom_fiscal: cupom,
      abriu_chamado_teste: chamado,
      observacao: document.getElementById('inaug-observacao').value.trim() || null,
    });

    const idx = allRecords.findIndex(r => r.id === Number(id));
    if (idx !== -1) allRecords[idx] = updated;

    fecharModalInauguracao();
    aplicarFiltros();
    atualizarCards();
    showToast('🎉 Inauguração confirmada com sucesso!', 'success');
  } catch (e) {
    showToast('Erro ao confirmar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="rocket"></i> Confirmar Inauguração';
    lucide.createIcons();
  }
}

// ─── CHANGE STATUS NO FORM (para novo cadastro/edição) ─────────────
function onStatusFormChange(val) {
  // No form de cadastro/edição, se o usuário selecionar "inaugurado"
  // não fazemos nada especial - o modal de inauguração só aparece
  // quando se muda pelo dropdown da tabela.
  // O status pode ser salvo normalmente pelo form de edição.
}

// ─── MODAL CADASTRO ───────────────────────────────────────────────
function abrirModalCadastro() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Novo Cadastro';
  document.getElementById('form-cadastro').reset();
  document.getElementById('edit-id').value = '';
  
  // Bloquear opção de Inaugurado no cadastro novo
  const optInaugurado = document.querySelector('#status-form option[value="inaugurado"]');
  if (optInaugurado) {
    optInaugurado.disabled = true;
    optInaugurado.textContent = '🟢 Inaugurado (use botão da tabela)';
  }

  selecionarTipo('escalada');
  popularSelectResponsaveis();
  abrirModal('modal-cadastro');
}

async function abrirModalEdicao(id) {
  editingId = id;
  const r = allRecords.find(x => x.id === id);
  if (!r) return;

  document.getElementById('modal-title').textContent = 'Editar Cadastro';
  document.getElementById('edit-id').value = id;

  selecionarTipo(r.tipo);
  popularSelectResponsaveis(r.responsavel_tecnico);

  document.getElementById('nome-cliente').value         = r.nome_cliente        || '';
  document.getElementById('nome-cliente-antigo').value  = r.nome_cliente_antigo || '';
  document.getElementById('nome-cliente-novo').value    = r.nome_cliente_novo   || '';
  document.getElementById('nome-loja').value            = r.nome_loja           || '';
  document.getElementById('data-inauguracao').value     = r.data_inauguracao    || '';
  document.getElementById('telefone').value             = r.telefone            || '';
  document.getElementById('observacao').value           = r.observacao          || '';

  // Bloquear opção de Inaugurado se não estiver inaugurado
  const optInaugurado = document.querySelector('#status-form option[value="inaugurado"]');
  if (r.status !== 'inaugurado' && optInaugurado) {
    optInaugurado.disabled = true;
    optInaugurado.textContent = '🟢 Inaugurado (use botão da tabela)';
  } else if (optInaugurado) {
    optInaugurado.disabled = false;
    optInaugurado.textContent = '🟢 Inaugurado';
  }
  document.getElementById('status-form').value = r.status || 'parado';

  abrirModal('modal-cadastro');
}

function fecharModalCadastro() {
  fecharModal('modal-cadastro');
  limparErros();
}

function selecionarTipo(tipo) {
  currentTipo = tipo;

  ['escalada', 'cliente_novo', 'troca_titularidade'].forEach(t => {
    document.getElementById(`tipo-${t}`).classList.toggle('active', t === tipo);
  });

  const fg = (id, show) => document.getElementById(id).classList.toggle('hidden', !show);
  fg('fg-nome-cliente',        tipo !== 'troca_titularidade');
  fg('fg-nome-cliente-antigo', tipo === 'troca_titularidade');
  fg('fg-nome-cliente-novo',   tipo === 'troca_titularidade');
  fg('fg-nome-loja',           tipo !== 'cliente_novo');

  limparErros();
}

function validarFormulario() {
  limparErros();
  let valido = true;

  const obrigatorio = (id) => {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      el.classList.add('error');
      valido = false;
    }
  };

  if (currentTipo === 'troca_titularidade') {
    obrigatorio('nome-cliente-antigo');
    obrigatorio('nome-cliente-novo');
    obrigatorio('nome-loja');
  } else if (currentTipo === 'escalada') {
    obrigatorio('nome-cliente');
    obrigatorio('nome-loja');
  } else {
    obrigatorio('nome-cliente');
  }

  obrigatorio('data-inauguracao');
  obrigatorio('responsavel-tecnico');

  return valido;
}

function limparErros() {
  document.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));
}

async function salvarCadastro() {
  if (!validarFormulario()) {
    showToast('Preencha os campos obrigatórios.', 'error');
    return;
  }

  const payload = {
    tipo:                currentTipo,
    nome_cliente:        document.getElementById('nome-cliente').value.trim()        || null,
    nome_cliente_antigo: document.getElementById('nome-cliente-antigo').value.trim() || null,
    nome_cliente_novo:   document.getElementById('nome-cliente-novo').value.trim()   || null,
    nome_loja:           document.getElementById('nome-loja').value.trim()           || null,
    data_inauguracao:    document.getElementById('data-inauguracao').value,
    responsavel_tecnico: document.getElementById('responsavel-tecnico').value.trim(),
    telefone:            document.getElementById('telefone').value.trim()            || null,
    status:              document.getElementById('status-form').value,
    observacao:          document.getElementById('observacao').value.trim()          || null,
  };

  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Salvando...';
  lucide.createIcons();

  try {
    if (editingId) {
      await api('PUT', `/api/implantacoes/${editingId}`, payload);
      showToast('Cadastro atualizado com sucesso!', 'success');
    } else {
      await api('POST', '/api/implantacoes', payload);
      showToast('Cadastro realizado com sucesso!', 'success');
    }

    allRecords = await api('GET', '/api/implantacoes');

    fecharModalCadastro();
    aplicarFiltros();
    atualizarCards();
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Salvar';
    lucide.createIcons();
  }
}

// ─── MODAL EXCLUIR ────────────────────────────────────────────────
function abrirModalExcluir(id) {
  deletingId = id;
  const r = allRecords.find(x => x.id === id);
  const nome = r ? clienteDisplay(r) : '';
  document.getElementById('delete-confirm-name').textContent = nome;
  abrirModal('modal-excluir');
}

function fecharModalExcluir() {
  deletingId = null;
  fecharModal('modal-excluir');
}

async function confirmarExclusao() {
  if (!deletingId) return;

  const btn = document.getElementById('btn-confirmar-excluir');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Excluindo...';
  lucide.createIcons();

  try {
    await api('DELETE', `/api/implantacoes/${deletingId}`);
    allRecords = allRecords.filter(r => r.id !== deletingId);
    aplicarFiltros();
    atualizarCards();
    fecharModalExcluir();
    showToast('Registro excluído com sucesso.', 'info');
  } catch (e) {
    showToast('Erro ao excluir: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="trash-2"></i> Excluir';
    lucide.createIcons();
  }
}

// ─── ABA SUPORTE ──────────────────────────────────────────────────
async function carregarSuporte() {
  const nomeCliente = document.getElementById('s-cliente').value.trim();
  const nomeLoja    = document.getElementById('s-loja').value.trim();

  const params = new URLSearchParams();
  if (nomeCliente) params.append('nome_cliente', nomeCliente);
  if (nomeLoja)    params.append('nome_loja',    nomeLoja);

  const tbody  = document.getElementById('suporte-table-body');
  const counter = document.getElementById('suporte-table-counter');

  tbody.innerHTML = `
    <tr class="empty-row">
      <td colspan="11">
        <div class="empty-state">
          <i data-lucide="loader-2" class="empty-icon spinning"></i>
          <p>Carregando...</p>
        </div>
      </td>
    </tr>`;
  lucide.createIcons();

  try {
    const rows = await api('GET', `/api/suporte?${params.toString()}`);

    // Atualiza contadores
    document.getElementById('suporte-count').textContent = rows.length;
    counter.innerHTML = `<span>${rows.length}</span> cliente${rows.length !== 1 ? 's' : ''} no suporte`;

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">
            <div class="empty-state">
              <i data-lucide="check-circle-2" class="empty-icon" style="color:var(--status-ok);opacity:.5"></i>
              <p>Nenhum cliente elegível para suporte ainda</p>
              <p style="font-size:11px;margin-top:4px;opacity:.5">Clientes aparecem aqui após 15 dias da inauguração</p>
            </div>
          </td>
        </tr>`;
      lucide.createIcons();
      return;
    }

    tbody.innerHTML = '';
    rows.forEach(r => {
      const dias = diasDesde(r.data_inauguracao_real);
      const tr = document.createElement('tr');
      const obs = r.observacao || '';
      const obsShort = obs.length > 55 ? obs.slice(0, 55) + '…' : obs;
      tr.innerHTML = `
        <td data-label="Tipo">${badgeTipo(r.tipo)}</td>
        <td data-label="Cliente"><strong>${escHtml(clienteDisplay(r))}</strong></td>
        <td data-label="Loja">${escHtml(r.nome_loja || '—')}</td>
        <td data-label="Inauguração" style="white-space:nowrap">${formatarData(r.data_inauguracao_real)}</td>
        <td data-label="Dias Suporte">${renderDiasBadge(dias)}</td>
        <td data-label="Responsável">${escHtml(r.responsavel_tecnico || '—')}</td>
        <td data-label="Ações">
          <div class="acoes-wrap">
            <button class="btn-icon" title="Informações Adicionais" onclick='abrirModalInfoSuporte(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
              <i data-lucide="info"></i>
            </button>
            <button class="btn-icon" title="Treinamentos" onclick="abrirModalTreinamentos(${r.id})">
              <i data-lucide="graduation-cap"></i>
            </button>
            <button class="btn-icon" title="Editar" onclick="abrirModalEdicao(${r.id})">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon danger" title="Excluir" onclick="abrirModalExcluir(${r.id})">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  } catch (e) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          <div class="empty-state">
            <i data-lucide="alert-circle" class="empty-icon" style="color:var(--status-parado)"></i>
            <p>Erro ao carregar: ${escHtml(e.message)}</p>
          </div>
        </td>
      </tr>`;
    lucide.createIcons();
  }
}

function renderDiasBadge(dias) {
  if (dias === null) return '—';
  let cls = 'dias-badge-ok';
  if (dias > 30) cls = 'dias-badge-warn';
  if (dias > 60) cls = 'dias-badge-alert';
  return `<span class="dias-badge ${cls}">${dias} dias</span>`;
}

function renderServidorBadge(servidor) {
  if (!servidor) return '<span style="opacity:.35">—</span>';
  const isNuvem = servidor === 'Nuvem';
  return `<span class="servidor-badge ${isNuvem ? 'servidor-nuvem' : 'servidor-local'}">
    ${isNuvem ? '☁️' : '🖥️'} ${escHtml(servidor)}
  </span>`;
}

// ─── HELPER MODAL ─────────────────────────────────────────────────
function abrirModal(id) {
  fecharPortalDropdown();
  const el = document.getElementById(id);
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  lucide.createIcons();
  setTimeout(() => {
    const first = el.querySelector('input, select, textarea, button:not(.modal-close)');
    if (first) first.focus();
  }, 250);
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Fechar modal ao clicar no overlay
document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-inauguracao' && e.target.classList.contains('open')) {
    // Modal de inauguração NÃO fecha ao clicar no overlay (comportamento intencional)
    return;
  }
  if (e.target.classList.contains('modal-overlay') && e.target.classList.contains('open')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ESC fecha modal e dropdown (exceto modal de inauguração)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Fecha todos exceto modal de inauguração (que exige ação explícita)
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      if (m.id !== 'modal-inauguracao') {
        m.classList.remove('open');
      }
    });
    document.body.style.overflow = '';
    fecharPortalDropdown();
  }
});

// ─── TOAST ────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons     = { success: 'check-circle-2', error: 'x-circle', info: 'info' };
  const icon      = icons[type] || 'info';

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i data-lucide="${icon}"></i><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  lucide.createIcons();

  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 280);
  }, 3500);
}

// ─── RESPONSÁVEIS TÉCNICOS ───────────────────────────────────────
function popularSelectResponsaveis(valorAtual) {
  const sel = document.getElementById('responsavel-tecnico');
  sel.innerHTML = '<option value="">Selecione o responsável...</option>';
  listaResponsaveis.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.nome;
    opt.textContent = r.nome;
    sel.appendChild(opt);
  });
  if (valorAtual) {
    // Se o valor atual não estiver na lista (legado), adiciona como opção
    const existe = listaResponsaveis.some(r => r.nome === valorAtual);
    if (!existe) {
      const opt = document.createElement('option');
      opt.value = valorAtual;
      opt.textContent = `${valorAtual} (não cadastrado)`;
      sel.appendChild(opt);
    }
    sel.value = valorAtual;
  }
}

async function carregarResponsaveis() {
  try {
    listaResponsaveis = await api('GET', '/api/responsaveis');
    renderizarTabelaResponsaveis();
  } catch (e) {
    // silencioso na primeira carga
    console.error('Erro ao carregar responsáveis:', e);
  }
}

function renderizarTabelaResponsaveis() {
  const tbody   = document.getElementById('resp-table-body');
  const counter = document.getElementById('resp-table-counter');
  if (!tbody || !counter) return;

  const n = listaResponsaveis.length;
  counter.innerHTML = `<span>${n}</span> responsáve${n !== 1 ? 'is' : 'l'} cadastrado${n !== 1 ? 's' : ''}`;

  if (n === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">
          <div class="empty-state">
            <i data-lucide="user-x" class="empty-icon"></i>
            <p>Nenhum responsável cadastrado</p>
            <p style="font-size:11px;margin-top:4px;opacity:.5">Clique em "Novo Responsável" para adicionar</p>
          </div>
        </td>
      </tr>`;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = '';
  listaResponsaveis.forEach(r => {
    const tr = document.createElement('tr');
    const dt = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '—';
    tr.innerHTML = `
      <td data-label="Nome"><strong>${escHtml(r.nome)}</strong></td>
      <td data-label="Cadastrado em" style="opacity:.7">${dt}</td>
      <td data-label="Ações">
        <div class="acoes-wrap">
          <button class="btn-icon" title="Editar" onclick="abrirModalEditarResp(${r.id})">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon danger" title="Excluir" onclick="abrirModalExcluirResp(${r.id})">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  lucide.createIcons();
}

function abrirModalResponsavel() {
  editingRespId = null;
  document.getElementById('modal-resp-title').textContent = 'Novo Responsável';
  document.getElementById('form-responsavel').reset();
  document.getElementById('resp-edit-id').value = '';
  abrirModal('modal-responsavel');
}

function abrirModalEditarResp(id) {
  const r = listaResponsaveis.find(x => x.id === id);
  if (!r) return;
  editingRespId = id;
  document.getElementById('modal-resp-title').textContent = 'Editar Responsável';
  document.getElementById('resp-edit-id').value = id;
  document.getElementById('resp-nome').value = r.nome;
  abrirModal('modal-responsavel');
}

function fecharModalResponsavel() {
  editingRespId = null;
  fecharModal('modal-responsavel');
}

async function salvarResponsavel() {
  const nome = document.getElementById('resp-nome').value.trim();
  if (!nome) {
    document.getElementById('resp-nome').classList.add('error');
    showToast('Preencha o nome do responsável.', 'error');
    return;
  }
  document.getElementById('resp-nome').classList.remove('error');

  const btn = document.getElementById('btn-salvar-resp');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Salvando...';
  lucide.createIcons();

  try {
    if (editingRespId) {
      await api('PUT', `/api/responsaveis/${editingRespId}`, { nome });
      showToast('Responsável atualizado com sucesso!', 'success');
    } else {
      await api('POST', '/api/responsaveis', { nome });
      showToast('Responsável cadastrado com sucesso!', 'success');
    }
    await carregarResponsaveis();
    fecharModalResponsavel();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Salvar';
    lucide.createIcons();
  }
}

function abrirModalExcluirResp(id) {
  deletingRespId = id;
  const r = listaResponsaveis.find(x => x.id === id);
  document.getElementById('delete-resp-name').textContent = r ? r.nome : '';
  abrirModal('modal-excluir-resp');
}

function fecharModalExcluirResp() {
  deletingRespId = null;
  fecharModal('modal-excluir-resp');
}

async function confirmarExclusaoResp() {
  if (!deletingRespId) return;

  const btn = document.getElementById('btn-confirmar-excluir-resp');
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Excluindo...';
  lucide.createIcons();

  try {
    await api('DELETE', `/api/responsaveis/${deletingRespId}`);
    await carregarResponsaveis();
    fecharModalExcluirResp();
    showToast('Responsável excluído com sucesso.', 'info');
  } catch (e) {
    showToast('Erro ao excluir: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="trash-2"></i> Excluir';
    lucide.createIcons();
  }
}

// ─── EXPORTAÇÃO DE RELATÓRIOS ───────────────────────────────────
function toggleExportMenu(menuId) {
  const menu = document.getElementById(menuId);
  // Fecha outros menus abertos
  document.querySelectorAll('.export-menu.open').forEach(m => {
    if (m.id !== menuId) m.classList.remove('open');
  });
  menu.classList.toggle('open');
  lucide.createIcons();
}

function fecharExportMenus() {
  document.querySelectorAll('.export-menu.open').forEach(m => m.classList.remove('open'));
}

// ---- Helpers de exportação ----
function tipoLabel(tipo) {
  const map = { escalada: 'Escalada', cliente_novo: 'Cliente Novo', troca_titularidade: 'Troca de Titularidade' };
  return map[tipo] || tipo;
}

function statusLabel(status) {
  const map = { parado: 'Parado', em_andamento: 'Em Andamento', inaugurado: 'Inaugurado' };
  return map[status] || status;
}

function gerarTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

// ---- Implantações ----
function dadosImplantacoesParaExport() {
  return filteredRecords.map(r => ({
    'Tipo':                tipoLabel(r.tipo),
    'Cliente':             clienteDisplay(r),
    'Loja':                r.nome_loja || '',
    'Data Inauguração':    formatarData(r.data_inauguracao),
    'Responsável Técnico': r.responsavel_tecnico || '',
    'Status':              statusLabel(r.status),
    'Telefone':            r.telefone || '',
    'Observação':          r.observacao || '',
  }));
}

function exportarImplantacoes(formato) {
  fecharExportMenus();
  const dados = dadosImplantacoesParaExport();
  if (dados.length === 0) {
    showToast('Nenhum registro para exportar.', 'error');
    return;
  }
  const ts = gerarTimestamp();
  const titulo = 'Relatório de Implantações';

  if (formato === 'excel') exportarExcel(dados, `implantacoes_${ts}`, titulo);
  else if (formato === 'txt') exportarTxt(dados, `implantacoes_${ts}`, titulo);
  else if (formato === 'pdf') exportarPdf(dados, `implantacoes_${ts}`, titulo);
}

// ---- Suporte ----
function dadosSuporteParaExport() {
  // Pega os dados já renderizados na tabela de suporte
  const tbody = document.getElementById('suporte-table-body');
  if (!tbody) return [];
  const rows = tbody.querySelectorAll('tr:not(.empty-row)');
  const dados = [];
  rows.forEach(tr => {
    const cells = tr.querySelectorAll('td');
    if (cells.length >= 11) {
      dados.push({
        'Tipo':                cells[0].textContent.trim(),
        'Cliente':             cells[1].textContent.trim(),
        'Loja':                cells[2].textContent.trim(),
        'Data Inauguração':    cells[3].textContent.trim(),
        'Dias no Suporte':     cells[4].textContent.trim(),
        'Servidor':            cells[5].textContent.trim(),
        'Login Loja Express':  cells[6].textContent.trim(),
        'Senha Loja Express':  cells[7].textContent.trim(),
        'Responsável':         cells[8].textContent.trim(),
        'Telefone':            cells[9].textContent.trim(),
        'Observação':          cells[10].textContent.trim(),
      });
    }
  });
  return dados;
}

function exportarSuporte(formato) {
  fecharExportMenus();
  const dados = dadosSuporteParaExport();
  if (dados.length === 0) {
    showToast('Nenhum registro para exportar.', 'error');
    return;
  }
  const ts = gerarTimestamp();
  const titulo = 'Relatório de Clientes no Suporte';

  if (formato === 'excel') exportarExcel(dados, `suporte_${ts}`, titulo);
  else if (formato === 'txt') exportarTxt(dados, `suporte_${ts}`, titulo);
  else if (formato === 'pdf') exportarPdf(dados, `suporte_${ts}`, titulo);
}

// ---- EXCEL ----
function exportarExcel(dados, nomeArquivo, tituloSheet) {
  try {
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tituloSheet.substring(0, 31));

    // Auto-ajuste de largura das colunas
    const cols = Object.keys(dados[0]).map(key => {
      const maxLen = Math.max(
        key.length,
        ...dados.map(row => String(row[key] || '').length)
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = cols;

    XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
    showToast('📄 Excel exportado com sucesso!', 'success');
  } catch (e) {
    showToast('Erro ao exportar Excel: ' + e.message, 'error');
  }
}

// ---- TXT ----
function exportarTxt(dados, nomeArquivo, titulo) {
  try {
    const colunas = Object.keys(dados[0]);
    // Calcula largura de cada coluna
    const larguras = colunas.map(col =>
      Math.max(col.length, ...dados.map(r => String(r[col] || '').length)) + 2
    );

    let txt = `${titulo}\n`;
    txt += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    txt += `Total de registros: ${dados.length}\n`;
    txt += '='.repeat(larguras.reduce((a, b) => a + b, 0)) + '\n\n';

    // Cabeçalho
    txt += colunas.map((col, i) => col.padEnd(larguras[i])).join('') + '\n';
    txt += colunas.map((_, i) => '-'.repeat(larguras[i])).join('') + '\n';

    // Dados
    dados.forEach(row => {
      txt += colunas.map((col, i) => String(row[col] || '—').padEnd(larguras[i])).join('') + '\n';
    });

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, `${nomeArquivo}.txt`);
    showToast('📄 TXT exportado com sucesso!', 'success');
  } catch (e) {
    showToast('Erro ao exportar TXT: ' + e.message, 'error');
  }
}

// ---- PDF ----
function exportarPdf(dados, nomeArquivo, titulo) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Título
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(titulo, 14, 18);

    // Subtítulo
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}  |  Total: ${dados.length} registros`, 14, 25);

    // Tabela
    const colunas = Object.keys(dados[0]);
    const linhas = dados.map(row => colunas.map(col => String(row[col] || '—')));

    doc.autoTable({
      head: [colunas],
      body: linhas,
      startY: 30,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 3,
        lineColor: [200, 200, 200],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [249, 115, 22],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      margin: { top: 30, left: 14, right: 14 },
      didDrawPage: (data) => {
        // Rodapé
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        const pageNum = doc.internal.getNumberOfPages();
        doc.text(
          `Página ${data.pageNumber} de ${pageNum}  —  Controle de Implantação`,
          doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 8,
          { align: 'center' }
        );
      }
    });

    doc.save(`${nomeArquivo}.pdf`);
    showToast('📄 PDF exportado com sucesso!', 'success');
  } catch (e) {
    showToast('Erro ao exportar PDF: ' + e.message, 'error');
  }
}

// ─── TREINAMENTOS ────────────────────────────────────────────────
let treinamentosAtuais = [];

async function abrirModalTreinamentos(id) {
  document.getElementById('treinamento-implantacao-id').value = id;
  const container = document.getElementById('treinamentos-container');
  container.innerHTML = '<div style="text-align:center; padding:20px;"><i data-lucide="loader-2" class="spinning"></i> Carregando...</div>';
  document.getElementById('qtde-treinamentos').value = '';
  
  abrirModal('modal-treinamentos');

  try {
    const treinamentos = await api('GET', `/api/implantacoes/${id}/treinamentos`);
    treinamentosAtuais = treinamentos || [];
    document.getElementById('qtde-treinamentos').value = treinamentosAtuais.length;
    renderizarCamposTreinamentos();
  } catch (e) {
    container.innerHTML = `<div class="error" style="color:red; text-align:center;">Erro ao carregar: ${e.message}</div>`;
  }
}

function fecharModalTreinamentos() {
  fecharModal('modal-treinamentos');
}

function gerarCamposTreinamentos() {
  const qtde = parseInt(document.getElementById('qtde-treinamentos').value) || 0;
  // Mantém os existentes até o limite da quantidade, adiciona vazios se necessário
  if (qtde < treinamentosAtuais.length) {
    treinamentosAtuais = treinamentosAtuais.slice(0, qtde);
  } else {
    while (treinamentosAtuais.length < qtde) {
      treinamentosAtuais.push({ tema: '', link: '' });
    }
  }
  renderizarCamposTreinamentos();
}

function adicionarUmTreinamento() {
  treinamentosAtuais.push({ tema: '', link: '' });
  document.getElementById('qtde-treinamentos').value = treinamentosAtuais.length;
  renderizarCamposTreinamentos();
}

function removerTreinamento(index) {
  treinamentosAtuais.splice(index, 1);
  document.getElementById('qtde-treinamentos').value = treinamentosAtuais.length;
  renderizarCamposTreinamentos();
}

function renderizarCamposTreinamentos() {
  const container = document.getElementById('treinamentos-container');
  container.innerHTML = '';
  
  if (treinamentosAtuais.length === 0) {
    container.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:14px;">Nenhum treinamento adicionado.</p>';
    return;
  }

  treinamentosAtuais.forEach((t, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'border:1px solid var(--border-color); padding:15px; border-radius:8px; position:relative; background:var(--bg-lighter);';
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong style="font-size:14px; color:var(--text-color);">Treinamento ${i + 1}</strong>
        <button type="button" class="btn-icon danger" style="padding:4px;" onclick="removerTreinamento(${i})" title="Remover">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
      <div class="form-group">
        <label class="form-label">Tema do treinamento</label>
        <input type="text" class="form-input" value="${escHtml(t.tema)}" oninput="treinamentosAtuais[${i}].tema = this.value" placeholder="Qual foi o tema?" />
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Link do treinamento</label>
        <div style="display:flex; gap:8px;">
          <input type="url" id="link-treinamento-${i}" class="form-input" value="${escHtml(t.link)}" oninput="treinamentosAtuais[${i}].link = this.value" placeholder="https://..." readonly style="background: var(--bg-main); opacity: 0.8; cursor: not-allowed;" />
          <button type="button" class="btn-icon" title="Editar Link" onclick="habilitarEdicaoLink(${i})">
            <i data-lucide="pencil"></i>
          </button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
  lucide.createIcons();
}

function habilitarEdicaoLink(index) {
  const input = document.getElementById(`link-treinamento-${index}`);
  if (input) {
    input.removeAttribute('readonly');
    input.style.background = '';
    input.style.opacity = '1';
    input.style.cursor = 'text';
    input.focus();
  }
}


async function salvarTreinamentos() {
  const id = document.getElementById('treinamento-implantacao-id').value;
  const btn = document.getElementById('btn-salvar-treinamentos');
  
  // Limpa treinamentos completamente em branco antes de salvar
  const validos = treinamentosAtuais.filter(t => t.tema.trim() || t.link.trim());
  
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2" class="spinning"></i> Salvando...';
  lucide.createIcons();

  try {
    await api('PUT', `/api/implantacoes/${id}/treinamentos`, { treinamentos: validos });
    showToast('Treinamentos salvos com sucesso!', 'success');
    fecharModalTreinamentos();
  } catch (e) {
    showToast('Erro ao salvar treinamentos: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="save"></i> Salvar Treinamentos';
    lucide.createIcons();
  }
}

// ─── INFO MODAL (SUPORTE) ────────────────────────────────────────
function abrirModalInfoSuporte(r) {
  document.getElementById('info-servidor').innerHTML = renderServidorBadge(r.servidor);
  document.getElementById('info-cupom').textContent = r.emite_cupom_fiscal || 'Não informado';
  document.getElementById('info-login').textContent = r.login_loja_express || '—';
  document.getElementById('info-senha').textContent = r.senha_loja_express || '—';
  document.getElementById('info-telefone').textContent = r.telefone || '—';
  document.getElementById('info-observacao').textContent = r.observacao || 'Nenhuma observação.';
  
  abrirModal('modal-info-suporte');
}

function fecharModalInfoSuporte() {
  fecharModal('modal-info-suporte');
}

