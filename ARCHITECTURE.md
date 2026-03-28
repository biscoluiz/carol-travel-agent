# Carol — Arquitetura da Aplicação

## Visão Geral

Carol é uma assistente de viagens alimentada pelo modelo Claude (Anthropic). Roda como um **site estático** (HTML/CSS/JS puro), sem framework ou build step, hospedado na Vercel. A comunicação com a API da Anthropic passa por uma **serverless function** que mantém a chave de API segura no servidor.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5 + CSS3 + JavaScript (vanilla, sem framework) |
| IA | Anthropic Messages API — `claude-sonnet-4-20250514` |
| Proxy/Backend | Vercel Serverless Function (`/api/chat.js`) |
| Hospedagem | Vercel (plano gratuito) |
| Conteúdo dos roteiros | Arquivos `.md` servidos estaticamente |

---

## Estrutura de Arquivos

```
carol-travel-agent/
│
├── index.html          ← UI completa (3 telas: welcome, grid de roteiros, chat)
├── style.css           ← Design escuro, tema roxo, responsivo
├── app.js              ← Toda a lógica client-side
│
├── api/
│   └── chat.js         ← Proxy serverless (Vercel) — lê ANTHROPIC_API_KEY do servidor
│
├── roteiros/           ← Conteúdo dos roteiros assinados em Markdown
│   ├── japao-2023.md
│   └── portugal-2024.md
│
├── assets/
│   └── covers/         ← Imagens de capa dos cartões de roteiro
│
├── vercel.json         ← Configuração de rotas e timeout da função serverless
└── .gitignore
```

---

## Fluxo de Dados

```
Usuário
  │
  │  1. Escolhe modo (Assinado ou Livre)
  │     └─ Se Assinado: JS faz fetch() do arquivo .md correspondente
  │
  ▼
Frontend (app.js)
  │
  │  2. Monta o payload:
  │     ├─ system prompt (Carol + regras de escopo)
  │     └─ messages (histórico da conversa)
  │        └─ Se modo Assinado: conteúdo do .md injetado no system prompt
  │
  │  3. POST /api/chat  ──────────────────────────────────────────────┐
  │                                                                    │
  ▼                                                                    ▼
Vercel Serverless (/api/chat.js)                              [fallback local]
  │                                                         Chamada direta ao
  │  4. Lê process.env.ANTHROPIC_API_KEY                   browser com API_KEY
  │  5. Encaminha para api.anthropic.com/v1/messages        (só em dev local)
  │
  ▼
Anthropic API
  │
  │  6. Resposta com o texto gerado pela Carol
  │
  ▼
Frontend
  │  7. Renderiza markdown na bolha do chat
  │  8. Adiciona ao histórico de mensagens
```

---

## Modos de Operação da Carol

### Modo Assinatura
- Ativado quando o usuário seleciona um roteiro do catálogo
- O arquivo `.md` correspondente é carregado via `fetch()`
- O conteúdo é injetado no `system prompt` dentro de uma tag `<roteiro_assinado>`
- A Carol responde **apenas** com base nesse conteúdo, em primeira pessoa
- Informações externas ao `.md` só são usadas se explicitamente sinalizadas

### Modo Livre
- Ativado quando o usuário escolhe "Roteiro Livre"
- Nenhum `.md` é carregado; não há tag `<roteiro_assinado>` no prompt
- A Carol gera roteiros com base no conhecimento do modelo
- Sinaliza explicitamente que o roteiro não é baseado em experiência pessoal

---

## Proteção de Escopo (Topic Guard)

A Carol está restrita a responder **apenas sobre viagens**. Há duas camadas:

1. **Client-side** (`isOffTopic()` em `app.js`): regex que bloqueia palavras-chave claramente fora de escopo (código, política, medicina, matemática etc.) antes mesmo de chamar a API — economiza tokens
2. **System prompt**: instrução explícita que proíbe responder sobre qualquer assunto fora do domínio de viagens, mesmo se o usuário reformular a pergunta ou insistir

---

## Segurança da API Key

A `ANTHROPIC_API_KEY` **nunca** aparece no código fonte ou no repositório público.

| Ambiente | Como a key é usada |
|----------|--------------------|
| Produção (Vercel) | Variável de ambiente no dashboard da Vercel → lida por `process.env.ANTHROPIC_API_KEY` dentro de `/api/chat.js` |
| Desenvolvimento local | Opcional: preencher `const API_KEY` em `app.js` localmente (nunca commitar) |

O proxy em `/api/chat.js` é a única peça que tem acesso à key. O frontend nunca vê a chave.

---

## Como Adicionar um Novo Roteiro

1. Crie `roteiros/seu-destino-ano.md` seguindo o formato YAML frontmatter + seções padrão
2. Adicione a imagem de capa em `assets/covers/`
3. Registre o roteiro no array `ROTEIROS_ASSINADOS` em `app.js`:

```js
{
  id: 'seu-destino-ano',
  destino: 'Nome do Destino',
  emoji: '🏝️',
  arquivo: 'roteiros/seu-destino-ano.md',
  capa: 'assets/covers/seu-destino-cover.jpg',
  duracao: 'X dias',
  resumo: 'Cidades visitadas'
}
```

4. Commit + push → Vercel faz deploy automático

---

## Deploy (Vercel)

```
1. Push do repo para o GitHub (sem API key no código)

2. vercel.com → "Add New Project" → importar o repo

3. Settings → Environment Variables:
   ANTHROPIC_API_KEY = sk-ant-...

4. Deploy → URL gerada automaticamente (ex: carol-travel-agent.vercel.app)

5. Pushes futuros na branch main fazem re-deploy automático
```

---

## Limitações Conhecidas

| Limitação | Impacto | Solução futura |
|-----------|---------|---------------|
| Histórico de conversa em memória (sem persistência) | Recarregar a página perde o histórico | IndexedDB ou localStorage |
| Markdown renderizado por parser próprio (sem lib) | Casos edge podem não renderizar corretamente | Integrar `marked.js` |
| Sem autenticação | Qualquer pessoa com o link pode usar | Rate limiting na serverless function |
| Custo por token | Uso intenso gera custo na Anthropic | Cache de respostas para perguntas comuns |
