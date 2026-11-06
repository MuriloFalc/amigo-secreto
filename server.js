import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  randomBytes,
  randomUUID,
  randomInt,
  createHmac,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import {
  carregarDados,
  salvarDados,
  comBloqueioExclusivo,
  BANCO_REMOTO,
  AMBIENTE_VERCEL,
  DESCRICAO_BANCO,
} from './lib/store.js';

/* =========================================================
   Configuração
   ========================================================= */

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PASTA_PUBLICA = path.join(RAIZ, 'public');

const PORTA = Number(process.env.PORT) || 3000;
const SENHA_ORGANIZADOR = process.env.SENHA_ORGANIZADOR || '12344321';
const SENHA_PADRAO = SENHA_ORGANIZADOR === '12344321';
const MAX_PARTICIPANTES = Math.max(2, Number(process.env.MAX_PARTICIPANTES) || 100);
const MAX_ITENS = 3;
const SESSAO_MS = 12 * 60 * 60 * 1000;
const COOKIE_SESSAO = 'as_sessao';

const LIMITE_CORPO = 32 * 1024;
const MAX_TENTATIVAS_LOGIN = 8;
const JANELA_LOGIN_MS = 15 * 60 * 1000;
const MAX_CADASTROS_POR_IP = 30;
const JANELA_CADASTRO_MS = 60 * 60 * 1000;

let db = null;

if (SENHA_PADRAO) {
  console.warn(
    '\n⚠️  A senha do organizador está usando o padrão "12344321".\n' +
      '   Defina a variável SENHA_ORGANIZADOR antes de publicar o site.\n'
  );
}

async function garantirBanco() {
  if (!db) db = await carregarDados();
  return db;
}

async function recarregarBanco() {
  db = await carregarDados();
  return db;
}

/* =========================================================
   Utilidades gerais
   ========================================================= */

function erroHttp(status, mensagem, campo) {
  const erro = new Error(mensagem);
  erro.status = status;
  erro.campo = campo;
  return erro;
}

function json(res, status, corpo, cabecalhos = {}) {
  const textoResposta = JSON.stringify(corpo);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(textoResposta),
    'Cache-Control': 'no-store',
    ...cabecalhos,
  });
  res.end(textoResposta);
}

function aplicarCabecalhosSeguranca(res) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; " +
      "img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
      "connect-src 'self'; font-src 'self'"
  );
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

function limparEspacos(valor) {
  return typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';
}

function normalizarNome(valor) {
  return limparEspacos(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function iguaisEmTempoConstante(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function novoToken() {
  return randomBytes(24).toString('hex');
}

function agoraIso() {
  return new Date().toISOString();
}

function ipDoPedido(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (typeof encaminhado === 'string' && encaminhado.trim()) {
    return encaminhado.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'desconhecido';
}

function ehHttps(req) {
  const protocolo = req.headers['x-forwarded-proto'];
  if (typeof protocolo === 'string' && protocolo.split(',')[0].trim() === 'https') {
    return true;
  }
  return Boolean(req.socket.encrypted);
}

function verificarOrigem(req) {
  const origem = req.headers.origin;
  if (!origem) return;

  let hostDaOrigem;
  try {
    hostDaOrigem = new URL(origem).host;
  } catch {
    throw erroHttp(403, 'Origem inválida.');
  }

  if (hostDaOrigem !== req.headers.host) {
    throw erroHttp(403, 'Origem não permitida.');
  }
}

/* =========================================================
   Leitura de corpo
   ========================================================= */

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    let abortado = false;

    req.on('data', (pedaco) => {
      if (abortado) return;
      tamanho += pedaco.length;
      if (tamanho > LIMITE_CORPO) {
        abortado = true;
        reject(erroHttp(413, 'Os dados enviados são muito grandes.'));
        return;
      }
      partes.push(pedaco);
    });

    req.on('end', () => {
      if (abortado) return;
      if (partes.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString('utf8')));
      } catch {
        reject(erroHttp(400, 'JSON inválido.'));
      }
    });

    req.on('error', () => {
      if (!abortado) reject(erroHttp(400, 'Não foi possível ler os dados.'));
    });
  });
}

function corpoInterpretadoPeloVercel(req) {
  // Na Vercel, req.body é um getter que já entrega o JSON interpretado.
  // No Node local essa propriedade não existe.
  if (!('body' in req)) return undefined;

  try {
    return req.body;
  } catch {
    throw erroHttp(400, 'JSON inválido.');
  }
}

async function lerCorpoJson(req) {
  const tipo = String(req.headers['content-type'] || '').toLowerCase();
  if (!tipo.includes('application/json')) {
    throw erroHttp(415, 'Envie os dados no formato JSON.');
  }

  let corpo = corpoInterpretadoPeloVercel(req);

  if (Buffer.isBuffer(corpo)) {
    try {
      corpo = JSON.parse(corpo.toString('utf8'));
    } catch {
      throw erroHttp(400, 'JSON inválido.');
    }
  } else if (typeof corpo === 'string') {
    try {
      corpo = JSON.parse(corpo);
    } catch {
      throw erroHttp(400, 'JSON inválido.');
    }
  } else if (corpo === undefined) {
    corpo = await lerCorpo(req);
  }

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroHttp(400, 'Dados inválidos.');
  }
  return corpo;
}

/* =========================================================
   Limites de tentativas
   ========================================================= */

const tentativasLogin = new Map();
const cadastrosPorIp = new Map();

function registroLogin(ip) {
  const agora = Date.now();
  let registro = tentativasLogin.get(ip);

  if (!registro) {
    registro = { falhas: 0, inicio: agora, bloqueadoAte: 0 };
    tentativasLogin.set(ip, registro);
  }

  if (registro.bloqueadoAte && agora >= registro.bloqueadoAte) {
    registro.falhas = 0;
    registro.inicio = agora;
    registro.bloqueadoAte = 0;
  } else if (!registro.bloqueadoAte && agora - registro.inicio > JANELA_LOGIN_MS) {
    registro.falhas = 0;
    registro.inicio = agora;
  }

  return registro;
}

function loginBloqueado(ip) {
  return registroLogin(ip).bloqueadoAte > Date.now();
}

function registrarFalhaLogin(ip) {
  const registro = registroLogin(ip);
  registro.falhas += 1;
  if (registro.falhas >= MAX_TENTATIVAS_LOGIN) {
    registro.bloqueadoAte = Date.now() + JANELA_LOGIN_MS;
  }
}

function limparFalhasLogin(ip) {
  tentativasLogin.delete(ip);
}

function permitirCadastro(ip) {
  const agora = Date.now();
  const recentes = (cadastrosPorIp.get(ip) || []).filter(
    (momento) => agora - momento < JANELA_CADASTRO_MS
  );

  if (recentes.length >= MAX_CADASTROS_POR_IP) {
    cadastrosPorIp.set(ip, recentes);
    return false;
  }

  recentes.push(agora);
  cadastrosPorIp.set(ip, recentes);
  return true;
}

setInterval(() => {
  const agora = Date.now();
  for (const [ip, registro] of tentativasLogin) {
    if (!registro.bloqueadoAte && agora - registro.inicio > JANELA_LOGIN_MS * 2) {
      tentativasLogin.delete(ip);
    }
  }
  for (const [ip, momentos] of cadastrosPorIp) {
    const recentes = momentos.filter((m) => agora - m < JANELA_CADASTRO_MS);
    if (recentes.length === 0) cadastrosPorIp.delete(ip);
    else cadastrosPorIp.set(ip, recentes);
  }
}, 10 * 60 * 1000).unref();

/* =========================================================
   Sessão do organizador
   ========================================================= */

const hashSenha = createHash('sha256').update(SENHA_ORGANIZADOR).digest();

function senhaConfere(candidata) {
  const hashCandidata = createHash('sha256').update(String(candidata)).digest();
  return timingSafeEqual(hashSenha, hashCandidata);
}

function lerCookie(req, nome) {
  const bruto = req.headers.cookie;
  if (!bruto) return null;

  for (const parte of bruto.split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1) continue;
    const chave = parte.slice(0, separador).trim();
    if (chave === nome) {
      return decodeURIComponent(parte.slice(separador + 1).trim());
    }
  }

  return null;
}

function sessaoValida(req) {
  const valor = lerCookie(req, COOKIE_SESSAO);
  if (!valor) return false;

  const [expira, assinatura] = valor.split('.');
  if (!expira || !assinatura || !/^\d+$/.test(expira)) return false;

  const esperada = createHmac('sha256', db.segredo).update(expira).digest('hex');
  if (!iguaisEmTempoConstante(assinatura, esperada)) return false;

  return Number(expira) > Date.now();
}

function definirCookieSessao(req, res) {
  const expira = Date.now() + SESSAO_MS;
  const assinatura = createHmac('sha256', db.segredo).update(String(expira)).digest('hex');
  const valor = `${expira}.${assinatura}`;
  const seguro = ehHttps(req) ? '; Secure' : '';

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_SESSAO}=${valor}; HttpOnly; Path=/; SameSite=Strict; ` +
      `Max-Age=${Math.floor(SESSAO_MS / 1000)}${seguro}`
  );
}

function limparCookieSessao(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_SESSAO}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`
  );
}

function exigirAdmin(req) {
  if (!sessaoValida(req)) {
    throw erroHttp(401, 'Acesso do organizador não autenticado.');
  }
}

/* =========================================================
   Participantes
   ========================================================= */

function acharParticipante(id) {
  const participante = db.participantes.find((p) => p.id === id);
  if (!participante) throw erroHttp(404, 'Participante não encontrado.');
  return participante;
}

function participantePorToken(req) {
  const token = req.headers['x-participante-token'];
  if (typeof token !== 'string' || !/^[a-f0-9]{48}$/i.test(token)) return null;
  return db.participantes.find((p) => p.token === token.toLowerCase()) || null;
}

function exigirParticipante(req) {
  const participante = participantePorToken(req);
  if (!participante) {
    throw erroHttp(401, 'Link pessoal inválido. Peça um novo link ao organizador.');
  }
  return participante;
}

function validarDadosParticipante(corpo, ignorarId) {
  const nome = limparEspacos(corpo.nome);
  const endereco = limparEspacos(corpo.endereco);

  let itens = [];
  if (Array.isArray(corpo.itens)) {
    itens = corpo.itens
      .filter((item) => typeof item === 'string')
      .map((item) => limparEspacos(item))
      .filter(Boolean);
  }

  if (nome.length < 2) {
    throw erroHttp(400, 'Digite o nome da pessoa.', 'nome');
  }
  if (nome.length > 60) {
    throw erroHttp(400, 'O nome pode ter no máximo 60 caracteres.', 'nome');
  }
  if (!endereco) {
    throw erroHttp(400, 'Digite o endereço de entrega.', 'endereco');
  }
  if (endereco.length > 160) {
    throw erroHttp(400, 'O endereço pode ter no máximo 160 caracteres.', 'endereco');
  }
  if (itens.length > MAX_ITENS) {
    throw erroHttp(400, `A lista aceita no máximo ${MAX_ITENS} itens.`, 'itens');
  }
  if (itens.some((item) => item.length > 80)) {
    throw erroHttp(400, 'Cada item pode ter no máximo 80 caracteres.', 'itens');
  }

  const repetido = db.participantes.some(
    (p) => p.id !== ignorarId && normalizarNome(p.nome) === normalizarNome(nome)
  );
  if (repetido) {
    throw erroHttp(409, 'Já existe uma pessoa com esse nome na lista.', 'nome');
  }

  return { nome, endereco, itens };
}

function participantePublico(participante) {
  return {
    id: participante.id,
    nome: participante.nome,
  };
}

/* =========================================================
   Sorteio
   ========================================================= */

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function gerarPares() {
  const total = db.participantes.length;
  if (total < 2) {
    throw erroHttp(400, 'São necessárias pelo menos 2 pessoas para realizar o sorteio.');
  }

  const indices = Array.from({ length: total }, (_, i) => i);

  for (let tentativa = 0; tentativa < 1000; tentativa += 1) {
    const permutacao = embaralhar(indices);
    if (permutacao.every((destino, origem) => destino !== origem)) {
      return permutacao.map((destino, origem) => ({
        de: db.participantes[origem].id,
        para: db.participantes[destino].id,
      }));
    }
  }

  return indices.map((indice) => ({
    de: db.participantes[indice].id,
    para: db.participantes[(indice + 1) % total].id,
  }));
}

/* =========================================================
   Handlers públicos
   ========================================================= */

function estadoPublico(res) {
  json(res, 200, {
    total: db.participantes.length,
    participantes: db.participantes.map(participantePublico),
    sorteio: db.sorteio
      ? { realizado: true, em: db.sorteio.em }
      : { realizado: false, em: null },
    inscricoesAbertas: !db.sorteio && db.participantes.length < MAX_PARTICIPANTES,
  });
}

async function registrarParticipante(req, res) {
  if (!permitirCadastro(ipDoPedido(req))) {
    throw erroHttp(429, 'Muitos cadastros em pouco tempo. Tente novamente mais tarde.');
  }

  if (db.sorteio) {
    throw erroHttp(409, 'O sorteio já foi realizado. As inscrições estão encerradas.');
  }

  if (db.participantes.length >= MAX_PARTICIPANTES) {
    throw erroHttp(409, 'A lista de participantes está cheia.');
  }

  const corpo = await lerCorpoJson(req);
  const dados = validarDadosParticipante(corpo);

  const participante = {
    id: randomUUID(),
    nome: dados.nome,
    endereco: dados.endereco,
    itens: dados.itens,
    token: novoToken(),
    criadoEm: agoraIso(),
  };

  db.participantes.push(participante);
  await salvarDados(db);

  json(res, 201, {
    participante: participantePublico(participante),
    token: participante.token,
  });
}

function meuEstado(req, res) {
  const participante = exigirParticipante(req);

  json(res, 200, {
    participante: {
      id: participante.id,
      nome: participante.nome,
      endereco: participante.endereco,
      itens: participante.itens,
    },
    sorteio: db.sorteio
      ? { realizado: true, em: db.sorteio.em }
      : { realizado: false, em: null },
  });
}

async function atualizarMeuCadastro(req, res) {
  const participante = exigirParticipante(req);

  if (db.sorteio) {
    throw erroHttp(
      409,
      'O sorteio já foi realizado e os dados estão congelados. Fale com o organizador.'
    );
  }

  const corpo = await lerCorpoJson(req);
  const dados = validarDadosParticipante(corpo, participante.id);

  participante.nome = dados.nome;
  participante.endereco = dados.endereco;
  participante.itens = dados.itens;
  await salvarDados(db);

  json(res, 200, {
    ok: true,
    participante: {
      id: participante.id,
      nome: participante.nome,
      endereco: participante.endereco,
      itens: participante.itens,
    },
  });
}

function minhaRevelacao(req, res) {
  const participante = exigirParticipante(req);

  if (!db.sorteio) {
    throw erroHttp(409, 'O sorteio ainda não foi realizado.');
  }

  const par = db.sorteio.pares.find((p) => p.de === participante.id);
  const amigo = par ? db.participantes.find((p) => p.id === par.para) : null;

  if (!amigo) {
    throw erroHttp(409, 'Não foi possível encontrar o seu par. Fale com o organizador.');
  }

  json(res, 200, {
    sorteadoEm: db.sorteio.em,
    amigo: {
      nome: amigo.nome,
      endereco: amigo.endereco,
      itens: amigo.itens,
    },
  });
}

/* =========================================================
   Handlers do organizador
   ========================================================= */

function estadoAdmin(res) {
  json(res, 200, {
    participantes: db.participantes.map((p) => ({
      id: p.id,
      nome: p.nome,
      endereco: p.endereco,
      itens: p.itens,
      token: p.token,
      criadoEm: p.criadoEm,
    })),
    sorteio: db.sorteio ? { em: db.sorteio.em, pares: db.sorteio.pares } : null,
    config: {
      senhaPadrao: SENHA_PADRAO,
      maxParticipantes: MAX_PARTICIPANTES,
    },
  });
}

async function loginOrganizador(req, res) {
  const ip = ipDoPedido(req);

  if (loginBloqueado(ip)) {
    throw erroHttp(429, 'Muitas tentativas incorretas. Aguarde 15 minutos e tente de novo.');
  }

  const corpo = await lerCorpoJson(req);
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';

  // pequena espera para dificultar ataques automatizados
  await new Promise((resolve) => setTimeout(resolve, 180));

  if (!senhaConfere(senha)) {
    registrarFalhaLogin(ip);
    throw erroHttp(401, 'Senha incorreta.');
  }

  limparFalhasLogin(ip);
  definirCookieSessao(req, res);
  json(res, 200, { ok: true });
}

function logoutOrganizador(res) {
  limparCookieSessao(res);
  json(res, 200, { ok: true });
}

function sessaoOrganizador(req, res) {
  json(res, 200, { autenticado: sessaoValida(req) });
}

async function adminRealizarSorteio(req, res) {
  exigirAdmin(req);
  const corpo = await lerCorpoJson(req);

  if (db.sorteio && corpo.refazer !== true) {
    throw erroHttp(409, 'Já existe um sorteio. Confirme para refazê-lo.');
  }

  db.sorteio = {
    em: agoraIso(),
    pares: gerarPares(),
  };
  await salvarDados(db);

  json(res, 200, { ok: true, sorteio: db.sorteio });
}

async function adminApagarSorteio(req, res) {
  exigirAdmin(req);
  db.sorteio = null;
  await salvarDados(db);
  json(res, 200, { ok: true });
}

async function adminAtualizarParticipante(req, res, id, url) {
  exigirAdmin(req);
  const participante = acharParticipante(id);
  const corpo = await lerCorpoJson(req);
  const dados = validarDadosParticipante(corpo, id);

  if (db.sorteio && url.searchParams.get('forcar') !== '1') {
    throw erroHttp(
      409,
      'O sorteio já foi realizado. Confirme para apagar o sorteio e salvar a alteração.'
    );
  }

  if (db.sorteio) db.sorteio = null;

  participante.nome = dados.nome;
  participante.endereco = dados.endereco;
  participante.itens = dados.itens;
  await salvarDados(db);

  json(res, 200, { ok: true });
}

async function adminRemoverParticipante(req, res, id, url) {
  exigirAdmin(req);
  const participante = acharParticipante(id);

  if (db.sorteio && url.searchParams.get('forcar') !== '1') {
    throw erroHttp(
      409,
      'O sorteio já foi realizado. Confirme para apagar o sorteio e remover a pessoa.'
    );
  }

  if (db.sorteio) db.sorteio = null;

  db.participantes = db.participantes.filter((p) => p.id !== participante.id);
  await salvarDados(db);

  json(res, 200, { ok: true });
}

async function adminNovoLink(req, res, id) {
  exigirAdmin(req);
  const participante = acharParticipante(id);

  participante.token = novoToken();
  await salvarDados(db);

  json(res, 200, { ok: true, token: participante.token });
}

/* =========================================================
   Roteamento da API
   ========================================================= */

async function rotearApi(req, res, url) {
  const metodo = req.method;
  const caminho = url.pathname;

  if (metodo !== 'GET' && metodo !== 'HEAD') {
    verificarOrigem(req);
  }

  if (metodo === 'GET' && caminho === '/api/saude') {
    json(res, 200, { ok: true, banco: BANCO_REMOTO ? 'remoto' : 'arquivo' });
    return;
  }

  if (metodo === 'GET' && caminho === '/api/estado') {
    estadoPublico(res);
    return;
  }

  if (metodo === 'POST' && caminho === '/api/participantes') {
    await registrarParticipante(req, res);
    return;
  }

  if (metodo === 'GET' && caminho === '/api/eu') {
    meuEstado(req, res);
    return;
  }

  if (metodo === 'PUT' && caminho === '/api/eu') {
    await atualizarMeuCadastro(req, res);
    return;
  }

  if (metodo === 'GET' && caminho === '/api/revelacao') {
    minhaRevelacao(req, res);
    return;
  }

  if (metodo === 'POST' && caminho === '/api/admin/login') {
    await loginOrganizador(req, res);
    return;
  }

  if (metodo === 'POST' && caminho === '/api/admin/logout') {
    logoutOrganizador(res);
    return;
  }

  if (metodo === 'GET' && caminho === '/api/admin/sessao') {
    sessaoOrganizador(req, res);
    return;
  }

  if (metodo === 'GET' && caminho === '/api/admin/estado') {
    exigirAdmin(req);
    estadoAdmin(res);
    return;
  }

  if (metodo === 'POST' && caminho === '/api/admin/sorteio') {
    await adminRealizarSorteio(req, res);
    return;
  }

  if (metodo === 'DELETE' && caminho === '/api/admin/sorteio') {
    await adminApagarSorteio(req, res);
    return;
  }

  const rotaParticipante = caminho.match(/^\/api\/admin\/participantes\/([^/]+)$/);

  if (rotaParticipante && metodo === 'PUT') {
    await adminAtualizarParticipante(req, res, rotaParticipante[1], url);
    return;
  }

  if (rotaParticipante && metodo === 'DELETE') {
    await adminRemoverParticipante(req, res, rotaParticipante[1], url);
    return;
  }

  const rotaNovoLink = caminho.match(
    /^\/api\/admin\/participantes\/([^/]+)\/novo-link$/
  );

  if (rotaNovoLink && metodo === 'POST') {
    await adminNovoLink(req, res, rotaNovoLink[1]);
    return;
  }

  throw erroHttp(404, 'Rota não encontrada.');
}

/* =========================================================
   Arquivos estáticos
   ========================================================= */

const ARQUIVOS = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/admin', 'admin.html'],
  ['/admin/', 'admin.html'],
  ['/admin.html', 'admin.html'],
  ['/styles.css', 'styles.css'],
  ['/comum.js', 'comum.js'],
  ['/app.js', 'app.js'],
  ['/admin.js', 'admin.js'],
  ['/favicon.svg', 'favicon.svg'],
]);

const TIPOS = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

async function servirEstatico(req, res, caminho) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { erro: 'Método não permitido.' });
    return;
  }

  // Garante que os caminhos relativos da página do organizador resolvam na raiz.
  if (caminho === '/admin/') {
    res.writeHead(308, { Location: '/admin', 'Cache-Control': 'no-store' });
    res.end();
    return;
  }

  const arquivo = ARQUIVOS.get(caminho);

  if (!arquivo) {
    const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
      <title>Página não encontrada</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body style="font-family:system-ui;padding:48px;text-align:center;background:#fbf7f0;color:#241b17">
      <p style="font-size:3rem;margin:0">🎁</p>
      <h1>Página não encontrada</h1>
      <p><a href="/" style="color:#b81f45">Voltar para o amigo secreto</a></p>`;
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : html);
    return;
  }

  const conteudo = await readFile(path.join(PASTA_PUBLICA, arquivo));
  const extensao = path.extname(arquivo);

  res.writeHead(200, {
    'Content-Type': TIPOS.get(extensao) || 'application/octet-stream',
    'Content-Length': conteudo.length,
    'Cache-Control': extensao === '.html' ? 'no-store' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : conteudo);
}

/* =========================================================
   Execução por requisição (Node local e Vercel)
   ========================================================= */

let filaApi = Promise.resolve();

function emFila(tarefa) {
  const resultado = filaApi.then(tarefa, tarefa);
  filaApi = resultado.then(
    () => undefined,
    () => undefined
  );
  return resultado;
}

async function executarApi(req, res, url) {
  if (!BANCO_REMOTO) {
    if (AMBIENTE_VERCEL) {
      const erro = erroHttp(
        503,
        'A Vercel não tem disco persistente. Adicione a integração "Upstash Redis" ' +
          'ao projeto e faça um novo deploy para o banco funcionar.'
      );
      erro.exposto = true;
      throw erro;
    }

    await garantirBanco();
    await rotearApi(req, res, url);
    return;
  }

  const escrita = req.method !== 'GET' && req.method !== 'HEAD';

  // Na Vercel a mesma instância pode atender requisições concorrentes.
  // A fila local evita que uma requisição troque o `db` de outra no meio;
  // o bloqueio no Redis serializa as escritas entre instâncias.
  await emFila(async () => {
    const executar = async () => {
      await recarregarBanco();
      await rotearApi(req, res, url);
    };

    if (escrita) await comBloqueioExclusivo(executar);
    else await executar();
  });
}

export async function tratarRequisicao(req, res) {
  try {
    aplicarCabecalhosSeguranca(res);

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const caminho = decodeURIComponent(url.pathname);

    if (caminho.startsWith('/api/')) {
      await executarApi(req, res, url);
      return;
    }

    await servirEstatico(req, res, caminho);
  } catch (erro) {
    if (res.headersSent) {
      res.end();
      return;
    }

    const status =
      erro instanceof URIError
        ? 400
        : Number.isInteger(erro.status) && erro.status >= 400 && erro.status <= 599
          ? erro.status
          : 500;

    if (status >= 500) {
      console.error('[servidor]', erro);
    }

    let mensagem;
    if (erro instanceof URIError) {
      mensagem = 'Endereço inválido.';
    } else if (status >= 500 && !erro.exposto) {
      mensagem = 'Erro interno do servidor.';
    } else {
      mensagem = erro.message;
    }

    json(res, status, {
      erro: mensagem,
      ...(erro.campo ? { campo: erro.campo } : {}),
    });
  }
}

/* =========================================================
   Servidor local (Docker, npm start e vercel dev)
   ========================================================= */

async function iniciarServidor() {
  await garantirBanco();

  const servidor = http.createServer(tratarRequisicao);

  servidor.listen(PORTA, () => {
    console.log(`\n🎁 Amigo Secreto rodando em http://localhost:${PORTA}`);
    console.log(`   Área do organizador: http://localhost:${PORTA}/admin`);
    console.log(`   Banco de dados: ${DESCRICAO_BANCO}\n`);
  });

  const encerrar = (sinal) => {
    console.log(`\n[servidor] Recebido ${sinal}. Encerrando...`);
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
}

if (!AMBIENTE_VERCEL) {
  await iniciarServidor();
}
