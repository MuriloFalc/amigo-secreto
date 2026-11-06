(() => {
  'use strict';

  const C = window.Comum;
  const CHAVE_TOKEN = 'amigo-secreto:token:v1';

  const estado = {
    token: null,
    eu: null,
    publico: null,
    editando: false,
    jaRevelou: false,
    carregandoPublico: false,
    carregandoEu: false,
  };

  const refs = {
    minhaArea: document.getElementById('minha-area'),
    avisoCadastro: document.getElementById('aviso-cadastro'),
    meuAvatar: document.getElementById('meu-avatar'),
    meuNome: document.getElementById('meu-nome'),
    meuStatus: document.getElementById('meu-status'),
    meuLink: document.getElementById('meu-link'),
    btnCopiarLink: document.getElementById('btn-copiar-link'),
    btnRevelar: document.getElementById('btn-revelar'),
    btnEditarMeusDados: document.getElementById('btn-editar-meus-dados'),
    btnSairDispositivo: document.getElementById('btn-sair-dispositivo'),
    minhaEspera: document.getElementById('minha-espera'),

    participar: document.getElementById('participar'),
    tituloParticipar: document.getElementById('titulo-participar'),
    avisoInscricoes: document.getElementById('aviso-inscricoes'),
    painelCadastro: document.getElementById('painel-cadastro'),
    form: document.getElementById('form'),
    nome: document.getElementById('nome'),
    endereco: document.getElementById('endereco'),
    erroNome: document.getElementById('erro-nome'),
    erroEndereco: document.getElementById('erro-endereco'),
    itens: document.getElementById('itens'),
    btnAddItem: document.getElementById('btn-add-item'),
    btnSalvar: document.getElementById('btn-salvar'),
    btnCancelarEdicao: document.getElementById('btn-cancelar-edicao'),

    contadorLista: document.getElementById('contador-lista'),
    btnAtualizar: document.getElementById('btn-atualizar'),
    lista: document.getElementById('lista'),
    listaVazia: document.getElementById('lista-vazia'),
    statusSorteio: document.getElementById('status-sorteio'),
  };

  const listaItens = C.criarListaDeItens({
    container: refs.itens,
    botao: refs.btnAddItem,
    max: 3,
    valores: [''],
    prefixo: 'item',
  });

  /* =========================================================
     Token pessoal
     ========================================================= */

  function guardarToken(token) {
    try {
      localStorage.setItem(CHAVE_TOKEN, token);
      return true;
    } catch {
      return false;
    }
  }

  function lerTokenSalvo() {
    try {
      return localStorage.getItem(CHAVE_TOKEN);
    } catch {
      return null;
    }
  }

  function removerTokenSalvo() {
    try {
      localStorage.removeItem(CHAVE_TOKEN);
    } catch {
      /* ignorado */
    }
  }

  function inicializarToken() {
    const encontrado = location.hash.match(/^#p=([a-f0-9]{48})$/i);
    const tokenDaUrl = encontrado ? encontrado[1].toLowerCase() : null;

    if (tokenDaUrl) {
      const salvo = guardarToken(tokenDaUrl);
      estado.token = tokenDaUrl;
      if (salvo) {
        history.replaceState(null, '', location.pathname + location.search);
      }
      return;
    }

    const salvo = lerTokenSalvo();
    if (salvo && /^[a-f0-9]{48}$/i.test(salvo)) {
      estado.token = salvo.toLowerCase();
    }
  }

  /* =========================================================
     Estado público
     ========================================================= */

  async function carregarPublico(silencioso = false) {
    if (estado.carregandoPublico) return;
    estado.carregandoPublico = true;

    try {
      const dados = await C.api('/api/estado');
      estado.publico = dados;
      renderPublico();
      renderParticipar();
    } catch (erro) {
      if (!silencioso) C.toast(erro.message, 'erro');
    } finally {
      estado.carregandoPublico = false;
    }
  }

  function renderPublico() {
    const dados = estado.publico;
    if (!dados) return;

    refs.contadorLista.textContent = C.pluralPessoas(dados.total);

    refs.lista.innerHTML = dados.participantes
      .map((pessoa) => {
        const cor = C.matiz(pessoa.nome);
        const souEu = estado.eu?.participante.id === pessoa.id;

        return `
          <li class="pessoa-publica${souEu ? ' pessoa-publica--eu' : ''}">
            <span
              class="avatar"
              aria-hidden="true"
              style="background:hsl(${cor} 55% 93%);color:hsl(${cor} 48% 32%)"
            >${C.escapar(C.iniciais(pessoa.nome))}</span>
            <span class="pessoa-publica__nome">${C.escapar(pessoa.nome)}</span>
            ${souEu ? '<span class="selo-eu">você</span>' : ''}
          </li>
        `;
      })
      .join('');

    refs.lista.hidden = dados.total === 0;
    refs.listaVazia.hidden = dados.total > 0;

    if (dados.sorteio.realizado) {
      refs.statusSorteio.innerHTML =
        '<span class="ponto ponto--ok" aria-hidden="true"></span>' +
        ` Sorteio realizado em ${C.escapar(C.formatarData(dados.sorteio.em))}`;
    } else {
      refs.statusSorteio.innerHTML =
        '<span class="ponto ponto--pendente" aria-hidden="true"></span>' +
        ' Sorteio ainda não realizado';
    }
  }

  /* =========================================================
     Minha área
     ========================================================= */

  async function carregarEu(silencioso = false) {
    if (!estado.token) {
      estado.eu = null;
      render();
      return;
    }
    if (estado.carregandoEu) return;

    estado.carregandoEu = true;

    try {
      const dados = await C.api('/api/eu', { token: estado.token });
      estado.eu = dados;
      render();
    } catch (erro) {
      if (erro.status === 401 || erro.status === 404) {
        esquecerToken();
        if (!silencioso) {
          C.toast('Seu link pessoal não é mais válido. Fale com o organizador.', 'erro');
        }
      } else if (!silencioso) {
        C.toast(erro.message, 'erro');
      }
    } finally {
      estado.carregandoEu = false;
    }
  }

  function render() {
    renderMinhaArea();
    renderParticipar();
  }

  function renderMinhaArea() {
    const eu = estado.eu;

    if (!eu) {
      refs.minhaArea.hidden = true;
      return;
    }

    const pessoa = eu.participante;
    const cor = C.matiz(pessoa.nome);
    const sorteado = eu.sorteio.realizado;

    refs.minhaArea.hidden = false;
    refs.meuNome.textContent = pessoa.nome;
    refs.meuAvatar.textContent = C.iniciais(pessoa.nome);
    refs.meuAvatar.style.background = `hsl(${cor} 55% 93%)`;
    refs.meuAvatar.style.color = `hsl(${cor} 48% 32%)`;
    refs.meuLink.value = C.linkPessoal(estado.token);

    refs.meuStatus.textContent = sorteado ? 'Sorteio realizado' : 'Aguardando sorteio';
    refs.meuStatus.dataset.estado = sorteado ? 'ok' : 'pendente';

    refs.btnRevelar.hidden = !sorteado;
    refs.btnRevelar.textContent = estado.jaRevelou
      ? 'Ver meu amigo secreto novamente'
      : 'Revelar meu amigo secreto';

    refs.btnEditarMeusDados.hidden = sorteado;
    refs.minhaEspera.hidden = sorteado;

    if (!sorteado) {
      refs.minhaEspera.textContent =
        'O sorteio ainda não foi realizado. Assim que o organizador sortear, ' +
        'seu amigo secreto aparece aqui — esta página se atualiza sozinha.';
    }
  }

  /* =========================================================
     Formulário
     ========================================================= */

  function renderParticipar() {
    const identificado = Boolean(estado.eu);
    const dados = estado.publico;
    const sorteado = Boolean(dados?.sorteio?.realizado);
    const aberto = dados?.inscricoesAbertas !== false;

    if (identificado && !estado.editando) {
      refs.participar.hidden = true;
      return;
    }

    refs.participar.hidden = false;
    refs.tituloParticipar.textContent = estado.editando
      ? 'Editar meus dados'
      : 'Quero participar';
    refs.btnSalvar.textContent = estado.editando
      ? 'Salvar alterações'
      : 'Quero participar';
    refs.btnCancelarEdicao.hidden = !estado.editando;

    const indisponivel = !estado.editando && (sorteado || !aberto);

    refs.painelCadastro.hidden = indisponivel;
    refs.avisoInscricoes.hidden = !indisponivel;

    if (indisponivel) {
      refs.avisoInscricoes.textContent = sorteado
        ? 'O sorteio já foi realizado e as inscrições estão encerradas.'
        : 'A lista de participantes está cheia.';
    }
  }

  function limparErros() {
    refs.erroNome.textContent = '';
    refs.erroEndereco.textContent = '';
    [refs.nome, refs.endereco].forEach((input) => {
      input.closest('.campo').classList.remove('campo--invalido');
      input.removeAttribute('aria-invalid');
    });
  }

  function marcarErro(input, elementoErro, mensagem) {
    elementoErro.textContent = mensagem;
    input.closest('.campo').classList.add('campo--invalido');
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function resetarFormulario() {
    refs.form.reset();
    limparErros();
    listaItens.setItens(['']);
  }

  function iniciarEdicao() {
    if (!estado.eu) return;

    estado.editando = true;
    refs.nome.value = estado.eu.participante.nome;
    refs.endereco.value = estado.eu.participante.endereco;
    listaItens.setItens(estado.eu.participante.itens);
    limparErros();

    renderParticipar();
    refs.participar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    refs.nome.focus({ preventScroll: true });
  }

  function cancelarEdicao() {
    estado.editando = false;
    resetarFormulario();
    renderParticipar();
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    limparErros();

    const nome = C.limparEspacos(refs.nome.value);
    const endereco = C.limparEspacos(refs.endereco.value);
    const itens = listaItens.getItens();
    const editando = estado.editando;

    if (nome.length < 2) {
      marcarErro(refs.nome, refs.erroNome, 'Digite o nome da pessoa.');
      return;
    }

    if (!endereco) {
      marcarErro(refs.endereco, refs.erroEndereco, 'Digite o endereço de entrega.');
      return;
    }

    refs.btnSalvar.disabled = true;
    refs.btnSalvar.textContent = editando ? 'Salvando...' : 'Cadastrando...';

    try {
      if (editando) {
        await C.api('/api/eu', {
          metodo: 'PUT',
          token: estado.token,
          corpo: { nome, endereco, itens },
        });

        estado.editando = false;
        resetarFormulario();
        C.toast('Seus dados foram atualizados.');
        await Promise.all([carregarEu(true), carregarPublico(true)]);
      } else {
        const dados = await C.api('/api/participantes', {
          metodo: 'POST',
          corpo: { nome, endereco, itens },
        });

        estado.token = dados.token;
        estado.jaRevelou = false;

        const salvou = guardarToken(dados.token);
        if (!salvou) {
          C.toast(
            'Cadastro feito, mas não conseguimos salvar o link neste navegador. Copie o link abaixo!',
            'aviso'
          );
        }

        refs.avisoCadastro.hidden = false;
        resetarFormulario();

        await Promise.all([carregarEu(true), carregarPublico(true)]);

        C.toast('Cadastro concluído! Guarde o seu link pessoal.');
        refs.minhaArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (erro) {
      if (erro.dados?.campo === 'nome') {
        marcarErro(refs.nome, refs.erroNome, erro.message);
      } else if (erro.dados?.campo === 'endereco') {
        marcarErro(refs.endereco, refs.erroEndereco, erro.message);
      } else {
        C.toast(erro.message, 'erro');
      }

      if (erro.status === 409) {
        if (editando) carregarEu(true);
        else carregarPublico(true);
      }
    } finally {
      refs.btnSalvar.disabled = false;
      renderParticipar();
    }
  }

  /* =========================================================
     Revelação
     ========================================================= */

  function abrirRevelacao(amigo) {
    const eu = estado.eu?.participante;
    if (!eu) return;

    const itens = amigo.itens.length
      ? `<ol>${amigo.itens.map((item) => `<li>${C.escapar(item)}</li>`).join('')}</ol>`
      : '<p>Não informou itens — vale perguntar com carinho. 🙂</p>';

    C.abrirModal(
      `
        <div class="revelacao">
          <p class="revelacao__sobre">O amigo secreto de</p>
          <p class="revelacao__pessoa">${C.escapar(eu.nome)}</p>
          <p class="revelacao__seta">tirou</p>

          <div class="revelacao__alvo">
            <p class="revelacao__alvo-rotulo">amigo secreto</p>
            <p class="revelacao__alvo-nome" id="modal-titulo">${C.escapar(amigo.nome)}</p>
          </div>

          <div class="bloco-info">
            <h3>Endereço para entrega</h3>
            <p>${C.escapar(amigo.endereco || 'Endereço não informado')}</p>
          </div>

          <div class="bloco-info">
            <h3>Lista de presentes</h3>
            ${itens}
          </div>

          <p class="revelacao__dica">
            Anote ou copie antes de fechar: o site esconde o resultado de novo.
          </p>

          <div class="revelacao__acoes">
            <button class="btn btn--primario" type="button" id="btn-copiar-amigo">
              Copiar informações
            </button>
            <button class="btn btn--fantasma" type="button" data-fechar>
              Fechar e esconder
            </button>
          </div>
        </div>
      `,
      () => {
        document.getElementById('btn-copiar-amigo')?.addEventListener('click', async () => {
          const texto =
            `Amigo secreto: ${amigo.nome}\n` +
            `Endereço: ${amigo.endereco || 'não informado'}\n` +
            (amigo.itens.length
              ? `Presentes:\n${amigo.itens.map((item, i) => `${i + 1}. ${item}`).join('\n')}`
              : 'Presentes: não informados');

          const sucesso = await C.copiar(texto);
          C.toast(
            sucesso ? 'Informações copiadas.' : 'Não foi possível copiar automaticamente.',
            sucesso ? 'ok' : 'erro'
          );
        });
      }
    );
  }

  async function revelar() {
    if (!estado.token) return;

    refs.btnRevelar.disabled = true;

    try {
      const dados = await C.api('/api/revelacao', { token: estado.token });
      estado.jaRevelou = true;
      renderMinhaArea();
      abrirRevelacao(dados.amigo);
    } catch (erro) {
      C.toast(erro.message, erro.status === 409 ? 'aviso' : 'erro');
      await carregarEu(true);
    } finally {
      refs.btnRevelar.disabled = false;
    }
  }

  /* =========================================================
     Ações
     ========================================================= */

  function esquecerToken() {
    removerTokenSalvo();
    estado.token = null;
    estado.eu = null;
    estado.editando = false;
    estado.jaRevelou = false;
    refs.avisoCadastro.hidden = true;
    resetarFormulario();
    render();
  }

  async function sairDoDispositivo() {
    const confirmado = await C.confirmar({
      titulo: 'Sair deste dispositivo?',
      mensagem:
        'Você vai precisar do seu link pessoal para voltar. Se ainda não copiou, cancele e copie antes.',
      rotuloConfirmar: 'Sair',
      destrutivo: true,
      icone: '🚪',
    });

    if (!confirmado) return;

    esquecerToken();
    C.toast('Você saiu deste dispositivo.');
    await carregarPublico(true);
  }

  async function copiarMeuLink() {
    const sucesso = await C.copiar(refs.meuLink.value);
    C.toast(
      sucesso ? 'Link pessoal copiado.' : 'Selecione e copie o link exibido.',
      sucesso ? 'ok' : 'aviso'
    );
  }

  /* =========================================================
     Eventos
     ========================================================= */

  refs.form.addEventListener('submit', aoEnviar);
  refs.btnRevelar.addEventListener('click', revelar);
  refs.btnEditarMeusDados.addEventListener('click', iniciarEdicao);
  refs.btnCancelarEdicao.addEventListener('click', cancelarEdicao);
  refs.btnCopiarLink.addEventListener('click', copiarMeuLink);
  refs.btnSairDispositivo.addEventListener('click', sairDoDispositivo);

  refs.btnAtualizar.addEventListener('click', async () => {
    refs.btnAtualizar.disabled = true;
    try {
      await Promise.all([carregarPublico(), estado.token ? carregarEu(true) : Promise.resolve()]);
      C.toast('Lista atualizada.');
    } finally {
      refs.btnAtualizar.disabled = false;
    }
  });

  [refs.nome, refs.endereco].forEach((input) => {
    input.addEventListener('input', () => {
      input.closest('.campo').classList.remove('campo--invalido');
      input.removeAttribute('aria-invalid');
      const erro = input === refs.nome ? refs.erroNome : refs.erroEndereco;
      erro.textContent = '';
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    carregarPublico(true);
    if (estado.token) carregarEu(true);
  });

  window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    carregarPublico(true);
    if (estado.token) carregarEu(true);
  }, 20000);

  /* =========================================================
     Início
     ========================================================= */

  async function iniciar() {
    inicializarToken();
    listaItens.render();
    render();
    await Promise.all([carregarPublico(), carregarEu()]);
  }

  iniciar();
})();
