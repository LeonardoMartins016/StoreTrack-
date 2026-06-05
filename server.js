const express = require('express');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'implantacoes.db');

// ─── INICIALIZAR sql.js COM PERSISTÊNCIA ────────────────────────
let db;
let SQL;

async function initDB() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('📂 Banco de dados carregado:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('🆕 Novo banco de dados criado:', DB_PATH);
  }

  // Criar tabela se não existir
  db.run(`
    CREATE TABLE IF NOT EXISTS implantacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      nome_cliente TEXT,
      nome_cliente_antigo TEXT,
      nome_cliente_novo TEXT,
      nome_loja TEXT,
      data_inauguracao TEXT NOT NULL,
      responsavel_tecnico TEXT NOT NULL,
      observacao TEXT,
      telefone TEXT,
      status TEXT NOT NULL DEFAULT 'parado',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  salvarDB();
}

// Persiste o banco em disco após cada escrita
function salvarDB() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) {
    console.error('Erro ao salvar banco:', e.message);
  }
}

// ─── HELPERS sql.js ─────────────────────────────────────────────
// Converte resultado sql.js em array de objetos
function toRows(stmt) {
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function runWrite(sql, params = []) {
  db.run(sql, params);
  salvarDB();
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  return toRows(stmt);
}

function getOne(sql, params = []) {
  const rows = getAll(sql, params);
  return rows[0] || null;
}

function lastInsertId() {
  return getOne('SELECT last_insert_rowid() as id').id;
}

// ─── MIDDLEWARES ────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Docs')));

// ─────────────────────────────────────────────────────────────────
// GET /api/implantacoes
// ─────────────────────────────────────────────────────────────────
app.get('/api/implantacoes', (req, res) => {
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
        LOWER(IFNULL(nome_cliente,'')) LIKE ?
        OR LOWER(IFNULL(nome_cliente_antigo,'')) LIKE ?
        OR LOWER(IFNULL(nome_cliente_novo,'')) LIKE ?
      )`;
      const like = `%${nome_cliente.toLowerCase()}%`;
      params.push(like, like, like);
    }
    if (nome_loja) {
      query += ' AND LOWER(IFNULL(nome_loja,\'\')) LIKE ?';
      params.push(`%${nome_loja.toLowerCase()}%`);
    }
    if (tipo) {
      query += ' AND tipo = ?';
      params.push(tipo);
    }
    if (responsavel) {
      query += ' AND LOWER(IFNULL(responsavel_tecnico,\'\')) LIKE ?';
      params.push(`%${responsavel.toLowerCase()}%`);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const rows = getAll(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/implantacoes
// ─────────────────────────────────────────────────────────────────
app.post('/api/implantacoes', (req, res) => {
  try {
    const {
      tipo, nome_cliente, nome_cliente_antigo, nome_cliente_novo,
      nome_loja, data_inauguracao, responsavel_tecnico,
      observacao, telefone, status
    } = req.body;

    if (!tipo || !data_inauguracao || !responsavel_tecnico) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
    }

    runWrite(`
      INSERT INTO implantacoes
        (tipo, nome_cliente, nome_cliente_antigo, nome_cliente_novo,
         nome_loja, data_inauguracao, responsavel_tecnico,
         observacao, telefone, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    const newId = lastInsertId();
    const novo  = getOne('SELECT * FROM implantacoes WHERE id = ?', [newId]);
    res.status(201).json(novo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/implantacoes/:id
// ─────────────────────────────────────────────────────────────────
app.put('/api/implantacoes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    const {
      tipo, nome_cliente, nome_cliente_antigo, nome_cliente_novo,
      nome_loja, data_inauguracao, responsavel_tecnico,
      observacao, telefone, status
    } = req.body;

    runWrite(`
      UPDATE implantacoes SET
        tipo = ?, nome_cliente = ?, nome_cliente_antigo = ?, nome_cliente_novo = ?,
        nome_loja = ?, data_inauguracao = ?, responsavel_tecnico = ?,
        observacao = ?, telefone = ?, status = ?,
        updated_at = datetime('now','localtime')
      WHERE id = ?
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

    const updated = getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/implantacoes/:id/status
// ─────────────────────────────────────────────────────────────────
app.patch('/api/implantacoes/:id/status', (req, res) => {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    const valid = ['parado', 'em_andamento', 'inaugurado'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const existing = getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    runWrite(`
      UPDATE implantacoes
      SET status = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `, [status, id]);

    const updated = getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /api/implantacoes/:id
// ─────────────────────────────────────────────────────────────────
app.delete('/api/implantacoes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = getOne('SELECT * FROM implantacoes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Registro não encontrado.' });

    runWrite('DELETE FROM implantacoes WHERE id = ?', [id]);
    res.json({ success: true, id: Number(id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── INICIAR ─────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor iniciado com sucesso!`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Rede:    http://0.0.0.0:${PORT}`);
    console.log(`\n   Para expor via Cloudflare Tunnel:`);
    console.log(`   cloudflared tunnel --url http://localhost:${PORT}\n`);
  });
}).catch(err => {
  console.error('❌ Falha ao inicializar banco de dados:', err);
  process.exit(1);
});
