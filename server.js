require('dotenv').config();
const express = require('express');
const path    = require('path');
const session = require('express-session');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CREDENCIAIS (fixas) ─────────────────────────────────────────
const USUARIO_LOGIN = process.env.APP_USER  || 'Suporte';
const SENHA_LOGIN   = process.env.APP_PASS  || 'ADM$UPORTE';

// ─── CONFIGURAÇÃO DO POSTGRES (NEON) ─────────────────────────────
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ AVISO: DATABASE_URL não definida no arquivo .env!');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necessário para conexões seguras na maioria dos BDs em nuvem (Neon)
  }
});

async function initDB() {
  const client = await pool.connect();
  try {
    // Criar tabela se não existir
    // Usamos SERIAL para AUTOINCREMENT, e as funções de data do Postgres
    await client.query(`
      CREATE TABLE IF NOT EXISTS implantacoes (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(255) NOT NULL,
        nome_cliente VARCHAR(255),
        nome_cliente_antigo VARCHAR(255),
        nome_cliente_novo VARCHAR(255),
        nome_loja VARCHAR(255),
        data_inauguracao VARCHAR(20) NOT NULL,
        responsavel_tecnico VARCHAR(255) NOT NULL,
        observacao TEXT,
        telefone VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'parado',
        data_inauguracao_real VARCHAR(20),
        servidor VARCHAR(50),
        login_loja_express VARCHAR(255),
        senha_loja_express VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de responsáveis técnicos
    await client.query(`
      CREATE TABLE IF NOT EXISTS responsaveis_tecnicos (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Adiciona colunas de inauguração se não existirem (migração segura)
    const migracoes = [
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS data_inauguracao_real VARCHAR(20)`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS servidor VARCHAR(50)`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS login_loja_express VARCHAR(255)`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS senha_loja_express VARCHAR(255)`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS emite_cupom_fiscal VARCHAR(10)`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS abriu_chamado_teste BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS treinamentos JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE implantacoes ADD COLUMN IF NOT EXISTS ummense_uuid VARCHAR(255) UNIQUE`,
    ];
    for (const sql of migracoes) {
      await client.query(sql);
    }
    console.log('📂 Banco de dados PostgreSQL conectado e tabela verificada.');
  } finally {
    client.release();
  }
}

// ─── HELPERS DB ─────────────────────────────────────────────────
// No pg, os parâmetros usam $1, $2 ao invés de ?
// Precisamos converter strings com ? para $1, $2, etc.
function convertSqlToPg(sql) {
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
}

async function getAll(sql, params = []) {
  const pgSql = convertSqlToPg(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
}

async function getOne(sql, params = []) {
  const rows = await getAll(sql, params);
  return rows[0] || null;
}

async function runWrite(sql, params = []) {
  const pgSql = convertSqlToPg(sql);
  const result = await pool.query(pgSql, params);
  return result;
}

// ─── MIDDLEWARES ──────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'storetrack-s3cr3t-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
    httpOnly: true,
  }
}));
app.use(express.static(path.join(__dirname, 'docs')));

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  return res.status(401).json({ error: 'Não autorizado. Faça login.' });
}

// ─── ROTAS DE AUTENTICAÇÃO ───────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { usuario, senha } = req.body;
  if (usuario === USUARIO_LOGIN && senha === SENHA_LOGIN) {
    req.session.loggedIn = true;
    req.session.usuario  = usuario;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/check', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn), usuario: req.session.usuario || null });
});

// ─────────────────────────────────────────────────────────────────
// GET /api/implantacoes
// ─────────────────────────────────────────────────────────────────
app.get('/api/implantacoes', requireAuth, async (req, res) => {
  try {
    const { data_inauguracao, nome_cliente, nome_loja, tipo, responsavel, status } = req.query;

    let query  = 'SELECT * FROM implantacoes WHERE 1=1';
    const params = [];

    if (data_inauguracao) {
      query += ' AND data_inauguracao = ?';
      params.push(data_inauguracao);
    }
    if (nome_cliente) {
      query += ` AND (
        LOWER(COALESCE(nome_cliente,'')) LIKE ?
        OR LOWER(COALESCE(nome_cliente_antigo,'')) LIKE ?
        OR LOWER(COALESCE(nome_cliente_novo,'')) LIKE ?
      )`;
      const like = `%${nome_cliente.toLowerCase()}%`;
      params.push(like, like, like);
    }
    if (nome_loja) {
      query += ' AND LOWER(COALESCE(nome_loja,\'\')) LIKE ?';
      params.push(`%${nome_loja.toLowerCase()}%`);
    }
    if (tipo) {
      query += ' AND tipo = ?';
      params.push(tipo);
    }
    if (responsavel) {
      query += ' AND LOWER(COALESCE(responsavel_tecnico,\'\')) LIKE ?';
      params.push(`%${responsavel.toLowerCase()}%`);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const rows = await getAll(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/implantacoes
// ─────────────────────────────────────────────────────────────────
app.post('/api/implantacoes', requireAuth, async (req, res) => {
  try {
    const {
      tipo, nome_cliente, nome_cliente_antigo, nome_cliente_novo,
      nome_loja, data_inauguracao, responsavel_tecnico,
      observacao, telefone, status
    } = req.body;

    if (!tipo || !data_inauguracao || !responsavel_tecnico) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    // No Postgres podemos usar RETURNING id para pegar o ID recém criado
    const result = await runWrite(`
      INSERT INTO implantacoes
        (tipo, nome_cliente, nome_cliente_antigo, nome_cliente_novo,
         nome_loja, data_inauguracao, responsavel_tecnico,
         observacao, telefone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      tipo,
      nome_cliente        || null,
      nome_cliente_antigo || null,
      nome_cliente_novo   || null,
      nome_loja           || null,
      data_inauguracao,
      responsavel_tecnico,
      observacao          || null,
      telefone            || null,
      status              || 'parado'
    ]);

    const novo = result.rows[0];
    res.status(201).json(novo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/implantacoes/:id
// ─────────────────────────────────────────────────────────────────
app.put('/api/implantacoes/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    const {
      tipo, nome_cliente, nome_cliente_antigo, nome_cliente_novo,
      nome_loja, data_inauguracao, responsavel_tecnico,
      observacao, telefone, status
    } = req.body;

    const result = await runWrite(`
      UPDATE implantacoes SET
        tipo = ?, nome_cliente = ?, nome_cliente_antigo = ?, nome_cliente_novo = ?,
        nome_loja = ?, data_inauguracao = ?, responsavel_tecnico = ?,
        observacao = ?, telefone = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `, [
      tipo,
      nome_cliente        || null,
      nome_cliente_antigo || null,
      nome_cliente_novo   || null,
      nome_loja           || null,
      data_inauguracao,
      responsavel_tecnico,
      observacao          || null,
      telefone            || null,
      status              || existing.status,
      id
    ]);

    const updated = result.rows[0];
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/implantacoes/:id/status
// ─────────────────────────────────────────────────────────────────
app.patch('/api/implantacoes/:id/status', requireAuth, async (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const valid = ['parado', 'em_andamento', 'inaugurado'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const existing = await getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    const result = await runWrite(`
      UPDATE implantacoes
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `, [status, id]);

    const updated = result.rows[0];
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/implantacoes/:id/inaugurar
// Salva os dados de inauguração e muda status para inaugurado
// ─────────────────────────────────────────────────────────────────
app.patch('/api/implantacoes/:id/inaugurar', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data_inauguracao_real, servidor, login_loja_express, senha_loja_express, telefone, emite_cupom_fiscal, abriu_chamado_teste, observacao } = req.body;

    if (!data_inauguracao_real || !servidor || !login_loja_express || !senha_loja_express || !telefone) {
      return res.status(400).json({ error: 'Data, servidor, login, senha e telefone são obrigatórios.' });
    }

    const existing = await getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    const result = await runWrite(`
      UPDATE implantacoes
      SET status = 'inaugurado',
          data_inauguracao = ?,
          data_inauguracao_real = ?,
          servidor = ?,
          login_loja_express = ?,
          senha_loja_express = ?,
          telefone = ?,
          emite_cupom_fiscal = ?,
          abriu_chamado_teste = ?,
          observacao = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `, [data_inauguracao_real, data_inauguracao_real, servidor, login_loja_express, senha_loja_express, telefone, emite_cupom_fiscal || null, abriu_chamado_teste || false, observacao || null, id]);

    const updated = result.rows[0];
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/implantacoes/:id/treinamentos
// ─────────────────────────────────────────────────────────────────
app.get('/api/implantacoes/:id/treinamentos', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getOne('SELECT treinamentos FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    res.json(existing.treinamentos || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/implantacoes/:id/treinamentos
// ─────────────────────────────────────────────────────────────────
app.put('/api/implantacoes/:id/treinamentos', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { treinamentos } = req.body; // Expects an array

    if (!Array.isArray(treinamentos)) {
      return res.status(400).json({ error: 'Treinamentos deve ser um array.' });
    }

    const existing = await getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    const result = await runWrite(`
      UPDATE implantacoes
      SET treinamentos = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING *
    `, [JSON.stringify(treinamentos), id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/suporte
// Retorna clientes inaugurados há mais de 15 dias
// ─────────────────────────────────────────────────────────────────
app.get('/api/suporte', requireAuth, async (req, res) => {
  try {
    const { nome_cliente, nome_loja } = req.query;

    let query = `
      SELECT * FROM implantacoes
      WHERE status = 'inaugurado'
        AND data_inauguracao_real IS NOT NULL
        AND (CURRENT_DATE - CAST(data_inauguracao_real AS DATE)) >= 15
    `;
    const params = [];

    if (nome_cliente) {
      query += ` AND (
        LOWER(COALESCE(nome_cliente,'')) LIKE ?
        OR LOWER(COALESCE(nome_cliente_antigo,'')) LIKE ?
        OR LOWER(COALESCE(nome_cliente_novo,'')) LIKE ?
      )`;
      const like = `%${nome_cliente.toLowerCase()}%`;
      params.push(like, like, like);
    }
    if (nome_loja) {
      query += ` AND LOWER(COALESCE(nome_loja,'')) LIKE ?`;
      params.push(`%${nome_loja.toLowerCase()}%`);
    }

    query += ' ORDER BY data_inauguracao_real DESC';

    const rows = await getAll(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/dashboard
// Retorna dados agregados para o painel de dashboard
// ─────────────────────────────────────────────────────────────────
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    // Todas as implantações
    const all = await getAll('SELECT * FROM implantacoes ORDER BY created_at DESC');

    // ─── Helpers de data ───
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diaSemana = hoje.getDay() === 0 ? 6 : hoje.getDay() - 1;
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - diaSemana);
    const domingo = new Date(segunda);
    domingo.setDate(segunda.getDate() + 6);
    const isoSeg = segunda.toISOString().slice(0, 10);
    const isoDom = domingo.toISOString().slice(0, 10);

    // ─── 1. Quantidade por Responsável (por tipo) ───
    const porResponsavel = {};
    all.forEach(r => {
      const resp = r.responsavel_tecnico || 'Não atribuído';
      if (!porResponsavel[resp]) {
        porResponsavel[resp] = { escalada: 0, cliente_novo: 0, troca_titularidade: 0, total: 0 };
      }
      if (porResponsavel[resp][r.tipo] !== undefined) {
        porResponsavel[resp][r.tipo]++;
      }
      porResponsavel[resp].total++;
    });

    // ─── 2. Status por Tipo de Implantação ───
    const statusPorTipo = {
      cliente_novo: { em_andamento: 0, inaugurado: 0, parado: 0 },
      escalada: { em_andamento: 0, inaugurado: 0, parado: 0 },
      troca_titularidade: { em_andamento: 0, inaugurado: 0, parado: 0 },
    };
    all.forEach(r => {
      if (statusPorTipo[r.tipo] && statusPorTipo[r.tipo][r.status] !== undefined) {
        statusPorTipo[r.tipo][r.status]++;
      }
    });

    // ─── 3. Lojas em implantação (não inauguradas) ───
    const emImplantacao = all.filter(r => r.status !== 'inaugurado');
    const implantacaoPorTipo = {
      cliente_novo: emImplantacao.filter(r => r.tipo === 'cliente_novo').length,
      escalada: emImplantacao.filter(r => r.tipo === 'escalada').length,
      troca_titularidade: emImplantacao.filter(r => r.tipo === 'troca_titularidade').length,
      total: emImplantacao.length,
    };

    // ─── 4. Lojas inauguradas ───
    const inauguradas = all.filter(r => r.status === 'inaugurado').length;

    // ─── 5. Inaugurações esta semana (lojas com data de inauguração na semana) ───
    const semana = all.filter(r => {
      return r.data_inauguracao >= isoSeg && r.data_inauguracao <= isoDom;
    });
    const semanaPorTipo = {
      cliente_novo: semana.filter(r => r.tipo === 'cliente_novo').length,
      escalada: semana.filter(r => r.tipo === 'escalada').length,
      troca_titularidade: semana.filter(r => r.tipo === 'troca_titularidade').length,
      total: semana.length,
    };

    res.json({
      porResponsavel,
      statusPorTipo,
      implantacaoPorTipo,
      inauguradas,
      semanaPorTipo,
      totalGeral: all.length,
      periodoSemana: { de: isoSeg, ate: isoDom },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/implantacoes/:id
// ─────────────────────────────────────────────────────────────────
app.delete('/api/implantacoes/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    await runWrite('DELETE FROM implantacoes WHERE id = ?', [id]);
    res.json({ success: true, id: Number(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// CRUD /api/responsaveis — Responsáveis Técnicos
// ─────────────────────────────────────────────────────────────────
app.get('/api/responsaveis', requireAuth, async (req, res) => {
  try {
    const rows = await getAll('SELECT * FROM responsaveis_tecnicos ORDER BY nome ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/responsaveis', requireAuth, async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório.' });
    }
    const result = await runWrite(
      'INSERT INTO responsaveis_tecnicos (nome) VALUES (?) RETURNING *',
      [nome.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Responsável já cadastrado.' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/responsaveis/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório.' });
    }
    const existing = await getOne('SELECT * FROM responsaveis_tecnicos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Responsável não encontrado.' });

    const result = await runWrite(
      'UPDATE responsaveis_tecnicos SET nome = ? WHERE id = ? RETURNING *',
      [nome.trim(), id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe um responsável com esse nome.' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/responsaveis/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await getOne('SELECT * FROM responsaveis_tecnicos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Responsável não encontrado.' });

    await runWrite('DELETE FROM responsaveis_tecnicos WHERE id = ?', [id]);
    res.json({ success: true, id: Number(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/webhook/ummense — Fase 2: Recebe e grava no banco
// Lógica UPSERT: cria novo registro ou atualiza se UUID já existe
// ─────────────────────────────────────────────────────────────────
app.post('/api/webhook/ummense', async (req, res) => {
  // 1. Log de debug (mantém visibilidade nos Logs do Render)
  console.log('\n======================================================');
  console.log('🚨 WEBHOOK UMMENSE RECEBIDO!');
  console.log('🗓️ Data:', new Date().toISOString());
  console.log('📦 Evento:', req.headers['x-ummense-event'] || 'N/A');
  console.log('📦 Payload:', JSON.stringify(req.body, null, 2));
  console.log('======================================================\n');

  try {
    const payload = req.body;
    if (!payload || !payload.uuid) {
      return res.status(400).json({ error: 'Payload inválido: UUID ausente.' });
    }

    // 2. Determinar o tipo pela tag
    const tags = (payload.tags || []).map(t => t.toUpperCase());
    let tipo = 'escalada'; // padrão
    if (tags.includes('PRIMEIRA LOJA'))         tipo = 'cliente_novo';
    if (tags.includes('TROCA DE TITULARIDADE')) tipo = 'troca_titularidade';

    // 3. Extrair nome da loja da description
    let nome_loja = null;
    if (payload.description) {
      // A description da Ummense vem sem quebras de linha (tudo grudado).
      // Captura o texto após "Nome e endereço da loja:" até o próximo
      // indicador de endereço (RUA, AV, RODOVIA, etc.) ou bloco de underscores.
      const match = payload.description.match(
        /Nome e endere[çc]o da loja:\s*(.+?)(?=RUA\s|AV[\.\s]|AVENIDA\s|RODOVIA\s|ESTRADA\s|BAIRRO\s|CEP|Importa[çc]|_{5,})/i
      );
      if (match && match[1]) {
        nome_loja = match[1].trim();
      }
    }
    // Fallback: usa o nome do card
    if (!nome_loja) {
      nome_loja = payload.name || null;
    }
    // Segurança: truncar para caber no VARCHAR(255)
    if (nome_loja && nome_loja.length > 255) nome_loja = nome_loja.substring(0, 255);

    // 4. Extrair demais campos
    let nome_cliente = payload.name || null;
    if (nome_cliente && nome_cliente.length > 255) nome_cliente = nome_cliente.substring(0, 255);
    const telefone     = payload.contacts?.[0]?.cellphone || null;
    const data_inaug   = payload.date?.end_date
                        || (payload.estimated_end_date ? payload.estimated_end_date.split(' ')[0] : null)
                        || new Date().toISOString().slice(0, 10); // fallback: data de hoje
    const observacao   = payload.description || null;

    // 5. Verificar se já existe registro com este UUID
    const existente = await getOne(
      'SELECT * FROM implantacoes WHERE ummense_uuid = ?',
      [payload.uuid]
    );

    if (existente) {
      // ─── UPDATE: Atualiza campos que vieram no payload ───
      const result = await runWrite(`
        UPDATE implantacoes SET
          tipo = ?,
          nome_cliente = ?,
          nome_loja = ?,
          data_inauguracao = COALESCE(?, data_inauguracao),
          telefone = COALESCE(?, telefone),
          observacao = COALESCE(?, observacao),
          updated_at = CURRENT_TIMESTAMP
        WHERE ummense_uuid = ?
        RETURNING *
      `, [tipo, nome_cliente, nome_loja, data_inaug, telefone, observacao, payload.uuid]);

      const updated = result.rows[0];
      console.log('🔄 Implantação ATUALIZADA via webhook! ID:', updated.id);
      return res.status(200).json({ success: true, action: 'updated', id: updated.id });
    }

    // ─── INSERT: Cria novo registro ───
    const result = await runWrite(`
      INSERT INTO implantacoes
        (tipo, nome_cliente, nome_loja, data_inauguracao,
         responsavel_tecnico, telefone, observacao, status, ummense_uuid)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'parado', ?)
      RETURNING *
    `, [tipo, nome_cliente, nome_loja, data_inaug, '', telefone, observacao, payload.uuid]);

    const novo = result.rows[0];
    console.log('✅ Implantação CRIADA via webhook! ID:', novo.id);
    return res.status(201).json({ success: true, action: 'created', id: novo.id });

  } catch (err) {
    console.error('❌ Erro ao processar webhook Ummense:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── ROTA RAIZ: redireciona para login ───────────────────────────
app.get('/', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.redirect('/index.html');
  }
  res.redirect('/login.html');
});

// ─── INICIAR ─────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor iniciado com sucesso!`);
    console.log(`   Porta:   ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Falha ao inicializar banco de dados:', err);
  process.exit(1);
});

