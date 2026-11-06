import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DIR_DADOS = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(RAIZ, 'data');

export const CAMINHO_DADOS = path.join(DIR_DADOS, 'db.json');

/* =========================================================
   Banco remoto (Vercel + Upstash Redis)
   ---------------------------------------------------------
   Na Vercel o disco é somente leitura e as funções não
   compartilham memória. Por isso, quando as variáveis do
   Upstash estão presentes, o banco inteiro é guardado em uma
   chave do Redis (REST), sem precisar de dependências npm.
   ========================================================= */

const URL_REDIS = (
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  ''
).trim();

const TOKEN_REDIS = (
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.KV_REST_API_TOKEN ||
  ''
).trim();

export const BANCO_REMOTO = Boolean(URL_REDIS && TOKEN_REDIS);
export const AMBIENTE_VERCEL = Boolean(process.env.VERCEL);

export const CHAVE_BANCO = process.env.BANCO_CHAVE || 'amigo-secreto:db:v1';
const CHAVE_BLOQUEIO = `${CHAVE_BANCO}:lock`;
const TEMPO_BLOQUEIO_MS = 8000;

export const DESCRICAO_BANCO = BANCO_REMOTO ? 'Upstash Redis (remoto)' : CAMINHO_DADOS;

const SCRIPT_LIBERAR_BLOQUEIO = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

function erroBanco(mensagem, causa) {
  const erro = new Error(mensagem);
  erro.status = 503;
  erro.exposto = true;
  if (causa) erro.cause = causa;
  return erro;
}

async function comandoRedis(comando) {
  let resposta;
  try {
    resposta = await fetch(URL_REDIS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN_REDIS}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(comando),
      cache: 'no-store',
    });
  } catch (causa) {
    throw erroBanco(
      'Não foi possível conectar ao banco de dados. Confira a integração do Upstash Redis na Vercel.',
      causa
    );
  }

  const texto = await resposta.text();
  let dados = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = null;
  }

  if (!resposta.ok || (dados && dados.error)) {
    throw erroBanco(
      'O banco de dados recusou a operação. Confira as variáveis do Upstash Redis.'
    );
  }

  return dados ? dados.result : null;
}

/* =========================================================
   Estrutura do banco
   ========================================================= */

function dadosVazios() {
  return {
    versao: 1,
    criadoEm: new Date().toISOString(),
    segredo: randomBytes(32).toString('hex'),
    participantes: [],
    sorteio: null,
  };
}

function normalizarEstrutura(dados) {
  if (!dados || typeof dados !== 'object') throw new Error('formato inválido');
  if (!Array.isArray(dados.participantes)) throw new Error('lista de participantes inválida');
  if (!dados.segredo || typeof dados.segredo !== 'string') {
    dados.segredo = randomBytes(32).toString('hex');
  }
  if (dados.sorteio && !Array.isArray(dados.sorteio.pares)) {
    dados.sorteio = null;
  }
  return dados;
}

async function interpretarBruto(bruto) {
  try {
    return normalizarEstrutura(JSON.parse(bruto));
  } catch (erro) {
    const chaveBackup = `${CHAVE_BANCO}:corrompido:${Date.now()}`;
    try {
      await comandoRedis(['SET', chaveBackup, bruto]);
    } catch {
      /* melhor esforço: ainda criamos uma base nova */
    }
    console.error(
      `[store] O banco remoto estava inválido (${erro.message}). ` +
        `Uma cópia foi guardada na chave ${chaveBackup}.`
    );
    const dados = dadosVazios();
    await salvarDados(dados);
    return dados;
  }
}

/* =========================================================
   Arquivo local (Docker / execução local)
   ========================================================= */

function garantirPastaDados() {
  fs.mkdirSync(DIR_DADOS, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(DIR_DADOS, 0o700);
  } catch {
    /* melhor esforço em sistemas que não suportam chmod */
  }
}

function exigirDiscoLocal() {
  if (AMBIENTE_VERCEL) {
    throw erroBanco(
      'A Vercel não tem disco persistente. Adicione a integração "Upstash Redis" ' +
        'ao projeto e faça um novo deploy para o banco funcionar.'
    );
  }
}

async function carregarArquivo() {
  exigirDiscoLocal();
  garantirPastaDados();

  let bruto;
  try {
    bruto = await fsp.readFile(CAMINHO_DADOS, 'utf8');
  } catch (erro) {
    if (erro.code !== 'ENOENT') throw erro;
    const dados = dadosVazios();
    await salvarArquivo(dados);
    return dados;
  }

  try {
    return normalizarEstrutura(JSON.parse(bruto));
  } catch (erro) {
    const backup = `${CAMINHO_DADOS}.corrompido-${Date.now()}`;
    try {
      await fsp.rename(CAMINHO_DADOS, backup);
    } catch {
      /* se não der para mover, ainda assim cria uma base nova */
    }
    console.error(
      `[store] O arquivo de dados estava inválido (${erro.message}). ` +
        `Uma cópia foi guardada em ${backup}.`
    );
    const dados = dadosVazios();
    await salvarArquivo(dados);
    return dados;
  }
}

async function salvarArquivo(dados) {
  exigirDiscoLocal();
  garantirPastaDados();

  const temporario = path.join(
    DIR_DADOS,
    `.db.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`
  );

  await fsp.writeFile(temporario, JSON.stringify(dados, null, 2), { mode: 0o600 });
  await fsp.rename(temporario, CAMINHO_DADOS);

  try {
    await fsp.chmod(CAMINHO_DADOS, 0o600);
  } catch {
    /* melhor esforço em sistemas que não suportam chmod */
  }
}

/* =========================================================
   Interface pública (usada pelo servidor)
   ========================================================= */

export async function carregarDados() {
  if (!BANCO_REMOTO) return carregarArquivo();

  const bruto = await comandoRedis(['GET', CHAVE_BANCO]);

  if (bruto === null || bruto === undefined) {
    const dados = dadosVazios();
    const criado = await comandoRedis([
      'SET',
      CHAVE_BANCO,
      JSON.stringify(dados),
      'NX',
    ]);

    if (criado === 'OK') return dados;

    const existente = await comandoRedis(['GET', CHAVE_BANCO]);
    if (existente === null || existente === undefined) {
      throw erroBanco('Não foi possível inicializar o banco de dados.');
    }
    return interpretarBruto(existente);
  }

  return interpretarBruto(bruto);
}

export async function salvarDados(dados) {
  if (!BANCO_REMOTO) {
    await salvarArquivo(dados);
    return;
  }

  await comandoRedis(['SET', CHAVE_BANCO, JSON.stringify(dados)]);
}

/**
 * Serializa operações de escrita entre instâncias na Vercel.
 * O bloqueio é um SET NX com expiração; se o processo morrer,
 * o TTL libera a chave automaticamente.
 */
export async function comBloqueioExclusivo(tarefa) {
  if (!BANCO_REMOTO) return tarefa();

  const dono = randomUUID();
  const limite = Date.now() + 5000;

  while (Date.now() < limite) {
    const resultado = await comandoRedis([
      'SET',
      CHAVE_BLOQUEIO,
      dono,
      'NX',
      'PX',
      String(TEMPO_BLOQUEIO_MS),
    ]);

    if (resultado === 'OK') {
      try {
        return await tarefa();
      } finally {
        try {
          await comandoRedis([
            'EVAL',
            SCRIPT_LIBERAR_BLOQUEIO,
            '1',
            CHAVE_BLOQUEIO,
            dono,
          ]);
        } catch {
          /* o TTL de 8s libera o bloqueio de qualquer forma */
        }
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 40 + Math.floor(Math.random() * 80))
    );
  }

  throw erroBanco(
    'O sistema está ocupado no momento. Tente novamente em alguns segundos.'
  );
}
