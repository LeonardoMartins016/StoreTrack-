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
  carregarDados();

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.status-dropdown-portal') &&
        !e.target.closest('.status-btn')) {
      fecharPortalDropdown();
    }
  });
});

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
}

// ─── API ─────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
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

  animarNumero('val-total',       total);
  animarNumero('val-mes',         estesMes);
  animarNumero('val-semana',      essaSemana);
  animarNumero('val-andamento',   emAndamento);
  animarNumero('val-inaugurados', inaugurados);
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
      <td>${badgeTipo(r.tipo)}</td>
      <td>${escHtml(clienteDisplay(r))}</td>
      <td>${escHtml(r.nome_loja || '—')}</td>
      <td style="white-space:nowrap">${formatarData(r.data_inauguracao)}</td>
      <td>${escHtml(r.responsavel_tecnico || '—')}</td>
      <td>${renderStatusBtn(r)}</td>
      <td class="tel-cell">${r.telefone ? escHtml(r.telefone) : '<span style="opacity:.35">—</span>'}</td>
      <td class="obs-cell" title="${escHtml(obs)}">${obsShort ? escHtml(obsShort) : '<span style="opacity:.25">—</span>'}</td>
      <td>
        <div class="acoes-wrap">
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
  document.getElementById('inaug-data').value          = r.data_inauguracao_real || r.data_inauguracao || '';
  document.getElementById('inaug-servidor').value      = r.servidor              || '';
  document.getElementById('inaug-login').value         = r.login_loja_express    || '';
  document.getElementById('inaug-senha').value         = r.senha_loja_express    || '';
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

  // Validação
  let ok = true;
  if (!data) {
    document.getElementById('inaug-data').classList.add('error');
    ok = false;
  } else {
    document.getElementById('inaug-data').classList.remove('error');
  }
  if (!servidor) {
    document.getElementById('inaug-servidor').classList.add('error');
    ok = false;
  } else {
    document.getElementById('inaug-servidor').classList.remove('error');
  }

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
      login_loja_express: login || null,
      senha_loja_express: senha || null,
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
  selecionarTipo('escalada');
  abrirModal('modal-cadastro');
}

async function abrirModalEdicao(id) {
  editingId = id;
  const r = allRecords.find(x => x.id === id);
  if (!r) return;

  document.getElementById('modal-title').textContent = 'Editar Cadastro';
  document.getElementById('edit-id').value = id;

  selecionarTipo(r.tipo);

  document.getElementById('nome-cliente').value         = r.nome_cliente        || '';
  document.getElementById('nome-cliente-antigo').value  = r.nome_cliente_antigo || '';
  document.getElementById('nome-cliente-novo').value    = r.nome_cliente_novo   || '';
  document.getElementById('nome-loja').value            = r.nome_loja           || '';
  document.getElementById('data-inauguracao').value     = r.data_inauguracao    || '';
  document.getElementById('responsavel-tecnico').value  = r.responsavel_tecnico || '';
  document.getElementById('telefone').value             = r.telefone            || '';
  document.getElementById('status-form').value          = r.status              || 'parado';
  document.getElementById('observacao').value           = r.observacao          || '';

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

    // Atualiza badge da aba
    const badge = document.getElementById('tab-badge-suporte');
    if (rows.length > 0) {
      badge.textContent = rows.length;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }

    // Atualiza contadores
    document.getElementById('suporte-count').textContent = rows.length;
    counter.innerHTML = `<span>${rows.length}</span> cliente${rows.length !== 1 ? 's' : ''} no suporte`;

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="11">
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
        <td>${badgeTipo(r.tipo)}</td>
        <td><strong>${escHtml(clienteDisplay(r))}</strong></td>
        <td>${escHtml(r.nome_loja || '—')}</td>
        <td style="white-space:nowrap">${formatarData(r.data_inauguracao_real)}</td>
        <td>${renderDiasBadge(dias)}</td>
        <td>${renderServidorBadge(r.servidor)}</td>
        <td class="login-cell">${r.login_loja_express ? escHtml(r.login_loja_express) : '<span style="opacity:.35">—</span>'}</td>
        <td class="login-cell">${r.senha_loja_express ? escHtml(r.senha_loja_express) : '<span style="opacity:.35">—</span>'}</td>
        <td>${escHtml(r.responsavel_tecnico || '—')}</td>
        <td class="tel-cell">${r.telefone ? escHtml(r.telefone) : '<span style="opacity:.35">—</span>'}</td>
        <td class="obs-cell" title="${escHtml(obs)}">${obsShort ? escHtml(obsShort) : '<span style="opacity:.25">—</span>'}</td>
      `;
      tbody.appendChild(tr);
    });

    lucide.createIcons();
  } catch (e) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="11">
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
