(() => {
  'use strict';

  const C = window.Comum;

  const estado = {
    autenticado: false,
    dados: null,
    carregando: false,
    salvandoSorteio: false,
  };

  const refs = {
    telaLogin: document.getElementById('tela-login'),
    formLogin: document.getElementById('form-login'),
    senha: document.getElementById('senha'),
    erroLogin: document.getElementById('erro-login'),
    btnEntrar: document.getElementById('btn-entrar'),

    painel: document.getElementById('painel-admin'),
    btnSair: document.getElementById('btn-sair-admin'),
    linkSite: document.getElementById('link-site'),
    btnCopiarSite: document.getElementById('btn-copiar-site'),
    adminStatus: document.getElementById('admin-status'),
    statTotal: document.getElementById('stat-total'),
    statSorteio: document.getElementById('stat-sorteio'),
    statLinks: document.getElementById('stat-links'),
    avisoSenhaPadrao: document.getElementById('aviso-senha-padrao'),
    btnAtualizar: document.getElementById('btn-atualizar-admin'),
    btnSortear: document.getElementById('btn-sortear'),
    btnResetarSorteio: document.getElementById('btn-resetar-sorteio'),
    btnCopiarLinks: document.getElementById('btn-copiar-links'),
    btnBaixarTxt: document.getElementById('btn-baixar-txt'),
    listaAdmin: document.getElementById('lista-admin'),
    adminVazio: document.getElementById('admin-vazio'),
    secaoResultados: document.getElementById('secao-resultados'),
    resultadosAdmin: document.getElementById('resultados-admin'),
    btnCopiarPares: document.getElementById('btn-copiar-pares'),
  };

  /* =========================================================
     Utilidades
     ========================================================= */

  function participantes() {
    return estado.dados?.participantes ?? [];
  }

  function acharParticipante(id) {
    return participantes().find((p) => p.id === id) || null;
  }

  function nomeDe(id) {
    return acharParticipante(id)?.nome ?? 'Pessoa removida';
  }

  function tokenValido(token) {
    return typeof token === 'string' && /^[a-f0-9]{48}$/i.test(token);
  }

  function linkDoParticipante(participante) {
    return tokenValido(participante?.token) ? C.linkPessoal(participante.token) : '';
  }

  function dataCurta(iso) {
    return iso ? C.formatarData(iso) : 'data desconhecida';
  }

  function hojeParaArquivo() {
    const agora = new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
  }

  function baixarArquivo(nome, texto) {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* =========================================================
     Login / sessão
     ========================================================= */

  function mostrarLogin() {
    estado.autenticado = false;
    estado.dados = null;

    refs.telaLogin.hidden = false;
    refs.painel.hidden = true;
    refs.btnSair.hidden = true;
    refs.erroLogin.textContent = '';
    refs.senha.value = '';
    refs.senha.removeAttribute('aria-invalid');
    refs.senha.focus({ preventScroll: true });
  }

  function mostrarPainel() {
    estado.autenticado = true;
    refs.telaLogin.hidden = true;
    refs.painel.hidden = false;
    refs.btnSair.hidden = false;
  }

  async function carregarEstado(silencioso = false) {
    if (estado.carregando) return;
    estado.carregando = true;

    try {
      const dados = await C.api('/api/admin/estado');
      estado.dados = dados;
      mostrarPainel();
      renderTudo();
    } catch (erro) {
      if (erro.status === 401) {
        mostrarLogin();
        if (!silencioso) {
          C.toast('Sua sessão terminou. Entre novamente.', 'aviso');
        }
      } else if (!silencioso) {
        C.toast(erro.message, 'erro');
      }
    } finally {
      estado.carregando = false;
    }
  }

  async function entrar(evento) {
    evento.preventDefault();
    refs.erroLogin.textContent = '';
    refs.senha.removeAttribute('aria-invalid');

    const senha = refs.senha.value;
    if (!senha) {
      refs.erroLogin.textContent = 'Digite a senha do organizador.';
      refs.senha.setAttribute('aria-invalid', 'true');
      refs.senha.focus();
      return;
    }

    refs.btnEntrar.disabled = true;
    refs.btnEntrar.textContent = 'Entrando...';

    try {
      await C.api('/api/admin/login', { metodo: 'POST', corpo: { senha } });
      refs.senha.value = '';
      C.toast('Bem-vindo ao painel do organizador.');
      await carregarEstado();
    } catch (erro) {
      refs.erroLogin.textContent = erro.message;
      refs.senha.setAttribute('aria-invalid', 'true');
      refs.senha.focus();
      refs.senha.select();
    } finally {
      refs.btnEntrar.disabled = false;
      refs.btnEntrar.textContent = 'Entrar';
    }
  }

  async function sair() {
    try {
      await C.api('/api/admin/logout', { metodo: 'POST', corpo: {} });
    } catch {
      /* mesmo que falhe, esquecemos a interface */
    }

    mostrarLogin();
    C.toast('Você saiu do painel.');
  }

  /* =========================================================
     Renderização
     ========================================================= */

  function renderTudo() {
    if (!estado.dados) return;

    const total = participantes().length;
    const sorteio = estado.dados.sorteio;
    const config = estado.dados.config || {};

    refs.linkSite.value = C.linkSite();

    refs.statTotal.textContent = String(total);
    refs.statSorteio.textContent = sorteio ? 'feito' : 'pendente';
    refs.statLinks.textContent = String(
      participantes().filter((p) => tokenValido(p.token)).length
    );

    refs.avisoSenhaPadrao.hidden = config.senhaPadrao !== true;

    const partes = [C.pluralPessoas(total)];
    if (sorteio) {
      partes.push(`sorteio em ${dataCurta(sorteio.em)}`);
    } else if (total >= (config.maxParticipantes || 100)) {
      partes.push('lista cheia');
    } else {
      partes.push('inscrições abertas');
    }
    refs.adminStatus.textContent = partes.join(' · ');

    refs.btnSortear.textContent = sorteio ? 'Refazer sorteio' : 'Realizar sorteio';
    refs.btnSortear.disabled = total < 2 || estado.salvandoSorteio;
    refs.btnResetarSorteio.hidden = !sorteio;

    refs.btnCopiarLinks.disabled = total === 0;
    refs.btnBaixarTxt.disabled = total === 0;

    refs.adminVazio.hidden = total > 0;
    refs.listaAdmin.hidden = total === 0;

    renderLista();
    renderResultados();
  }

  function renderLista() {
    refs.listaAdmin.innerHTML = participantes()
      .map((pessoa) => {
        const cor = C.matiz(pessoa.nome);
        const link = linkDoParticipante(pessoa);

        const itens = pessoa.itens.length
          ? `<ul class="tags" aria-label="Lista de presentes de ${C.escapar(pessoa.nome)}">${pessoa.itens
              .map((item) => `<li class="tag">${C.escapar(item)}</li>`)
              .join('')}</ul>`
          : '<p class="admin-pessoa__sem-itens">Nenhum item informado.</p>';

        return `
          <li class="admin-pessoa" data-id="${C.escapar(pessoa.id)}">
            <div class="admin-pessoa__topo">
              <span
                class="avatar"
                aria-hidden="true"
                style="background:hsl(${cor} 55% 93%);color:hsl(${cor} 48% 32%)"
              >${C.escapar(C.iniciais(pessoa.nome))}</span>

              <div class="admin-pessoa__info">
                <p class="admin-pessoa__nome">${C.escapar(pessoa.nome)}</p>
                <p class="admin-pessoa__detalhe">📍 ${C.escapar(pessoa.endereco)}</p>
                <p class="admin-pessoa__detalhe admin-pessoa__detalhe--fraco">
                  Entrou em ${C.escapar(dataCurta(pessoa.criadoEm))}
                </p>
                ${itens}
              </div>

              <div class="admin-pessoa__acoes">
                <button
                  class="icone"
                  type="button"
                  data-acao="copiar"
                  data-id="${C.escapar(pessoa.id)}"
                  title="Copiar link pessoal"
                  aria-label="Copiar link pessoal de ${C.escapar(pessoa.nome)}"
                  ${link ? '' : 'disabled'}
                >🔗</button>
                <button
                  class="icone"
                  type="button"
                  data-acao="editar"
                  data-id="${C.escapar(pessoa.id)}"
                  title="Editar dados"
                  aria-label="Editar dados de ${C.escapar(pessoa.nome)}"
                >✏️</button>
                <button
                  class="icone"
                  type="button"
                  data-acao="novo-link"
                  data-id="${C.escapar(pessoa.id)}"
                  title="Gerar novo link pessoal"
                  aria-label="Gerar novo link pessoal de ${C.escapar(pessoa.nome)}"
                >♻️</button>
                <button
                  class="icone icone--perigo"
                  type="button"
                  data-acao="remover"
                  data-id="${C.escapar(pessoa.id)}"
                  title="Remover participante"
                  aria-label="Remover ${C.escapar(pessoa.nome)}"
                >🗑️</button>
              </div>
            </div>
          </li>
        `;
      })
      .join('');
  }

  function renderResultados() {
    const sorteio = estado.dados?.sorteio;

    if (!sorteio) {
      refs.secaoResultados.hidden = true;
      refs.resultadosAdmin.innerHTML = '';
      return;
    }

    refs.secaoResultados.hidden = false;

    refs.resultadosAdmin.innerHTML = `
      <p class="resultado-data">
        Sorteio realizado em ${C.escapar(dataCurta(sorteio.em))}.
      </p>
      ${sorteio.pares
        .map(
          (par) => `
            <div class="tabela-pares__linha">
              <span class="tabela-pares__de">${C.escapar(nomeDe(par.de))}</span>
              <span class="tabela-pares__seta" aria-hidden="true">→</span>
              <span class="tabela-pares__para">${C.escapar(nomeDe(par.para))}</span>
            </div>
          `
        )
        .join('')}
    `;
  }

  /* =========================================================
     Ações dos participantes
     ========================================================= */

  async function copiarLink(participante) {
    const link = linkDoParticipante(participante);
    if (!link) {
      C.toast('Esta pessoa ainda não tem um link pessoal válido.', 'aviso');
      return;
    }

    const sucesso = await C.copiar(link);
    C.toast(
      sucesso
        ? `Link de ${participante.nome} copiado.`
        : 'Não foi possível copiar automaticamente.',
      sucesso ? 'ok' : 'erro'
    );
  }

  function abrirEditor(participante) {
    const temSorteio = Boolean(estado.dados?.sorteio);

    C.abrirModal(
      `
        <div class="editor">
          <h2 id="modal-titulo">Editar participante</h2>

          ${
            temSorteio
              ? `<div class="aviso aviso--atencao editor__aviso">
                   <span class="aviso__icone" aria-hidden="true">⚠️</span>
                   <div>
                     O sorteio atual será <strong>apagado</strong> ao salvar esta
                     alteração. Você precisará sortear novamente depois.
                   </div>
                 </div>`
              : ''
          }

          <form id="form-editor" novalidate autocomplete="off">
            <div class="form-grade">
              <div class="campo">
                <label for="editor-nome">Nome</label>
                <input
                  id="editor-nome"
                  type="text"
                  maxlength="60"
                  value="${C.escapar(participante.nome)}"
                  aria-describedby="erro-editor-nome"
                  required
                />
                <p class="erro" id="erro-editor-nome" role="alert"></p>
              </div>

              <div class="campo">
                <label for="editor-endereco">Endereço de entrega</label>
                <input
                  id="editor-endereco"
                  type="text"
                  maxlength="160"
                  value="${C.escapar(participante.endereco)}"
                  aria-describedby="erro-editor-endereco"
                  required
                />
                <p class="erro" id="erro-editor-endereco" role="alert"></p>
              </div>
            </div>

            <div class="campo campo--itens">
              <div class="campo__linha">
                <label id="rotulo-itens-editor">
                  Lista de presentes <span class="dica">até 3 itens</span>
                </label>
                <button
                  class="btn btn--fantasma btn--pequeno"
                  type="button"
                  id="btn-add-item-editor"
                >+ item</button>
              </div>
              <div id="itens-editor" class="itens" role="group" aria-labelledby="rotulo-itens-editor"></div>
            </div>

            <div class="editor__acoes">
              <button class="btn btn--primario" type="submit" id="btn-salvar-editor">
                Salvar alterações
              </button>
              <button class="btn btn--fantasma" type="button" data-fechar>Cancelar</button>
            </div>
          </form>
        </div>
      `,
      () => {
        const form = document.getElementById('form-editor');
        const nomeInput = document.getElementById('editor-nome');
        const enderecoInput = document.getElementById('editor-endereco');
        const erroNome = document.getElementById('erro-editor-nome');
        const erroEndereco = document.getElementById('erro-editor-endereco');
        const btnSalvar = document.getElementById('btn-salvar-editor');

        const lista = C.criarListaDeItens({
          container: document.getElementById('itens-editor'),
          botao: document.getElementById('btn-add-item-editor'),
          max: 3,
          valores: participante.itens,
          prefixo: 'editor-item',
        });

        lista.render();

        const limparErros = () => {
          erroNome.textContent = '';
          erroEndereco.textContent = '';
          [nomeInput, enderecoInput].forEach((input) => {
            input.closest('.campo').classList.remove('campo--invalido');
            input.removeAttribute('aria-invalid');
          });
        };

        [nomeInput, enderecoInput].forEach((input) => {
          input.addEventListener('input', () => {
            input.closest('.campo').classList.remove('campo--invalido');
            input.removeAttribute('aria-invalid');
          });
        });

        form.addEventListener('submit', async (evento) => {
          evento.preventDefault();
          limparErros();

          const nome = C.limparEspacos(nomeInput.value);
          const endereco = C.limparEspacos(enderecoInput.value);
          const itens = lista.getItens();

          if (nome.length < 2) {
            erroNome.textContent = 'Digite o nome da pessoa.';
            nomeInput.closest('.campo').classList.add('campo--invalido');
            nomeInput.setAttribute('aria-invalid', 'true');
            nomeInput.focus();
            return;
          }

          if (!endereco) {
            erroEndereco.textContent = 'Digite o endereço de entrega.';
            enderecoInput.closest('.campo').classList.add('campo--invalido');
            enderecoInput.setAttribute('aria-invalid', 'true');
            enderecoInput.focus();
            return;
          }

          btnSalvar.disabled = true;
          btnSalvar.textContent = 'Salvando...';

          try {
            const caminho = `/api/admin/participantes/${encodeURIComponent(
              participante.id
            )}${temSorteio ? '?forcar=1' : ''}`;

            await C.api(caminho, {
              metodo: 'PUT',
              corpo: { nome, endereco, itens },
            });

            C.fecharModal();
            C.toast('Dados atualizados.');
            await carregarEstado(true);
          } catch (erro) {
            if (erro.dados?.campo === 'nome') {
              erroNome.textContent = erro.message;
              nomeInput.closest('.campo').classList.add('campo--invalido');
              nomeInput.setAttribute('aria-invalid', 'true');
            } else if (erro.dados?.campo === 'endereco') {
              erroEndereco.textContent = erro.message;
              enderecoInput.closest('.campo').classList.add('campo--invalido');
              enderecoInput.setAttribute('aria-invalid', 'true');
            } else {
              C.toast(erro.message, 'erro');
            }

            if (erro.status === 401) {
              C.fecharModal();
              mostrarLogin();
            }
          } finally {
            btnSalvar.disabled = false;
            btnSalvar.textContent = 'Salvar alterações';
          }
        });
      }
    );
  }

  async function gerarNovoLink(participante) {
    const confirmado = await C.confirmar({
      titulo: 'Gerar um novo link?',
      mensagem:
        `O link atual de ${participante.nome} deixa de funcionar imediatamente. ` +
        'Use esta opção se alguém perdeu o acesso ao próprio link.',
      rotuloConfirmar: 'Gerar novo link',
      icone: '♻️',
    });

    if (!confirmado) return;

    try {
      const dados = await C.api(
        `/api/admin/participantes/${encodeURIComponent(participante.id)}/novo-link`,
        { metodo: 'POST', corpo: {} }
      );

      const link = C.linkPessoal(dados.token);
      const copiou = await C.copiar(link);

      C.toast(
        copiou
          ? `Novo link de ${participante.nome} copiado.`
          : 'Novo link gerado. Copie na lista de links.',
        copiou ? 'ok' : 'aviso'
      );

      await carregarEstado(true);
    } catch (erro) {
      C.toast(erro.message, 'erro');
      if (erro.status === 401) mostrarLogin();
    }
  }

  async function removerParticipante(participante) {
    const temSorteio = Boolean(estado.dados?.sorteio);

    const confirmado = await C.confirmar({
      titulo: `Remover ${participante.nome}?`,
      mensagem: temSorteio
        ? 'O sorteio atual será apagado junto com a pessoa. Você precisará sortear novamente.'
        : 'A pessoa sai da lista e o link pessoal dela deixa de funcionar.',
      rotuloConfirmar: 'Remover',
      destrutivo: true,
      icone: '🗑️',
    });

    if (!confirmado) return;

    try {
      const caminho = `/api/admin/participantes/${encodeURIComponent(
        participante.id
      )}${temSorteio ? '?forcar=1' : ''}`;

      await C.api(caminho, { metodo: 'DELETE' });
      C.toast(`${participante.nome} foi removido(a).`);
      await carregarEstado(true);
    } catch (erro) {
      C.toast(erro.message, 'erro');
      if (erro.status === 401) mostrarLogin();
    }
  }

  async function aoClicarNaLista(evento) {
    const botao = evento.target.closest('button[data-acao]');
    if (!botao || botao.disabled) return;

    const participante = acharParticipante(botao.dataset.id);
    if (!participante) {
      C.toast('Essa pessoa não está mais na lista.', 'aviso');
      await carregarEstado(true);
      return;
    }

    if (botao.dataset.acao === 'copiar') {
      await copiarLink(participante);
    } else if (botao.dataset.acao === 'editar') {
      abrirEditor(participante);
    } else if (botao.dataset.acao === 'novo-link') {
      await gerarNovoLink(participante);
    } else if (botao.dataset.acao === 'remover') {
      await removerParticipante(participante);
    }
  }

  /* =========================================================
     Sorteio e relatórios
     ========================================================= */

  async function sortear() {
    const total = participantes().length;

    if (total < 2) {
      C.toast('São necessárias pelo menos 2 pessoas para realizar o sorteio.', 'aviso');
      return;
    }

    let refazer = false;

    if (estado.dados?.sorteio) {
      const confirmado = await C.confirmar({
        titulo: 'Refazer o sorteio?',
        mensagem:
          'O resultado atual será substituído por um novo sorteio. Todos os links pessoais continuam funcionando.',
        rotuloConfirmar: 'Refazer sorteio',
        icone: '🎲',
      });

      if (!confirmado) return;
      refazer = true;
    }

    estado.salvandoSorteio = true;
    refs.btnSortear.disabled = true;
    refs.btnSortear.textContent = 'Sorteando...';

    try {
      await C.api('/api/admin/sorteio', {
        metodo: 'POST',
        corpo: refazer ? { refazer: true } : {},
      });

      await carregarEstado(true);
      C.toast('Sorteio realizado! Cada pessoa já pode ver o seu par.', 'ok');
      C.confete();
    } catch (erro) {
      C.toast(erro.message, 'erro');
      if (erro.status === 401) mostrarLogin();
    } finally {
      estado.salvandoSorteio = false;
      if (estado.dados) renderTudo();
    }
  }

  async function apagarSorteio() {
    const confirmado = await C.confirmar({
      titulo: 'Apagar o sorteio?',
      mensagem:
        'O resultado e os pares serão apagados. As inscrições voltam a ficar abertas e você poderá sortear de novo.',
      rotuloConfirmar: 'Apagar sorteio',
      destrutivo: true,
      icone: '🧹',
    });

    if (!confirmado) return;

    try {
      await C.api('/api/admin/sorteio', { metodo: 'DELETE' });
      await carregarEstado(true);
      C.toast('Sorteio apagado. As inscrições estão abertas novamente.');
    } catch (erro) {
      C.toast(erro.message, 'erro');
      if (erro.status === 401) mostrarLogin();
    }
  }

  function textoDosLinks() {
    const linhas = [
      'Links pessoais — Amigo Secreto',
      `Site do grupo: ${C.linkSite()}`,
      '',
    ];

    for (const pessoa of participantes()) {
      const link = linkDoParticipante(pessoa);
      linhas.push(`${pessoa.nome}: ${link || '(sem link válido)'}`);
    }

    linhas.push('', 'Cada pessoa deve guardar o próprio link. Não compartilhe o link dos outros.');
    return linhas.join('\n');
  }

  async function copiarLinks() {
    if (!participantes().length) {
      C.toast('Ainda não há participantes.', 'aviso');
      return;
    }

    const sucesso = await C.copiar(textoDosLinks());
    C.toast(
      sucesso ? 'Links pessoais copiados.' : 'Não foi possível copiar automaticamente.',
      sucesso ? 'ok' : 'erro'
    );
  }

  function textoDoRelatorio() {
    const linhas = [
      'AMIGO SECRETO',
      `Site do grupo: ${C.linkSite()}`,
      estado.dados?.sorteio
        ? `Sorteio realizado em ${dataCurta(estado.dados.sorteio.em)}`
        : 'Sorteio ainda não realizado',
      '',
      `PARTICIPANTES (${participantes().length})`,
      '',
    ];

    participantes().forEach((pessoa, indice) => {
      linhas.push(`${indice + 1}. ${pessoa.nome}`);
      linhas.push(`   Endereço: ${pessoa.endereco}`);
      linhas.push(
        pessoa.itens.length
          ? `   Presentes: ${pessoa.itens.join(' | ')}`
          : '   Presentes: não informados'
      );
      linhas.push(`   Link pessoal: ${linkDoParticipante(pessoa) || '(sem link)'}`);
      linhas.push('');
    });

    if (estado.dados?.sorteio) {
      linhas.push('RESULTADO DO SORTEIO', '');
      for (const par of estado.dados.sorteio.pares) {
        linhas.push(`${nomeDe(par.de)} -> ${nomeDe(par.para)}`);
      }
      linhas.push('');
    }

    return linhas.join('\n');
  }

  function baixarTxt() {
    if (!participantes().length) {
      C.toast('Ainda não há participantes.', 'aviso');
      return;
    }

    baixarArquivo(`amigo-secreto-${hojeParaArquivo()}.txt`, textoDoRelatorio());
    C.toast('Arquivo gerado para download.');
  }

  async function copiarPares() {
    const sorteio = estado.dados?.sorteio;
    if (!sorteio) {
      C.toast('O sorteio ainda não foi realizado.', 'aviso');
      return;
    }

    const texto = sorteio.pares
      .map((par) => `${nomeDe(par.de)} -> ${nomeDe(par.para)}`)
      .join('\n');

    const sucesso = await C.copiar(texto);
    C.toast(
      sucesso ? 'Pares copiados.' : 'Não foi possível copiar automaticamente.',
      sucesso ? 'ok' : 'erro'
    );
  }

  /* =========================================================
     Eventos
     ========================================================= */

  refs.formLogin.addEventListener('submit', entrar);
  refs.btnSair.addEventListener('click', sair);
  refs.listaAdmin.addEventListener('click', aoClicarNaLista);
  refs.btnSortear.addEventListener('click', sortear);
  refs.btnResetarSorteio.addEventListener('click', apagarSorteio);
  refs.btnCopiarLinks.addEventListener('click', copiarLinks);
  refs.btnBaixarTxt.addEventListener('click', baixarTxt);
  refs.btnCopiarPares.addEventListener('click', copiarPares);

  refs.btnCopiarSite.addEventListener('click', async () => {
    const sucesso = await C.copiar(refs.linkSite.value);
    C.toast(
      sucesso ? 'Link do grupo copiado.' : 'Selecione e copie o link exibido.',
      sucesso ? 'ok' : 'aviso'
    );
  });

  refs.btnAtualizar.addEventListener('click', async () => {
    refs.btnAtualizar.disabled = true;
    try {
      await carregarEstado();
      C.toast('Painel atualizado.');
    } finally {
      refs.btnAtualizar.disabled = false;
    }
  });

  refs.senha.addEventListener('input', () => {
    refs.erroLogin.textContent = '';
    refs.senha.removeAttribute('aria-invalid');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && estado.autenticado) {
      carregarEstado(true);
    }
  });

  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (!estado.autenticado) return;
    if (document.getElementById('modal')?.hidden === false) return;
    carregarEstado(true);
  }, 30000);

  /* =========================================================
     Início
     ========================================================= */

  async function iniciar() {
    refs.linkSite.value = C.linkSite();

    try {
      const dados = await C.api('/api/admin/sessao');
      if (dados?.autenticado) {
        await carregarEstado();
      } else {
        mostrarLogin();
      }
    } catch (erro) {
      mostrarLogin();
      C.toast(erro.message, 'erro');
    }
  }

  iniciar();
})();
