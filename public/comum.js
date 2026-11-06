(() => {
  'use strict';

  /* =========================================================
     Utilidades de texto
     ========================================================= */

  const escapar = (valor) =>
    String(valor ?? '').replace(/[&<>"']/g, (caractere) => {
      switch (caractere) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });

  const limparEspacos = (valor) =>
    typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : '';

  const normalizar = (texto) =>
    String(texto ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const iniciais = (nome) => {
    const partes = limparEspacos(nome).split(' ').filter(Boolean);
    if (!partes.length) return '?';
    const primeira = partes[0].charAt(0);
    const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
    return `${primeira}${ultima}`.toUpperCase() || '?';
  };

  const matiz = (texto) => {
    let valor = 0;
    const limpo = String(texto ?? '');
    for (let i = 0; i < limpo.length; i += 1) {
      valor = (valor * 31 + limpo.charCodeAt(i)) % 360;
    }
    return valor;
  };

  const formatarData = (iso) => {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return 'data desconhecida';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(data);
  };

  const pluralPessoas = (total) => {
    if (total === 0) return 'ninguém ainda';
    return total === 1 ? '1 pessoa' : `${total} pessoas`;
  };

  /* =========================================================
     Links
     ========================================================= */

  function raizSite() {
    const caminho = location.pathname;
    if (caminho.endsWith('/')) return caminho;
    const partes = caminho.split('/');
    partes.pop();
    return `${partes.join('/')}/`;
  }

  function linkSite() {
    return location.origin + raizSite();
  }

  function linkPessoal(token) {
    return `${linkSite()}#p=${encodeURIComponent(token)}`;
  }

  /* =========================================================
     API
     ========================================================= */

  async function api(caminho, opcoes = {}) {
    const { metodo = 'GET', corpo, token, headers = {}, ...resto } = opcoes;
    const cabecalhos = { ...headers };

    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (token) cabecalhos['x-participante-token'] = token;

    let resposta;
    try {
      resposta = await fetch(caminho, {
        method: metodo,
        credentials: 'same-origin',
        headers: cabecalhos,
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        ...resto,
      });
    } catch {
      const erro = new Error('Não foi possível conectar. Verifique sua internet.');
      erro.status = 0;
      throw erro;
    }

    let dados = null;
    try {
      dados = await resposta.json();
    } catch {
      /* resposta sem corpo JSON */
    }

    if (!resposta.ok) {
      const erro = new Error(dados?.erro || `Erro ${resposta.status}`);
      erro.status = resposta.status;
      erro.dados = dados;
      throw erro;
    }

    return dados;
  }

  /* =========================================================
     Toasts
     ========================================================= */

  function toast(mensagem, tipo = 'ok') {
    const container = document.getElementById('toasts');
    if (!container) return;

    const icone = tipo === 'erro' ? '⚠️' : tipo === 'aviso' ? '💡' : '✓';
    const elemento = document.createElement('div');
    elemento.className = `toast toast--${tipo}`;
    elemento.innerHTML = `<span class="toast__icone" aria-hidden="true">${icone}</span><span></span>`;
    elemento.lastElementChild.textContent = mensagem;
    container.append(elemento);

    while (container.children.length > 3) {
      container.firstElementChild.remove();
    }

    window.setTimeout(() => {
      elemento.style.transition = 'opacity .25s ease, transform .25s ease';
      elemento.style.opacity = '0';
      elemento.style.transform = 'translateY(8px)';
      window.setTimeout(() => elemento.remove(), 280);
    }, 3800);
  }

  /* =========================================================
     Copiar
     ========================================================= */

  async function copiar(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch {
      /* tenta o método alternativo */
    }

    try {
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const sucesso = document.execCommand('copy');
      area.remove();
      return sucesso;
    } catch {
      return false;
    }
  }

  /* =========================================================
     Modal
     ========================================================= */

  let aoFecharAtual = null;
  let ultimoFoco = null;

  function abrirModal(html, aoAbrir, aoFechar) {
    const modal = document.getElementById('modal');
    const caixa = document.getElementById('modal-caixa');
    const conteudo = document.getElementById('modal-conteudo');
    if (!modal || !caixa || !conteudo) return;

    ultimoFoco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    aoFecharAtual = typeof aoFechar === 'function' ? aoFechar : null;

    conteudo.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add('travado');
    caixa.scrollTop = 0;

    const focavel = conteudo.querySelector('input, select, textarea, button, [href]');
    (focavel || caixa.querySelector('.modal__fechar'))?.focus({ preventScroll: true });

    if (typeof aoAbrir === 'function') aoAbrir();
  }

  function fecharModal() {
    const modal = document.getElementById('modal');
    const conteudo = document.getElementById('modal-conteudo');
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    if (conteudo) conteudo.innerHTML = '';
    document.body.classList.remove('travado');

    if (ultimoFoco && document.contains(ultimoFoco)) {
      ultimoFoco.focus({ preventScroll: true });
    }
    ultimoFoco = null;

    const aoFechar = aoFecharAtual;
    aoFecharAtual = null;
    if (aoFechar) aoFechar();
  }

  function configurarModal() {
    const modal = document.getElementById('modal');
    const caixa = document.getElementById('modal-caixa');
    if (!modal || !caixa) return;

    modal.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-fechar]')) fecharModal();
    });

    document.addEventListener('keydown', (evento) => {
      if (modal.hidden) return;

      if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharModal();
        return;
      }

      if (evento.key !== 'Tab') return;

      const focaveis = [...caixa.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )].filter((elemento) => elemento.getClientRects().length > 0);

      if (!focaveis.length) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    });
  }

  function confirmar({
    titulo,
    mensagem,
    rotuloConfirmar = 'Confirmar',
    destrutivo = false,
    icone = '🎲',
  }) {
    return new Promise((resolve) => {
      let respondido = false;
      const finalizar = (valor) => {
        if (respondido) return;
        respondido = true;
        resolve(valor);
      };

      abrirModal(
        `
          <div class="confirmacao">
            <div class="confirmacao__icone" aria-hidden="true">${escapar(icone)}</div>
            <h2 id="modal-titulo">${escapar(titulo)}</h2>
            <p>${escapar(mensagem)}</p>
            <div class="confirmacao__acoes">
              <button class="btn btn--fantasma" type="button" data-fechar>Cancelar</button>
              <button
                class="btn ${destrutivo ? 'btn--destrutivo' : 'btn--primario'}"
                type="button"
                id="btn-confirmar"
              >${escapar(rotuloConfirmar)}</button>
            </div>
          </div>
        `,
        () => {
          document.getElementById('btn-confirmar')?.addEventListener('click', () => {
            finalizar(true);
            fecharModal();
          });
        },
        () => finalizar(false)
      );
    });
  }

  /* =========================================================
     Lista de itens (até 3)
     ========================================================= */

  function criarListaDeItens({
    container,
    botao,
    max = 3,
    valores = [''],
    prefixo = 'item',
  } = {}) {
    if (!container) {
      return { render() {}, getItens: () => [], setItens() {}, focarUltimo() {} };
    }

    let itens = Array.isArray(valores) && valores.length ? valores.slice(0, max) : [''];

    function focarUltimo() {
      const inputs = container.querySelectorAll('input');
      inputs[inputs.length - 1]?.focus();
    }

    function render() {
      container.innerHTML = '';

      itens.forEach((valor, indice) => {
        const linha = document.createElement('div');
        linha.className = 'item-linha';

        const input = document.createElement('input');
        input.type = 'text';
        input.id = `${prefixo}-${indice}`;
        input.maxLength = 80;
        input.value = valor;
        input.placeholder =
          indice === 0 ? 'Ex.: fone de ouvido bluetooth' : `Item ${indice + 1} (opcional)`;
        input.setAttribute('aria-label', `Item ${indice + 1} da lista de presentes`);
        input.addEventListener('input', () => {
          itens[indice] = input.value;
        });
        input.addEventListener('keydown', (evento) => {
          if (evento.key !== 'Enter') return;
          if (itens.length >= max) return;
          evento.preventDefault();
          itens.push('');
          render();
          focarUltimo();
        });
        linha.append(input);

        if (itens.length > 1) {
          const remover = document.createElement('button');
          remover.type = 'button';
          remover.className = 'remover-item';
          remover.title = 'Remover item';
          remover.setAttribute('aria-label', `Remover item ${indice + 1}`);
          remover.textContent = '×';
          remover.addEventListener('click', () => {
            itens.splice(indice, 1);
            if (!itens.length) itens = [''];
            render();
          });
          linha.append(remover);
        }

        container.append(linha);
      });

      const cheio = itens.length >= max;
      if (botao) {
        botao.disabled = cheio;
        botao.textContent = cheio
          ? `Limite de ${max} itens`
          : `+ item (${itens.length}/${max})`;
      }
    }

    function getItens() {
      return [...container.querySelectorAll('input')]
        .map((input) => limparEspacos(input.value))
        .filter(Boolean)
        .slice(0, max);
    }

    function setItens(novos) {
      itens = Array.isArray(novos) && novos.length ? novos.slice(0, max) : [''];
      render();
    }

    botao?.addEventListener('click', () => {
      if (itens.length >= max) return;
      itens.push('');
      render();
      focarUltimo();
    });

    return { render, getItens, setItens, focarUltimo };
  }

  /* =========================================================
     Confete
     ========================================================= */

  function confete() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cores = ['#b81f45', '#d94a2b', '#c98a2b', '#2f7d5b', '#4c6ef5', '#e8b4c0'];
    const camada = document.createElement('div');
    camada.className = 'confete';
    camada.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < 80; i += 1) {
      const peca = document.createElement('span');
      peca.style.left = `${Math.random() * 100}vw`;
      peca.style.width = `${5 + Math.random() * 7}px`;
      peca.style.height = `${7 + Math.random() * 9}px`;
      peca.style.background = cores[i % cores.length];
      peca.style.animationDelay = `${Math.random() * 0.45}s`;
      peca.style.animationDuration = `${2.1 + Math.random() * 1.6}s`;
      peca.style.setProperty('--deriva', `${(Math.random() - 0.5) * 160}px`);
      peca.style.setProperty('--giro', `${360 + Math.random() * 720}deg`);
      if (i % 3 === 0) peca.style.borderRadius = '50%';
      camada.append(peca);
    }

    document.body.append(camada);
    window.setTimeout(() => camada.remove(), 4400);
  }

  configurarModal();

  window.Comum = {
    escapar,
    limparEspacos,
    normalizar,
    iniciais,
    matiz,
    formatarData,
    pluralPessoas,
    linkSite,
    linkPessoal,
    api,
    toast,
    copiar,
    abrirModal,
    fecharModal,
    confirmar,
    criarListaDeItens,
    confete,
  };
})();
