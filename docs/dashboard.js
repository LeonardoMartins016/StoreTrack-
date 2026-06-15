/* ═══════════════════════════════════════════════════════════════
   DASHBOARD — dashboard.js
   Busca dados da API /api/dashboard e renderiza métricas
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── API HELPER ─────────────────────────────────────────────────
async function api(method, path) {
  const res = await fetch(path, { method });
  if (res.status === 401) {
    location.replace('/login.html');
    throw new Error('Sessão expirada.');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
}

// ─── LOGOUT ─────────────────────────────────────────────────────
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

// ─── TOAST ──────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: 'check-circle-2', error: 'x-circle', info: 'info' };
  const icon = icons[type] || 'info';

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

// ─── ANIMAÇÃO DE NÚMEROS ────────────────────────────────────────
function animarNumero(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duracao = 600;
  const inicio = performance.now();
  const frame = (agora) => {
    const prog = Math.min((agora - inicio) / duracao, 1);
    const ease = 1 - Math.pow(1 - prog, 3);
    el.textContent = Math.round(start + (target - start) * ease);
    if (prog < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ─── FORMATAR DATA ──────────────────────────────────────────────
function formatarData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ─── CARREGAR DASHBOARD ─────────────────────────────────────────
async function carregarDashboard() {
  try {
    const data = await api('GET', '/api/dashboard');
    renderizarDashboard(data);
  } catch (e) {
    showToast('Erro ao carregar dashboard: ' + e.message, 'error');
    document.getElementById('dash-loading').innerHTML = `
      <i data-lucide="alert-circle" style="width:40px;height:40px;color:var(--status-parado);"></i>
      <p style="color:var(--text-secondary);margin-top:12px;">Erro ao carregar dados</p>
      <button class="btn-primary" onclick="location.reload()" style="margin-top:12px;">
        <i data-lucide="refresh-cw"></i> Tentar novamente
      </button>
    `;
    lucide.createIcons();
  }
}

function renderizarDashboard(data) {
  // Esconde loading, mostra conteúdo
  document.getElementById('dash-loading').style.display = 'none';
  document.getElementById('dash-content').style.display = '';

  // ─── Última atualização ───
  document.getElementById('dash-last-update').textContent =
    `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;

  // ─── SEÇÃO 1: KPIs Globais ───
  animarNumero('kpi-implantacao-total', data.implantacaoPorTipo.total);
  animarNumero('kpi-impl-novo', data.implantacaoPorTipo.cliente_novo);
  animarNumero('kpi-impl-escalada', data.implantacaoPorTipo.escalada);
  animarNumero('kpi-impl-troca', data.implantacaoPorTipo.troca_titularidade);

  animarNumero('kpi-inauguradas', data.inauguradas);

  animarNumero('kpi-semana-total', data.semanaPorTipo.total);
  animarNumero('kpi-sem-novo', data.semanaPorTipo.cliente_novo);
  animarNumero('kpi-sem-escalada', data.semanaPorTipo.escalada);
  animarNumero('kpi-sem-troca', data.semanaPorTipo.troca_titularidade);

  animarNumero('kpi-total-geral', data.totalGeral);

  // ─── SEÇÃO 2: Status por Tipo ───
  renderizarStatusPainel('novo', data.statusPorTipo.cliente_novo);
  renderizarStatusPainel('escalada', data.statusPorTipo.escalada);
  renderizarStatusPainel('troca', data.statusPorTipo.troca_titularidade);

  // ─── SEÇÃO 3: Tabela por Responsável ───
  renderizarTabelaResponsaveis(data.porResponsavel);

  // ─── SEÇÃO 4: Inaugurações Semana ───
  const periodo = data.periodoSemana;
  document.getElementById('dash-semana-periodo').textContent =
    `${formatarData(periodo.de)} — ${formatarData(periodo.ate)}`;

  animarNumero('semana-novo', data.semanaPorTipo.cliente_novo);
  animarNumero('semana-escalada', data.semanaPorTipo.escalada);
  animarNumero('semana-troca', data.semanaPorTipo.troca_titularidade);

  // Re-renderiza ícones Lucide
  lucide.createIcons();
}

// ─── STATUS PAINEL (barras) ─────────────────────────────────────
function renderizarStatusPainel(prefix, statusData) {
  const total = statusData.em_andamento + statusData.inaugurado + statusData.parado;
  const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : 0;

  // Totais
  animarNumero(`status-${prefix}-total`, total);
  animarNumero(`status-${prefix}-andamento`, statusData.em_andamento);
  animarNumero(`status-${prefix}-concluido`, statusData.inaugurado);
  animarNumero(`status-${prefix}-parado`, statusData.parado);

  // Barras com delay para animação
  setTimeout(() => {
    const barAndamento = document.getElementById(`bar-${prefix}-andamento`);
    const barConcluido = document.getElementById(`bar-${prefix}-concluido`);
    const barParado = document.getElementById(`bar-${prefix}-parado`);

    if (barAndamento) barAndamento.style.width = pct(statusData.em_andamento) + '%';
    if (barConcluido) barConcluido.style.width = pct(statusData.inaugurado) + '%';
    if (barParado) barParado.style.width = pct(statusData.parado) + '%';
  }, 200);
}

// ─── TABELA POR RESPONSÁVEL ─────────────────────────────────────
function renderizarTabelaResponsaveis(porResponsavel) {
  const tbody = document.getElementById('dash-resp-tbody');
  const entries = Object.entries(porResponsavel).sort((a, b) => b[1].total - a[1].total);

  if (entries.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="5">
          <div class="empty-state">
            <i data-lucide="user-x" class="empty-icon"></i>
            <p>Nenhum dado encontrado</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = '';
  entries.forEach(([nome, counts]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Responsável">
        <div class="dash-resp-name">
          <div class="dash-resp-avatar">${nome.charAt(0).toUpperCase()}</div>
          <strong>${escHtml(nome)}</strong>
        </div>
      </td>
      <td data-label="Escaladas" style="text-align:center;">
        <span class="dash-resp-badge badge-escalada">${counts.escalada}</span>
      </td>
      <td data-label="Clientes Novos" style="text-align:center;">
        <span class="dash-resp-badge badge-cliente-novo">${counts.cliente_novo}</span>
      </td>
      <td data-label="Troca Titularidade" style="text-align:center;">
        <span class="dash-resp-badge badge-troca">${counts.troca_titularidade}</span>
      </td>
      <td data-label="Total" style="text-align:center;">
        <span class="dash-resp-total">${counts.total}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── INICIALIZAÇÃO ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  iniciarRelogio();
  carregarDashboard();

  // Auto-refresh a cada 60 segundos
  setInterval(carregarDashboard, 60000);
});
