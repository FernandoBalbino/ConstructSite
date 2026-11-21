/*
 * prisma-core.js
 * Cálculo do layout e renderização (SVG e PDF) do fluxograma PRISMA.
 * O mesmo layout alimenta a prévia, o PNG e o PDF, então o que você vê é o que sai no arquivo.
 * Unidades internas: milímetros. Tamanhos de fonte: pontos (pt).
 */
(function (global) {
  'use strict';

  var PT = 25.4 / 72; // 1 pt em mm
  var LARGURA_BASE = 170; // largura útil de uma página A4 com margens de 20 mm

  var THEMES = {
    prisma: {
      nome: 'PRISMA 2020 (amarelo e azul)',
      header: '#F4C542', headerText: '#1A1A1A',
      phase: '#A7C7E7', phaseText: '#1A1A1A',
      box: '#FFFFFF', excl: '#FFFFFF', stroke: '#2B2B2B', text: '#1A1A1A', arrow: '#2B2B2B'
    },
    pb: {
      nome: 'Preto e branco (impressão)',
      header: '#E6E6E6', headerText: '#000000',
      phase: '#D9D9D9', phaseText: '#000000',
      box: '#FFFFFF', excl: '#FFFFFF', stroke: '#000000', text: '#000000', arrow: '#000000'
    },
    azul: {
      nome: 'Azul acadêmico',
      header: '#1E3A8A', headerText: '#FFFFFF',
      phase: '#1E3A8A', phaseText: '#FFFFFF',
      box: '#FFFFFF', excl: '#EEF4FF', stroke: '#1E3A8A', text: '#0F172A', arrow: '#1E3A8A'
    },
    verde: {
      nome: 'Verde saúde',
      header: '#166534', headerText: '#FFFFFF',
      phase: '#15803D', phaseText: '#FFFFFF',
      box: '#FFFFFF', excl: '#F0FDF4', stroke: '#166534', text: '#052E16', arrow: '#166534'
    }
  };

  var DEFAULT_STATE = {
    versao: 1,
    titulo: 'Figura 1 – Fluxograma PRISMA do processo de seleção dos estudos',
    mostrarCabecalho: true,
    cabecalho: 'Identificação de estudos por meio de bases de dados',
    fonte: 'Fonte: Elaborado pelo autor (2026), adaptado do modelo PRISMA 2020 (Page et al., 2021).',
    etapas: [
      {
        fase: 'Identificação',
        texto: 'Artigos identificados nas bases de dados PubMed/MEDLINE e SciELO',
        n: '11',
        excl: false, exclTexto: '', exclN: ''
      },
      {
        fase: 'Triagem e Elegibilidade',
        texto: 'Artigos avaliados por meio da leitura de títulos, resumos e textos completos',
        n: '11',
        excl: true,
        exclTexto: 'Estudos excluídos após a leitura de títulos, resumos e análise dos textos completos por não atenderem aos critérios de elegibilidade',
        exclN: '6'
      },
      {
        fase: 'Incluídos',
        texto: 'Artigos selecionados para compor a revisão integrativa',
        n: '5',
        excl: false, exclTexto: '', exclN: ''
      }
    ],
    tema: 'prisma',
    tamanhoFonte: 10,
    alinhamento: 'centro',
    cantosArredondados: true,
    mostrarFases: true,
    pagina: 'a4'
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Troca caracteres que as fontes padrão do PDF não conseguem desenhar.
  function cleanText(s) {
    return String(s == null ? '' : s)
      .replace(/\t/g, ' ')
      .replace(/−/g, '-')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=')
      .replace(/→/g, '->')
      .replace(/ /g, ' ');
  }

  // Mede texto com as mesmas métricas da fonte Helvetica usada no PDF.
  function createMeasurer() {
    var doc = new global.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    function set(size, bold) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
    }
    return {
      width: function (t, size, bold) { set(size, bold); return doc.getTextWidth(cleanText(t)); },
      split: function (t, w, size, bold) {
        var s = cleanText(t).trim();
        if (!s) return [];
        set(size, bold);
        var lines = doc.splitTextToSize(s, w);
        while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
        return lines;
      }
    };
  }

  function numero(v) {
    var s = String(v == null ? '' : v).trim().replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }

  // Confere se as contagens fecham de uma etapa para a outra.
  function verificar(state) {
    var etapas = state.etapas || [];
    var avisos = [], ok = [];
    for (var i = 0; i < etapas.length - 1; i++) {
      var e = etapas[i], prox = etapas[i + 1];
      var a = numero(e.n), b = numero(prox.n);
      if (a === null || b === null) continue;
      var ex = 0;
      if (e.excl) {
        ex = numero(e.exclN);
        if (ex === null) continue;
      }
      var conta = e.excl ? (a + ' − ' + ex + ' = ' + (a - ex)) : (a + ' → ' + a);
      if (a - ex !== b) {
        avisos.push('Etapa ' + (i + 1) + ' → ' + (i + 2) + ': ' + conta + ', mas a etapa ' + (i + 2) + ' indica n = ' + b + '.');
      } else if (e.excl) {
        ok.push(conta);
      }
    }
    return { avisos: avisos, ok: ok };
  }

  /* ---------------------------------------------------------------
   * LAYOUT: devolve { width, height, items[] } em milímetros
   * ------------------------------------------------------------- */
  function layout(state, M) {
    var th = THEMES[state.tema] || THEMES.prisma;
    var size = Number(state.tamanhoFonte) || 10;
    var em = size * PT;
    var lh = em * 1.25;
    var padX = 3.5, padY = 3.2, rowGap = 10;
    var items = [];
    var etapas = (state.etapas || []).filter(Boolean);
    var anyExcl = etapas.some(function (e) { return e.excl; });
    var showPhases = state.mostrarFases !== false;
    var phaseW = showPhases ? Math.max(12, 2 * lh + 4) : 0;
    var gap1 = showPhases ? 5 : 0;
    var R = LARGURA_BASE - phaseW - gap1;
    var mainW, sideW = 0, gap2 = 0;
    if (anyExcl) { gap2 = 10; mainW = (R - gap2) * 0.54; sideW = R - gap2 - mainW; }
    else { mainW = Math.min(R, 105); }
    var mainX = phaseW + gap1;
    var sideX = mainX + mainW + gap2;
    var W = anyExcl ? LARGURA_BASE : mainX + mainW;
    var r = state.cantosArredondados ? 2 : 0;
    var align = state.alinhamento === 'esquerda' ? 'left' : 'center';
    var y = 0;

    function pushLines(lines, x, y0, w, h, al, color) {
      var total = lines.length * lh;
      var by = y0 + (h - total) / 2 + (lh - em) / 2 + 0.78 * em;
      lines.forEach(function (l) {
        items.push({
          type: 'text', x: al === 'center' ? x + w / 2 : x + padX, y: by,
          text: l.t, size: size, bold: !!l.bold, align: al, color: color
        });
        by += lh;
      });
    }

    function boxLines(texto, n, w) {
      var lines = M.split(texto || '', w - 2 * padX, size, false).map(function (t) { return { t: t, bold: false }; });
      var nn = String(n == null ? '' : n).trim();
      if (nn) lines.push({ t: '(n = ' + nn + ')', bold: true });
      return lines;
    }

    // Título da figura (acima, como pede a ABNT)
    var titulo = (state.titulo || '').trim();
    if (titulo) {
      var ts = size + 1, tlh = ts * PT * 1.25;
      var tl = M.split(titulo, W, ts, true);
      tl.forEach(function (t, i) {
        items.push({ type: 'text', x: W / 2, y: y + i * tlh + ts * PT * 0.8, text: t, size: ts, bold: true, align: 'center', color: '#000000' });
      });
      y += tl.length * tlh + 5;
    }

    // Cabeçalho (faixa superior)
    var cab = state.mostrarCabecalho ? (state.cabecalho || '').trim() : '';
    if (cab) {
      var hx = mainX, hw = W - mainX;
      var hl = M.split(cab, hw - 2 * padX, size, true).map(function (t) { return { t: t, bold: true }; });
      var hh = hl.length * lh + 2 * padY;
      items.push({ type: 'rect', x: hx, y: y, w: hw, h: hh, fill: th.header, stroke: null, lw: 0, r: r });
      pushLines(hl, hx, y, hw, hh, 'center', th.headerText);
      y += hh + 7;
    }

    // Linhas (uma por etapa)
    var rows = etapas.map(function (e) {
      var ml = boxLines(e.texto, e.n, mainW);
      var sl = e.excl ? boxLines(e.exclTexto, e.exclN, sideW) : null;
      var hMain = ml.length * lh + 2 * padY;
      var hSide = sl ? sl.length * lh + 2 * padY : 0;
      return { e: e, ml: ml, sl: sl, h: Math.max(hMain, hSide, 12) };
    });

    // Agrupa etapas consecutivas com a mesma fase (ou fase em branco)
    var groups = [];
    if (showPhases) {
      rows.forEach(function (row, i) {
        var f = (row.e.fase || '').trim();
        var last = groups[groups.length - 1];
        if (last && (!f || f.toLowerCase() === last.label.toLowerCase())) last.rows.push(i);
        else groups.push({ label: f, rows: [i] });
      });
    }

    // Garante altura suficiente para o rótulo vertical da fase (até 2 linhas)
    groups.forEach(function (g) {
      if (!g.label) return;
      var k = g.rows.length;
      var blockH = g.rows.reduce(function (s, i) { return s + rows[i].h; }, 0) + (k - 1) * rowGap;
      var avail = blockH - 6;
      var total = M.width(g.label, size, true);
      var lines, need = 0;
      if (total <= avail) {
        lines = [cleanText(g.label)];
      } else {
        var widest = Math.max.apply(null, g.label.split(/\s+/).map(function (w) { return M.width(w, size, true); }));
        var L = Math.max(widest, total / 2), guard = 0;
        while (M.split(g.label, L, size, true).length > 2 && guard++ < 400) L += 0.5;
        if (L <= avail) lines = M.split(g.label, avail, size, true);
        else { lines = M.split(g.label, L, size, true); need = L + 6 - blockH; }
      }
      if (need > 0) g.rows.forEach(function (i) { rows[i].h += need / k; });
      g.lines = lines;
    });

    var rowY = [];
    rows.forEach(function (row, i) {
      rowY[i] = y;
      y += row.h + (i < rows.length - 1 ? rowGap : 0);
    });

    // Rótulos das fases
    groups.forEach(function (g) {
      if (!g.label) return;
      var top = rowY[g.rows[0]];
      var last = g.rows[g.rows.length - 1];
      var bottom = rowY[last] + rows[last].h;
      items.push({ type: 'rect', x: 0, y: top, w: phaseW, h: bottom - top, fill: th.phase, stroke: null, lw: 0, r: r });
      var cx = phaseW / 2, cy = (top + bottom) / 2, n = g.lines.length;
      g.lines.forEach(function (t, j) {
        items.push({ type: 'vtext', cx: cx + (j - (n - 1) / 2) * lh, cy: cy, text: t, size: size, bold: true, color: th.phaseText });
      });
    });

    // Quadros e setas
    rows.forEach(function (row, i) {
      var yy = rowY[i];
      items.push({ type: 'rect', x: mainX, y: yy, w: mainW, h: row.h, fill: th.box, stroke: th.stroke, lw: 0.35, r: r });
      pushLines(row.ml, mainX, yy, mainW, row.h, align, th.text);
      if (row.sl) {
        items.push({ type: 'rect', x: sideX, y: yy, w: sideW, h: row.h, fill: th.excl, stroke: th.stroke, lw: 0.35, r: r });
        pushLines(row.sl, sideX, yy, sideW, row.h, align, th.text);
        items.push({ type: 'arrow', x1: mainX + mainW, y1: yy + row.h / 2, x2: sideX, y2: yy + row.h / 2, color: th.arrow });
      }
      if (i < rows.length - 1) {
        items.push({ type: 'arrow', x1: mainX + mainW / 2, y1: yy + row.h, x2: mainX + mainW / 2, y2: rowY[i + 1], color: th.arrow });
      }
    });

    // Fonte (abaixo)
    var fonte = (state.fonte || '').trim();
    if (fonte) {
      y += 5;
      var fs = Math.max(7, size - 1), flh = fs * PT * 1.25;
      var fl = M.split(fonte, W, fs, false);
      fl.forEach(function (t, i) {
        items.push({ type: 'text', x: 0, y: y + i * flh + fs * PT * 0.8, text: t, size: fs, bold: false, align: 'left', color: '#000000' });
      });
      y += fl.length * flh;
    }

    return { width: W, height: Math.max(y, 10), items: items };
  }

  function arrowGeom(it) {
    var dx = it.x2 - it.x1, dy = it.y2 - it.y1;
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len, hl = 2.4, hw = 1.3;
    var bx = it.x2 - ux * hl, by = it.y2 - uy * hl;
    return { bx: bx, by: by, p1: [it.x2, it.y2], p2: [bx - uy * hw, by + ux * hw], p3: [bx + uy * hw, by - ux * hw] };
  }

  /* ---------------------------------------------------------------
   * SVG
   * ------------------------------------------------------------- */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function f(v) { return Math.round(v * 100) / 100; }

  function toSVG(L, opts) {
    opts = opts || {};
    var m = opts.margin == null ? 8 : opts.margin;
    var vw = L.width + 2 * m, vh = L.height + 2 * m;
    var size = opts.pxPerMm ? ' width="' + Math.round(vw * opts.pxPerMm) + '" height="' + Math.round(vh * opts.pxPerMm) + '"' : '';
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + f(-m) + ' ' + f(-m) + ' ' + f(vw) + ' ' + f(vh) + '"' + size +
      ' font-family="Helvetica, Arial, Arimo, \'Liberation Sans\', sans-serif">'];
    out.push('<rect x="' + f(-m) + '" y="' + f(-m) + '" width="' + f(vw) + '" height="' + f(vh) + '" fill="#FFFFFF"/>');
    L.items.forEach(function (it) {
      if (it.type === 'rect') {
        out.push('<rect x="' + f(it.x) + '" y="' + f(it.y) + '" width="' + f(it.w) + '" height="' + f(it.h) + '" rx="' + f(it.r) +
          '" fill="' + it.fill + '" stroke="' + (it.stroke || 'none') + '" stroke-width="' + f(it.lw || 0) + '"/>');
      } else if (it.type === 'text') {
        out.push('<text x="' + f(it.x) + '" y="' + f(it.y) + '" font-size="' + f(it.size * PT) + '" font-weight="' + (it.bold ? 'bold' : 'normal') +
          '" fill="' + it.color + '" text-anchor="' + (it.align === 'center' ? 'middle' : 'start') + '" xml:space="preserve">' + esc(it.text) + '</text>');
      } else if (it.type === 'vtext') {
        var em = it.size * PT;
        out.push('<text x="' + f(it.cx) + '" y="' + f(it.cy + 0.35 * em) + '" transform="rotate(-90 ' + f(it.cx) + ' ' + f(it.cy) + ')" font-size="' + f(em) +
          '" font-weight="' + (it.bold ? 'bold' : 'normal') + '" fill="' + it.color + '" text-anchor="middle">' + esc(it.text) + '</text>');
      } else if (it.type === 'arrow') {
        var g = arrowGeom(it);
        out.push('<line x1="' + f(it.x1) + '" y1="' + f(it.y1) + '" x2="' + f(g.bx) + '" y2="' + f(g.by) + '" stroke="' + it.color + '" stroke-width="0.45"/>');
        out.push('<polygon points="' + [g.p1, g.p2, g.p3].map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ') + '" fill="' + it.color + '"/>');
      }
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ---------------------------------------------------------------
   * PDF (vetorial, via jsPDF)
   * ------------------------------------------------------------- */
  function toPDF(L, pagina) {
    var jsPDF = global.jspdf.jsPDF;
    var doc, s = 1, ox, oy;
    if (pagina === 'ajustado') {
      var mm = 10, pw = L.width + 2 * mm, ph = L.height + 2 * mm;
      doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation: pw > ph ? 'landscape' : 'portrait' });
      ox = mm; oy = mm;
    } else {
      doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      var m = 20, aw = 210 - 2 * m, ah = 297 - 2 * m;
      s = Math.min(1, aw / L.width, ah / L.height);
      ox = (210 - L.width * s) / 2; oy = m;
    }
    doc.setProperties({ title: 'Fluxograma PRISMA', subject: 'Fluxograma PRISMA', creator: 'Editor de Fluxograma PRISMA' });
    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }

    L.items.forEach(function (it) {
      if (it.type === 'rect') {
        var style = it.stroke ? 'FD' : 'F';
        doc.setFillColor(it.fill);
        if (it.stroke) { doc.setDrawColor(it.stroke); doc.setLineWidth((it.lw || 0.35) * s); }
        if (it.r > 0) doc.roundedRect(X(it.x), Y(it.y), it.w * s, it.h * s, it.r * s, it.r * s, style);
        else doc.rect(X(it.x), Y(it.y), it.w * s, it.h * s, style);
      } else if (it.type === 'text') {
        doc.setFont('helvetica', it.bold ? 'bold' : 'normal');
        doc.setFontSize(it.size * s);
        doc.setTextColor(it.color);
        var t = cleanText(it.text);
        if (it.align === 'center') doc.text(t, X(it.x), Y(it.y), { align: 'center' });
        else doc.text(t, X(it.x), Y(it.y));
      } else if (it.type === 'vtext') {
        doc.setFont('helvetica', it.bold ? 'bold' : 'normal');
        doc.setFontSize(it.size * s);
        doc.setTextColor(it.color);
        var vt = cleanText(it.text);
        var w = doc.getTextWidth(vt);
        doc.text(vt, X(it.cx) + 0.35 * it.size * PT * s, Y(it.cy) + w / 2, { angle: 90 });
      } else if (it.type === 'arrow') {
        var g = arrowGeom(it);
        doc.setDrawColor(it.color);
        doc.setFillColor(it.color);
        doc.setLineWidth(0.45 * s);
        doc.line(X(it.x1), Y(it.y1), X(g.bx), Y(g.by));
        doc.triangle(X(g.p1[0]), Y(g.p1[1]), X(g.p2[0]), Y(g.p2[1]), X(g.p3[0]), Y(g.p3[1]), 'F');
      }
    });
    return doc;
  }

  global.PrismaCore = {
    THEMES: THEMES,
    DEFAULT_STATE: DEFAULT_STATE,
    clone: clone,
    createMeasurer: createMeasurer,
    layout: layout,
    verificar: verificar,
    toSVG: toSVG,
    toPDF: toPDF
  };
})(window);
