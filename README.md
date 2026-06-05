# Controle de Implantação de Lojas

Sistema web completo para gerenciamento de inaugurações de novas lojas.

## Funcionalidades

- **Cadastro dinâmico** por tipo: Escalada de Loja, Cliente Novo e Troca de Titularidade
- **Painel de resumo** com cards de total, inaugurações do mês, em andamento e inaugurados
- **Filtros em tempo real** por data, cliente, loja, tipo, responsável e status
- **Status clicável** diretamente na tabela (Parado / Em Andamento / Inaugurado)
- **Edição e exclusão** com modal de confirmação
- **Ordenação** por coluna clicável
- **Toasts de feedback** para todas as ações
- **Design escuro premium** com paleta laranja/navy

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o servidor
node server.js
```

## Acesso

| Modo | URL |
|------|-----|
| Local | http://localhost:3000 |
| Rede local | http://\<IP-da-máquina\>:3000 |

## Acesso Remoto via Cloudflare Tunnel

Para expor o sistema para outros computadores via internet:

```bash
cloudflared tunnel --url http://localhost:3000
```

O Cloudflare fornecerá uma URL pública (ex: `https://xxxx-xxxx.trycloudflare.com`) que pode ser acessada de qualquer lugar.

> **Nota**: O sistema usa caminhos relativos (`/api/...`) em vez de `localhost`, tornando-o compatível com qualquer domínio ou túnel.

## Estrutura do Projeto

```
/ControleInauguracao
  server.js           ← Servidor Express + SQLite
  package.json        ← Dependências Node.js
  implantacoes.db     ← Banco de dados (criado automaticamente)
  README.md
  /public
    index.html        ← Interface principal
    style.css         ← Estilos (tema dark premium)
    app.js            ← Lógica frontend
```

## API REST

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/implantacoes` | Listar todos (suporta filtros via query) |
| POST | `/api/implantacoes` | Criar novo registro |
| PUT | `/api/implantacoes/:id` | Editar registro |
| PATCH | `/api/implantacoes/:id/status` | Atualizar status |
| DELETE | `/api/implantacoes/:id` | Excluir registro |

## Requisitos

- Node.js 16+
- npm
- (Opcional) cloudflared para túnel remoto
