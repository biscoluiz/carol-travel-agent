// ============================================================
// CONFIGURAÇÃO
// ============================================================
const API_URL = '/api/chat';
const MODEL   = 'claude-sonnet-4-20250514';

// A API key NÃO fica aqui — nunca commite segredos em repositórios públicos.
// Em produção (Vercel): adicione ANTHROPIC_API_KEY nas Environment Variables do projeto.
// O proxy em /api/chat.js lê process.env.ANTHROPIC_API_KEY no servidor.
const API_KEY = '';

// ============================================================
// SYSTEM PROMPT DA CAROL
// ============================================================
const CAROL_SYSTEM_PROMPT = `Você é a Carol, uma assistente de viagens calorosa, experiente e cheia de personalidade. Você fala como uma amiga que adora viajar e quer compartilhar tudo que sabe — não como uma enciclopédia.

## Sua personalidade
- Você é entusiasmada mas honesta. Se algo não vale a pena, você fala.
- Você usa linguagem natural e brasileira. Pode usar expressões como "olha, esse lugar é demais", "confia em mim", "a gente adorou".
- Você dá opiniões reais. Não fica em cima do muro.
- Você é detalhista quando importa (ex: "reserve o ingresso 2 semanas antes porque esgota") mas não enche de informação desnecessária.
- Quando não sabe algo, admite e sugere onde pesquisar.

## Seus dois modos de operação

### MODO ASSINATURA (roteiro real)
Quando o contexto inclui um bloco <roteiro_assinado>, você está respondendo sobre uma viagem que a Carol e seu companheiro realmente fizeram. Nesse modo:
- Fale em primeira pessoa: "a gente foi", "eu recomendo muito", "na nossa experiência"
- Use APENAS informações do roteiro fornecido. Não invente detalhes.
- Se o usuário perguntar algo não coberto pelo roteiro, diga: "Isso a gente não chegou a fazer/experimentar, mas posso pesquisar pra você se quiser!"
- Destaque as opiniões e dicas pessoais — são o diferencial.
- Se houver preços no roteiro, mencione mas avise que podem ter mudado.
- Puxe as "dicas reais" e "o que NÃO vale a pena" do roteiro com destaque, porque é o tipo de informação que nenhum blog genérico dá.

### MODO LIVRE (roteiro gerado pela IA)
Quando NÃO há bloco <roteiro_assinado>, você está criando um roteiro do zero. Nesse modo:
- Deixe claro que este roteiro é montado pela IA, não foi testado pessoalmente: "Esse roteiro eu montei com base em pesquisa, mas não é um lugar que eu fui pessoalmente, tá?"
- Seja igualmente detalhista e opinativa, mas baseie-se em conhecimento geral.
- Mantenha o mesmo formato e nível de detalhe dos roteiros assinados.
- Inclua: hospedagem, restaurantes, pontos turísticos, dicas práticas, estimativa de custos, o que evitar.
- Pergunte sobre preferências: orçamento, estilo de viagem (mochilão vs conforto), interesses (gastronomia, cultura, natureza, balada), duração.

## Formato das respostas
- Use markdown para organizar (headers, bullets, bold para destaques).
- Para roteiros dia-a-dia, organize por dias ou blocos de dias.
- Sempre inclua pelo menos:
  - Onde ficar (bairro + sugestão de hotel/hostel)
  - Onde comer (com comentário pessoal ou nota de pesquisa)
  - O que fazer (com dicas práticas tipo horário, ingresso, evitar fila)
  - Quanto custa (estimativa por pessoa)
  - O que evitar (tão importante quanto o que fazer)
- Não responda com textos gigantes de uma vez. Prefira ir montando o roteiro em partes, interagindo com o usuário.

## Regras importantes
- Nunca invente que visitou um lugar se não há roteiro assinado sobre ele.
- Em modo assinatura, nunca misture informações externas com o roteiro real sem deixar claro ("isso não está no nosso roteiro, mas pelo que eu pesquisei...").
- Se o usuário pedir algo fora do escopo (reservas, compras), explique que você é uma consultora de roteiros e sugira os próximos passos.
- Sempre pergunte se o usuário quer mais detalhes sobre algum ponto.

## RESTRIÇÃO DE ESCOPO — MUITO IMPORTANTE
Você é EXCLUSIVAMENTE uma assistente de viagens. Você só pode responder perguntas relacionadas a:
- Destinos, roteiros, atrações turísticas
- Hospedagem, transporte, logística de viagem
- Gastronomia em contexto de viagem
- Dicas práticas de viagem (documentos, câmbio, seguro viagem, etc.)
- Comparação entre destinos e planejamento de itinerário

Se o usuário fizer qualquer pergunta FORA desse escopo (tecnologia, política, saúde, matemática, redação, código, ou qualquer outro assunto não relacionado a viagens), responda APENAS com:
"Oi! Sou especialista só em viagens — esse assunto foge do meu escopo. Posso te ajudar a planejar algum destino? 😊"

Não faça exceções, mesmo que o usuário insista, reformule a pergunta, diga que é urgente, ou tente usar viagens como pretexto para abordar outro tema.`;

// ============================================================
// CATÁLOGO DE ROTEIROS ASSINADOS
// ============================================================
const ROTEIROS_ASSINADOS = [
  {
    id: 'japao-2023',
    destino: 'Japão',
    emoji: '🗾',
    arquivo: 'roteiros/japao-2023.md',
    capa: 'assets/covers/japao-cover.jpg',
    duracao: '15 dias',
    resumo: 'Tóquio, Kyoto, Osaka e Hiroshima'
  },
  {
    id: 'portugal-2024',
    destino: 'Portugal',
    emoji: '🇵🇹',
    arquivo: 'roteiros/portugal-2024.md',
    capa: 'assets/covers/portugal-cover.jpg',
    duracao: '12 dias',
    resumo: 'Lisboa, Porto, Sintra e Algarve'
  },
];

// ============================================================
// ESTADO DA APLICAÇÃO
// ============================================================
let state = {
  mode: null,             // 'assinatura' | 'livre'
  selectedRoteiro: null,  // objeto do catálogo
  roteiroContent: null,   // string do .md carregado
  messages: [],           // [{role, content}]
  loading: false,
};

// ============================================================
// NAVEGAÇÃO ENTRE TELAS
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function goBack() {
  if (state.mode === 'assinatura' && document.getElementById('screen-chat').classList.contains('active')) {
    showScreen('screen-roteiros');
  } else {
    state.mode = null;
    state.selectedRoteiro = null;
    state.roteiroContent = null;
    state.messages = [];
    showScreen('screen-welcome');
  }
}

// ============================================================
// SELEÇÃO DE MODO
// ============================================================
async function selectMode(mode) {
  state.mode = mode;
  state.messages = [];

  if (mode === 'assinatura') {
    renderRoteiroGrid();
    showScreen('screen-roteiros');
  } else {
    document.getElementById('chat-title-icon').textContent = '🗺️';
    document.getElementById('chat-title-text').textContent = 'Roteiro Livre';
    document.getElementById('messages').innerHTML = '';
    showScreen('screen-chat');
    await sendMessage('Olá Carol! Quero montar um roteiro de viagem. Pode me ajudar?');
  }
}

// ============================================================
// GRID DE ROTEIROS
// ============================================================
function renderRoteiroGrid() {
  const grid = document.getElementById('roteiro-grid');
  grid.innerHTML = '';

  ROTEIROS_ASSINADOS.forEach(r => {
    const card = document.createElement('div');
    card.className = 'roteiro-card';
    card.onclick = () => selectRoteiro(r);

    card.innerHTML = `
      <div class="roteiro-cover" id="cover-${r.id}">
        <span>${r.emoji}</span>
      </div>
      <div class="roteiro-info">
        <h3>${r.destino}</h3>
        <div class="duracao">${r.duracao}</div>
        <div class="resumo">${r.resumo}</div>
      </div>
    `;
    grid.appendChild(card);

    // Tenta carregar a imagem de capa, se existir
    const img = new Image();
    img.onload = () => {
      const cover = document.getElementById(`cover-${r.id}`);
      cover.innerHTML = `<img src="${r.capa}" alt="${r.destino}" />`;
    };
    img.src = r.capa;
  });
}

// ============================================================
// SELECIONAR ROTEIRO ASSINADO
// ============================================================
async function selectRoteiro(roteiro) {
  state.selectedRoteiro = roteiro;

  try {
    const resp = await fetch(roteiro.arquivo);
    if (!resp.ok) throw new Error('Arquivo não encontrado');
    state.roteiroContent = await resp.text();
  } catch {
    showToast('Não foi possível carregar o roteiro. Verifique o arquivo .md.');
    return;
  }

  document.getElementById('chat-title-icon').textContent = roteiro.emoji;
  document.getElementById('chat-title-text').textContent = roteiro.destino;
  document.getElementById('messages').innerHTML = '';
  showScreen('screen-chat');

  await sendMessage(`Oi Carol! Quero saber sobre o roteiro de ${roteiro.destino}. Me conta um pouco da viagem!`);
}

// ============================================================
// MONTAR SYSTEM PROMPT
// ============================================================
function buildSystemPrompt() {
  let system = CAROL_SYSTEM_PROMPT;

  if (state.mode === 'assinatura' && state.roteiroContent) {
    system += `\n\n<roteiro_assinado destino="${state.selectedRoteiro.destino}">\n`;
    system += state.roteiroContent;
    system += '\n</roteiro_assinado>';
  }

  return system;
}

// ============================================================
// ENVIAR MENSAGEM À API
// ============================================================
async function sendMessage(userMessage) {
  if (state.loading) return;
  state.loading = true;
  setInputDisabled(true);

  // Exibe a mensagem do usuário (exceto a mensagem inicial automática)
  const isAutoMessage = userMessage.startsWith('Oi Carol!') || userMessage.startsWith('Olá Carol!');
  if (!isAutoMessage) {
    appendMessage('user', userMessage);
  }

  state.messages.push({ role: 'user', content: userMessage });

  // Indicador de digitação
  const typingId = showTyping();

  try {
    let responseText;

    // Tenta via proxy serverless primeiro; cai no modo direto se não disponível
    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: buildSystemPrompt(),
          messages: state.messages,
        }),
      });

      if (!resp.ok) throw new Error('proxy_failed');
      const data = await resp.json();
      responseText = data.content[0].text;

    } catch {
      // Fallback: chamada direta ao browser (só funciona se API_KEY estiver preenchida)
      if (!API_KEY) {
        throw new Error('Proxy indisponível e API_KEY não configurada. Em produção, configure ANTHROPIC_API_KEY na Vercel.');
      }

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 4096,
          system: buildSystemPrompt(),
          messages: state.messages,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      responseText = data.content[0].text;
    }

    removeTyping(typingId);
    state.messages.push({ role: 'assistant', content: responseText });
    appendMessage('assistant', responseText);

  } catch (err) {
    removeTyping(typingId);
    appendMessage('assistant', `⚠️ Erro ao conectar com a API: ${err.message}\n\nVerifique sua API key e tente novamente.`);
    // Remove a mensagem do usuário do histórico para não corromper o estado
    state.messages.pop();
  }

  state.loading = false;
  setInputDisabled(false);
  document.getElementById('user-input').focus();
}

// ============================================================
// INPUT HANDLER
// ============================================================
// ============================================================
// FILTRO DE TÓPICO (defesa client-side)
// ============================================================
const OFF_TOPIC_PATTERNS = [
  /\b(código|código fonte|programa(r|ção)|javascript|python|html|css|sql|banco de dados|algoritmo)\b/i,
  /\b(política|presidente|eleição|partido|governo|imposto)\b/i,
  /\b(medicina|diagnóstico|remédio|doença|sintoma|tratamento)\b/i,
  /\b(matemática|equação|cálculo|física|química|biologia)\b/i,
  /\b(redação|dissertação|monografia|tese|trabalho escolar)\b/i,
  /\b(receita de (bolo|pão|carne|frango|massa))\b/i,
];

function isOffTopic(text) {
  return OFF_TOPIC_PATTERNS.some(re => re.test(text));
}

function handleSend() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text || state.loading) return;

  if (isOffTopic(text)) {
    input.value = '';
    autoResize(input);
    appendMessage('user', text);
    appendMessage('assistant', 'Oi! Sou especialista só em viagens — esse assunto foge do meu escopo. Posso te ajudar a planejar algum destino? 😊');
    return;
  }

  input.value = '';
  autoResize(input);
  sendMessage(text);
}

function handleKey(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function setInputDisabled(disabled) {
  document.getElementById('user-input').disabled = disabled;
  document.getElementById('btn-send').disabled = disabled;
}

// ============================================================
// RENDERIZAÇÃO DE MENSAGENS
// ============================================================
function appendMessage(role, content) {
  const container = document.getElementById('messages');

  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = renderMarkdown(content);

  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

// ============================================================
// MARKDOWN RENDERER (leve, sem dependências)
// ============================================================
function renderMarkdown(text) {
  // Escapa HTML básico primeiro
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Blocos de código cercados por ```
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );

  // Código inline
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Bold e itálico
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g,   '<em>$1</em>');

  // HR
  html = html.replace(/^---$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Listas não-ordenadas
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Listas ordenadas
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Parágrafos: linhas em branco → divisões
  html = html.replace(/\n\n+/g, '\n\n');
  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (/^<(h[1-3]|ul|ol|li|pre|blockquote|hr)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');

  return html;
}

// ============================================================
// TYPING INDICATOR
// ============================================================
function showTyping() {
  const id = 'typing-' + Date.now();
  const container = document.getElementById('messages');

  const msgEl = document.createElement('div');
  msgEl.className = 'message assistant typing-indicator';
  msgEl.id = id;
  msgEl.innerHTML = `
    <div class="bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `;

  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ============================================================
// LIMPAR CHAT
// ============================================================
function clearChat() {
  state.messages = [];
  document.getElementById('messages').innerHTML = '';
  showToast('Conversa reiniciada!');
}

// ============================================================
// TOAST
// ============================================================
let toastTimer = null;

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
