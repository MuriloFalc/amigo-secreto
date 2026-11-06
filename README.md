# 🎁 Amigo Secreto

Aplicação completa de amigo secreto para compartilhar por link:

- Qualquer pessoa com o link do site pode se cadastrar com **nome, endereço e até 3 presentes**.
- Cada participante recebe um **link pessoal secreto** para ver o próprio par depois do sorteio.
- O **painel do organizador** é protegido por senha e permite editar/remover pessoas, gerar novos links, sortear, refazer o sorteio e baixar um relatório.
- O sorteio acontece no servidor e garante que **ninguém tira a si mesmo** e que **cada pessoa tira e é tirada exatamente uma vez**.
- Inscrições são encerradas automaticamente após o sorteio.

O app não tem dependências npm. Localmente (e no Docker) ele usa um arquivo JSON; na Vercel ele usa o **Upstash Redis** automaticamente, porque o disco das funções serverless não é persistente.

---

## Rodar localmente

Requisito: **Node.js 20 ou superior**.

```bash
cd amigo-secreto
npm start
```

O site abre em `http://localhost:3000` e o painel em `http://localhost:3000/admin`.

Por padrão a senha do organizador é `12344321`. Para trocar:

```bash
SENHA_ORGANIZADOR="minha-senha-forte" npm start
```

Também é possível usar um arquivo `.env` como base:

```bash
cp .env.example .env
# edite o .env e depois rode:
npm run start:env
```

> O comando `start:env` usa o suporte nativo do Node a `--env-file` (Node 20.6+). Sem esse comando, o app lê apenas variáveis de ambiente já exportadas no shell.

Para desenvolvimento com recarga automática:

```bash
npm run dev
# ou, com .env:
npm run dev:env
```

---

## Como usar

1. Abra o painel em `/admin` e entre com a senha.
2. Copie o **link para o grupo** e envie para as pessoas.
3. Cada pessoa se cadastra e recebe um **link pessoal**. Ela deve guardar esse link.
4. Quando todos entrarem, o organizador clica em **Realizar sorteio**.
5. Cada participante abre o próprio link e clica em **Revelar meu amigo secreto**.

O organizador consegue ver todos os dados e os pares no painel, copiar todos os links pessoais e baixar um `.txt` com o relatório completo.

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP do servidor (ignorada na Vercel). |
| `DATA_DIR` | `./data` | Pasta do `db.json` no modo local/Docker. Ignorada quando há Redis. |
| `SENHA_ORGANIZADOR` | `12344321` | Senha do painel. **Troque antes de publicar.** |
| `MAX_PARTICIPANTES` | `100` | Limite de pessoas na lista. |
| `UPSTASH_REDIS_REST_URL` | — | URL REST do Upstash (injetada pela integração da Vercel). |
| `UPSTASH_REDIS_REST_TOKEN` | — | Token REST do Upstash (injetado pela integração da Vercel). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | — | Nomes antigos da integração; também são aceitos. |
| `BANCO_CHAVE` | `amigo-secreto:db:v1` | Nome da chave no Redis, se quiser isolar mais de um grupo. |

Se a senha padrão estiver em uso, o servidor mostra um aviso no log e o painel exibe um alerta.

---

## Segurança

- A senha do organizador fica somente no servidor e é comparada em tempo constante.
- A sessão do painel usa cookie `HttpOnly`, `SameSite=Strict`, assinado com HMAC e válido por 12 horas.
- O cookie recebe `Secure` automaticamente quando o acesso é HTTPS.
- Tentativas de login são limitadas a 8 falhas por IP a cada 15 minutos.
- Cadastros são limitados a 30 por IP por hora.
- Cada participante tem um token secreto de 48 caracteres. Sem esse token, ninguém vê o par de outra pessoa.
- A lista pública mostra apenas os nomes; endereços e presentes aparecem só para o organizador e para quem tirou a pessoa.
- Respostas de API não são armazenadas em cache e há cabeçalhos de segurança (CSP, `X-Frame-Options`, `nosniff`, etc.).

Recomendações para produção:

1. Use **HTTPS** (a Vercel já fornece; Railway, Render, Fly.io e a maioria dos proxies também).
2. Defina uma senha forte em `SENHA_ORGANIZADOR`.
3. No modo Docker/VPS com arquivo JSON, mantenha **uma única instância** do app.
4. Na Vercel, o bloqueio no Redis permite várias instâncias ao mesmo tempo, mas não é preciso escalar para um amigo secreto.
5. Faça backup do `db.json` (Docker) ou exporte o Redis (Vercel) de tempos em tempos.
6. Os limites de tentativas de login/cadastro são mantidos em memória por instância. Na Vercel eles são uma proteção extra, não uma garantia absoluta entre instâncias.

---

## Deploy na Vercel (recomendado)

A Vercel serve o site por HTTPS, com link público, e executa as APIs como funções serverless. Como funções serverless não têm disco persistente, os dados ficam no **Upstash Redis** (integração oficial da Vercel, com plano gratuito suficiente para um amigo secreto).

### 1. Suba o projeto para o GitHub

```bash
cd amigo-secreto
git init
git add .
git commit -m "Amigo secreto pronto para a Vercel"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/amigo-secreto.git
git push -u origin main
```

### 2. Importe na Vercel

1. Acesse [vercel.com/new](https://vercel.com/new) e importe o repositório.
2. Framework: **Other** (não precisa de build).
3. Ainda não clique em deploy se for adicionar o banco agora — ou faça o primeiro deploy e configure depois.

### 3. Adicione o banco (Upstash Redis)

1. No projeto da Vercel, abra **Storage** (ou **Marketplace**) → **Upstash** → **Redis**.
2. Crie um banco gratuito e conecte ao projeto.
3. A integração injeta automaticamente as variáveis:
   - `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`, ou
   - `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
4. O app detecta qualquer um dos pares. Não é preciso instalar nada.

### 4. Defina a senha do organizador

Em **Settings → Environment Variables**, adicione:

```text
SENHA_ORGANIZADOR = uma-senha-forte-sua
```

Opcional: `MAX_PARTICIPANTES` (padrão `100`).

### 5. Faça o deploy (ou um novo deploy)

Variáveis adicionadas depois de um deploy só valem no próximo. Clique em **Redeploy**.

Depois acesse:

- Site: `https://seu-projeto.vercel.app`
- Painel: `https://seu-projeto.vercel.app/admin`

Pronto: é só compartilhar o link do site com o grupo.

### O que já está configurado

- `api/index.js` expõe o mesmo servidor Node como função serverless.
- `vercel.json` manda as rotas para essa função e inclui a pasta `public/` no bundle.
- `lib/store.js` detecta o Upstash e troca o arquivo JSON por uma chave no Redis.
- As escritas usam um bloqueio no Redis, então duas pessoas cadastrando ao mesmo tempo não perdem dados.
- A sessão do organizador continua funcionando porque o segredo HMAC fica no próprio banco.

> **Importante:** sem a integração do Upstash, a Vercel responde com um erro 503 explicando que falta o banco. O site estático até abre, mas cadastro/sorteio não funcionam.

---

## Deploy com Docker

Build e execução:

```bash
docker build -t amigo-secreto .
docker run -d \
  --name amigo-secreto \
  -p 3000:3000 \
  -e SENHA_ORGANIZADOR="minha-senha-forte" \
  -v amigo-secreto-data:/data \
  --restart unless-stopped \
  amigo-secreto
```

O volume `amigo-secreto-data` guarda o `db.json` e sobrevive a reinícios e atualizações da imagem.

Com Docker Compose:

```bash
SENHA_ORGANIZADOR="minha-senha-forte" docker compose up -d --build
```

O `docker-compose.yml` já monta o volume persistente em `/data`.

---

## Deploy em plataformas

### Railway

1. Crie um projeto a partir deste repositório; o Railway detecta o `Dockerfile`.
2. Em **Variables**, defina `SENHA_ORGANIZADOR` (e, se quiser, `MAX_PARTICIPANTES`).
3. Em **Volumes**, crie um volume e monte em **`/data`**.
4. Gere o domínio público e acesse `/admin`.

Sem o volume em `/data`, o `db.json` é perdido a cada redeploy.

### Render

1. Crie um **Web Service** do tipo Docker apontando para este repositório.
2. Defina `SENHA_ORGANIZADOR` nas variáveis de ambiente.
3. Adicione um **Persistent Disk** montado em `/data` (1 GB é mais que suficiente).
4. Use a porta `3000` ou deixe o Render definir `PORT`.

### Fly.io

```bash
fly launch --no-deploy
fly volumes create amigo_secreto_dados --size 1
```

No `fly.toml`, garanta o mount do volume:

```toml
[mounts]
  source = "amigo_secreto_dados"
  destination = "/data"
```

Depois:

```bash
fly secrets set SENHA_ORGANIZADOR="minha-senha-forte"
fly deploy
```

### VPS com Docker

1. Instale Docker e Docker Compose.
2. Copie o projeto para a VPS.
3. Rode `SENHA_ORGANIZADOR="..." docker compose up -d --build`.
4. Coloque um proxy reverso (Caddy, Nginx ou Traefik) na frente para terminar o HTTPS.

Exemplo de Caddyfile:

```caddyfile
amigo.seudominio.com {
  reverse_proxy 127.0.0.1:3000
}
```

---

## Backup e restauração

### Vercel (Redis)

O banco inteiro fica em uma chave do Redis, por padrão `amigo-secreto:db:v1`.

- **Backup:** no painel do Upstash, use a opção de export/backup do banco, ou copie o valor da chave com `GET amigo-secreto:db:v1`.
- **Restauração:** grave o JSON de volta na mesma chave antes de abrir o site.
- Se o JSON estiver corrompido, o app guarda uma cópia em `amigo-secreto:db:v1:corrompido-<timestamp>` e começa uma base vazia.

### Docker / local (arquivo)

O banco é o arquivo `DATA_DIR/db.json`.

- **Backup:** copie `db.json` (com o servidor parado ou usando um snapshot do volume).
- **Restauração:** pare o app, substitua o `db.json` e inicie novamente.
- Se o arquivo estiver corrompido, o app guarda uma cópia como `db.json.corrompido-<timestamp>` e começa uma base vazia, registrando o ocorrido no log.

O arquivo é gravado de forma atômica e com permissão `0600`. A pasta de dados tenta usar permissão `0700`.

---

## Estrutura do projeto

```text
amigo-secreto/
├── servidor.js          # servidor HTTP, APIs, autenticação e sorteio
├── api/
│   └── index.js         # entrada da função serverless da Vercel
├── lib/
│   └── store.js         # banco em JSON (local) ou Upstash Redis (Vercel)
├── public/
│   ├── index.html       # página pública
│   ├── app.js           # cadastro, link pessoal e revelação
│   ├── admin.html       # painel do organizador
│   ├── admin.js         # login, edição, sorteio e relatórios
│   ├── comum.js         # funções compartilhadas
│   ├── styles.css       # estilos
│   └── favicon.svg
├── Dockerfile
├── docker-entrypoint.sh  # ajusta o volume e roda como usuário node
├── docker-compose.yml
├── vercel.json          # rotas e arquivos incluídos na função
├── .env.example
└── package.json
```

---

## API resumida

Públicas:

- `GET /api/estado` — nomes e status do sorteio.
- `POST /api/participantes` — cadastro; devolve o token pessoal.
- `GET /api/eu` — dados do próprio participante (header `x-participante-token`).
- `PUT /api/eu` — edita os próprios dados antes do sorteio.
- `GET /api/revelacao` — mostra o próprio par após o sorteio.
- `GET /api/saude` — verificação de saúde (usada pelo Docker).

Do organizador (exigem sessão):

- `POST /api/admin/login` e `POST /api/admin/logout`
- `GET /api/admin/sessao`
- `GET /api/admin/estado`
- `POST /api/admin/sorteio` — body opcional `{ "refazer": true }`
- `DELETE /api/admin/sorteio`
- `PUT /api/admin/participantes/:id` — use `?forcar=1` para apagar o sorteio junto
- `DELETE /api/admin/participantes/:id` — use `?forcar=1` para apagar o sorteio junto
- `POST /api/admin/participantes/:id/novo-link`

---

## Verificações rápidas

```bash
npm run check
curl http://localhost:3000/api/saude
```
