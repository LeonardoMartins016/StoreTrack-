# Controle de Implantação de Lojas

Sistema web completo para gerenciamento de implantações, inaugurações de novas lojas e transição para suporte.

## Funcionalidades Principais

- **Autenticação**: Sistema de login seguro para acessar o painel.
- **Abas de Navegação**:
  - **Implantações**: Gestão completa desde a entrada até a inauguração.
  - **Clientes no Suporte**: Clientes inaugurados há mais de 15 dias que já foram passados para o suporte, com contador de dias.
  - **Responsáveis Técnicos**: Gerenciamento e cadastro de responsáveis.
- **Cadastro dinâmico** por tipo: Escalada de Loja, Cliente Novo e Troca de Titularidade.
- **Módulo de Treinamentos**: Gestão de múltiplos treinamentos para cada cliente, contendo links e temas (exclusivo para Clientes Novos e Troca de Titularidade).
- **Inauguração Detalhada**: Modal com captura de dados essenciais (Servidor, Logins, Emissão de Cupom, e Chamado de Teste).
- **Painel de resumo interativo** com cards (total, inaugurações do mês, em andamento, etc.) com atalho para filtrar a semana.
- **Filtros avançados** em tempo real por período de inauguração, cliente, loja, tipo, responsável e status.
- **Exportação de Relatórios**: Exporta dados da tabela (Implantações ou Suporte) para **Excel (.xlsx)**, **PDF (.pdf)** e **Texto (.txt)**.
- **Status dinâmico e visual**: Parado, Em Andamento e Inaugurado.
- **Toasts de feedback** visuais para todas as ações do usuário.
- **Design escuro premium** com paleta "pandora" responsivo para uso no celular ou desktop.

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar Variáveis de Ambiente
# Crie um arquivo .env na raiz do projeto contendo as credenciais (ex: LOGIN_USER, LOGIN_PASS, SESSION_SECRET)

# 3. Iniciar o servidor
node server.js
```

## Acesso

| Modo | URL |
|------|-----|
| Local | http://localhost:3000 |
| Rede local | http://\<IP-da-máquina\>:3000 |

## Acesso Remoto via Cloudflare Tunnel

Para expor o sistema para outros computadores via internet de forma segura:

```bash
cloudflared tunnel --url http://localhost:3000
```

O Cloudflare fornecerá uma URL pública (ex: `https://xxxx-xxxx.trycloudflare.com`) que pode ser acessada de qualquer lugar, solicitando o login do sistema.

> **Nota**: O sistema usa caminhos relativos (`/api/...`) em vez de `localhost`, tornando-o compatível com qualquer domínio ou túnel.

## Estrutura do Projeto

```
/ControleInauguracao
  .env                ← Variáveis de ambiente (senhas, segredos)
  server.js           ← Servidor Express + SQLite + Auth
  package.json        ← Dependências Node.js
  implantacoes.db     ← Banco de dados (criado automaticamente)
  README.md
  /docs               ← Arquivos estáticos (Frontend)
    index.html        ← Interface principal do sistema
    login.html        ← Tela de Autenticação
    style.css         ← Estilos (tema dark premium responsivo)
    app.js            ← Lógica frontend (API, tabelas, modais)
```

## API REST

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/login` | Realiza login na plataforma |
| GET | `/api/auth/check` | Verifica status da sessão atual |
| GET | `/api/implantacoes` | Listar todas implantações |
| POST | `/api/implantacoes` | Criar novo registro |
| PUT | `/api/implantacoes/:id` | Editar registro existente |
| PATCH | `/api/implantacoes/:id/status` | Atualizar status rápido |
| PATCH | `/api/implantacoes/:id/inaugurar` | Confirmar inauguração detalhada |
| DELETE | `/api/implantacoes/:id` | Excluir registro |
| GET | `/api/implantacoes/:id/treinamentos` | Listar treinamentos da loja |
| PUT | `/api/implantacoes/:id/treinamentos` | Salvar treinamentos |
| GET | `/api/suporte` | Listar clientes no suporte (+15 dias) |
| GET | `/api/responsaveis` | Listar responsáveis técnicos |
| POST | `/api/responsaveis` | Cadastrar novo responsável |

## Requisitos

- Node.js 16+
- npm
- (Opcional) cloudflared para acesso remoto público
