/* app.js — interface do editor (formulário, prévia, downloads) */
(function () {
  'use strict';

  var P = window.PrismaCore;
  var STORAGE_KEY = 'fluxograma-prisma-v1';
  var measurer = P.createMeasurer();
  var state = carregar();

  var $ = function (sel) { return document.querySelector(sel); };
  var elEtapas = $('#etapas');
  var elPreview = $('#preview');
  var elAvisos = $('#avisos');

  /* ---------- estado ---------- */
  function carregar() {
    try {
      var salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (salvo && Array.isArray(salvo.etapas)) return normalizar(salvo);
    } catch (e) { /* sem acesso ao armazenamento: usa o padrão */ }
    return P.clone(P.DEFAULT_STATE);
  }
  function normalizar(s) {
    var base = P.clone(P.DEFAULT_STATE);
    Object.keys(base).forEach(function (k) { if (s[k] === undefined) s[k] = base[k]; });
    s.etapas = (s.etapas || []).map(function (e) {
      return {
        fase: e.fase || '', texto: e.texto || '', n: e.n == null ? '' : String(e.n),
        excl: !!e.excl, exclTexto: e.exclTexto || '', exclN: e.exclN == null ? '' : String(e.exclN)
      };
    });
    return s;
  }
  function salvar() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
  }

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function baixar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- campos gerais ---------- */
  var sel = $('#sel-tema');
  Object.keys(P.THEMES).forEach(function (k) {
    var o = document.createElement('option');
    o.value = k; o.textContent = P.THEMES[k].nome; sel.appendChild(o);
  });

  function preencherCampos() {
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var k = el.getAttribute('data-bind');
      if (el.type === 'checkbox') el.checked = !!state[k];
      else el.value = state[k] == null ? '' : state[k];
    });
  }
  document.querySelectorAll('[data-bind]').forEach(function (el) {
    var ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
    el.addEventListener(ev, function () {
      var k = el.getAttribute('data-bind');
      if (el.type === 'checkbox') state[k] = el.checked;
      else if (el.hasAttribute('data-num')) state[k] = Number(el.value);
      else state[k] = el.value;
      atualizar();
    });
  });

  /* ---------- etapas ---------- */
  function cardHTML(e, i, total) {
    return '' +
      '<div class="etapa' + (e.excl ? ' has-excl' : '') + '" data-i="' + i + '">' +
        '<div class="etapa-head">' +
          '<span class="etapa-num">' + (i + 1) + '</span>' +
          '<input type="text" data-k="fase" value="' + esc(e.fase) + '" placeholder="Fase (ex.: Triagem)" aria-label="Fase da etapa ' + (i + 1) + '">' +
          '<div class="etapa-btns">' +
            '<button type="button" data-act="up" title="Mover para cima" aria-label="Mover para cima"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" data-act="down" title="Mover para baixo" aria-label="Mover para baixo"' + (i === total - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" data-act="del" title="Remover etapa" aria-label="Remover etapa"' + (total === 1 ? ' disabled' : '') + '>✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="row-n">' +
          '<label class="field"><span>Texto do quadro</span><textarea data-k="texto" rows="3">' + esc(e.texto) + '</textarea></label>' +
          '<label class="field"><span>n</span><input type="text" data-k="n" value="' + esc(e.n) + '" inputmode="numeric" placeholder="—"></label>' +
        '</div>' +
        '<label class="check"><input type="checkbox" data-k="excl"' + (e.excl ? ' checked' : '') + '> Quadro de exclusão ao lado</label>' +
        '<div class="excl-fields">' +
          '<div class="row-n">' +
            '<label class="field"><span>Texto da exclusão</span><textarea data-k="exclTexto" rows="4">' + esc(e.exclTexto) + '</textarea></label>' +
            '<label class="field"><span>n excluídos</span><input type="text" data-k="exclN" value="' + esc(e.exclN) + '" inputmode="numeric" placeholder="—"></label>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderEtapas() {
    elEtapas.innerHTML = state.etapas.map(function (e, i) { return cardHTML(e, i, state.etapas.length); }).join('');
  }

  elEtapas.addEventListener('input', function (ev) {
    var k = ev.target.getAttribute('data-k');
    if (!k || ev.target.type === 'checkbox') return;
    var i = Number(ev.target.closest('.etapa').getAttribute('data-i'));
    state.etapas[i][k] = ev.target.value;
    atualizar();
  });
  elEtapas.addEventListener('change', function (ev) {
    if (ev.target.getAttribute('data-k') !== 'excl') return;
    var card = ev.target.closest('.etapa');
    var i = Number(card.getAttribute('data-i'));
    state.etapas[i].excl = ev.target.checked;
    card.classList.toggle('has-excl', ev.target.checked);
    atualizar();
  });
  elEtapas.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    var i = Number(btn.closest('.etapa').getAttribute('data-i'));
    var act = btn.getAttribute('data-act');
    var arr = state.etapas;
    if (act === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'down' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'del' && arr.length > 1) arr.splice(i, 1);
    renderEtapas();
    atualizar();
  });
  $('#btn-add').addEventListener('click', function () {
    state.etapas.push({ fase: '', texto: 'Nova etapa', n: '', excl: false, exclTexto: '', exclN: '' });
    renderEtapas();
    atualizar();
    var cards = elEtapas.querySelectorAll('.etapa');
    var ultimo = cards[cards.length - 1];
    ultimo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ultimo.querySelector('textarea').focus();
  });

  /* ---------- prévia ---------- */
  var agendado = false;
  function atualizar() {
    salvar();
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () { agendado = false; desenhar(); });
  }

  var elImg = document.createElement('img');
  elImg.alt = 'Prévia do fluxograma PRISMA';
  elPreview.appendChild(elImg);

  function desenhar() {
    var L = P.layout(state, measurer);
    var svg = P.toSVG(L, { pxPerMm: 5 });
    elImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

    var v = P.verificar(state);
    var dot = document.querySelector('.mobile-bar .dot');
    if (dot) dot.hidden = !v.avisos.length;
    elAvisos.className = 'avisos';
    if (v.avisos.length) {
      elAvisos.classList.add('warn');
      elAvisos.innerHTML = '<b>Confira os números:</b><ul>' + v.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>';
    } else if (v.ok.length) {
      elAvisos.classList.add('ok');
      elAvisos.innerHTML = '✓ Contagens conferidas: ' + v.ok.map(esc).join(' · ');
    } else {
      elAvisos.innerHTML = '';
    }
  }

  /* ---------- downloads ---------- */
  function gerarPDF() {
    try {
      var doc = P.toPDF(P.layout(state, measurer), state.pagina);
      doc.save('fluxograma-prisma.pdf');
      toast('PDF gerado!');
    } catch (e) {
      console.error(e);
      toast('Não foi possível gerar o PDF.');
    }
  }
  $('#btn-pdf').addEventListener('click', gerarPDF);
  $('#btn-pdf-mobile').addEventListener('click', gerarPDF);

  /* ---------- zoom da prévia ---------- */
  var ZOOMS = [1, 1.5, 2, 3];
  var zoomIdx = 0;
  function aplicarZoom() {
    var z = ZOOMS[zoomIdx];
    elPreview.classList.toggle('zoomed', zoomIdx > 0);
    elImg.style.width = zoomIdx > 0 ? (z * 100) + '%' : '';
    $('#zoom-label').textContent = zoomIdx > 0 ? Math.round(z * 100) + '%' : 'Ajustar';
  }
  document.querySelectorAll('[data-zoom]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = Number(b.getAttribute('data-zoom'));
      zoomIdx = d === 0 ? 0 : Math.max(0, Math.min(ZOOMS.length - 1, zoomIdx + d));
      aplicarZoom();
    });
  });

  /* ---------- abas do celular (Editar / Prévia) ---------- */
  function mudarAba(aba, rolar) {
    document.body.classList.remove('tab-editor', 'tab-preview');
    document.body.classList.add('tab-' + aba);
    document.querySelectorAll('.mobile-bar .tab[data-tab]').forEach(function (b) {
      var ativo = b.getAttribute('data-tab') === aba;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
    try { localStorage.setItem(STORAGE_KEY + '-aba', aba); } catch (e) { /* ignora */ }
    if (rolar) window.scrollTo(0, 0);
  }
  document.querySelectorAll('.mobile-bar .tab[data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { mudarAba(b.getAttribute('data-tab'), true); });
  });
  var abaSalva = 'preview';
  try { abaSalva = localStorage.getItem(STORAGE_KEY + '-aba') || 'preview'; } catch (e) { /* ignora */ }
  mudarAba(abaSalva === 'editor' ? 'editor' : 'preview', false);

  $('#btn-svg').addEventListener('click', function () {
    var svg = P.toSVG(P.layout(state, measurer), { pxPerMm: 300 / 25.4 / 3 });
    baixar(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'fluxograma-prisma.svg');
  });

  $('#btn-png').addEventListener('click', function () {
    var pxPerMm = 300 / 25.4; // 300 dpi
    var L = P.layout(state, measurer);
    var svg = P.toSVG(L, { pxPerMm: pxPerMm });
    var w = Math.round((L.width + 16) * pxPerMm), h = Math.round((L.height + 16) * pxPerMm);
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(function (blob) { baixar(blob, 'fluxograma-prisma.png'); toast('PNG em 300 dpi baixado!'); }, 'image/png');
    };
    img.onerror = function () { toast('Não foi possível gerar o PNG.'); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

  /* ---------- salvar / abrir / restaurar ---------- */
  $('#btn-export').addEventListener('click', function () {
    baixar(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), 'fluxograma-prisma.json');
  });
  $('#btn-import').addEventListener('click', function () { $('#file-import').click(); });
  $('#file-import').addEventListener('change', function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var dados = JSON.parse(reader.result);
        if (!dados || !Array.isArray(dados.etapas)) throw new Error('formato');
        state = normalizar(dados);
        preencherCampos(); renderEtapas(); atualizar();
        toast('Fluxograma carregado.');
      } catch (e) {
        toast('Arquivo inválido.');
      }
      ev.target.value = '';
    };
    reader.readAsText(file);
  });
  $('#btn-reset').addEventListener('click', function () {
    if (!window.confirm('Voltar ao fluxograma original? As alterações atuais serão perdidas.')) return;
    state = P.clone(P.DEFAULT_STATE);
    preencherCampos(); renderEtapas(); atualizar();
    toast('Dados originais restaurados.');
  });

  /* ---------- início ---------- */
  preencherCampos();
  renderEtapas();
  desenhar();
})();
