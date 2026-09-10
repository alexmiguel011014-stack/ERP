/* Utilitários de loading state, compartilhados por todo o app:
   - window.erpCriarLoader(container, opcoes): monta o spinner canvas
     "Pulse Wave" (anéis de pontos pulsando, cores do design system) dentro
     do container. Retorna { destruir() } — sempre chamar destruir() ao
     remover o loader, senão o requestAnimationFrame continua rodando.
   - window.erpSkeletonLinhas(qtd, colspan, comAvatar): gera N <tr> de
     shimmer para uma <tbody>, no mesmo visual usado em Produtos/Clientes.
   - window.erpSkeletonCards(qtd): gera N <div class="item-lista"> de
     shimmer, para as telas que renderizam listas em cards (não tabela). */
(function () {
  function corParaRgb(cor) {
    cor = (cor || "").trim();
    if (cor[0] === "#") {
      var hex = cor.length === 4
        ? cor[1] + cor[1] + cor[2] + cor[2] + cor[3] + cor[3]
        : cor.slice(1);
      var num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    var m = cor.match(/\d+(\.\d+)?/g);
    return m ? [+m[0], +m[1], +m[2]] : [109, 40, 217];
  }

  function interpolar(rgb1, rgb2, t) {
    return [
      Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t),
      Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t),
      Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t),
    ];
  }

  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smoothstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  window.erpCriarLoader = function (container, opcoes) {
    opcoes = opcoes || {};
    var tamanho = opcoes.tamanho || 64;
    var escala = tamanho / 180;

    var canvas = document.createElement("canvas");
    canvas.width = tamanho;
    canvas.height = tamanho;
    canvas.className = "erp-loader-canvas";
    container.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    var cx = tamanho / 2;
    var cy = tamanho / 2;
    var aneis = [
      { raio: 15 * escala, qtd: 6 },
      { raio: 30 * escala, qtd: 12 },
      { raio: 45 * escala, qtd: 18 },
      { raio: 60 * escala, qtd: 24 },
      { raio: 75 * escala, qtd: 30 },
    ];

    var tempo = 0;
    var ultimoTs = 0;
    var ativo = true;
    var raf = null;

    function cores() {
      var estilo = getComputedStyle(document.documentElement);
      return {
        base: corParaRgb(estilo.getPropertyValue("--cor-primaria") || "#6D28D9"),
        destaque: corParaRgb(estilo.getPropertyValue("--cor-destaque-solido") || "#F5B301"),
      };
    }

    function passo(ts) {
      if (!ativo) return;
      if (!ultimoTs) ultimoTs = ts;
      var dt = ts - ultimoTs;
      ultimoTs = ts;
      tempo += dt * 0.001;

      ctx.clearRect(0, 0, tamanho, tamanho);
      var cor = cores();

      ctx.beginPath();
      ctx.arc(cx, cy, 2 * escala, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + cor.base.join(",") + ",0.9)";
      ctx.fill();

      aneis.forEach(function (anel, i) {
        for (var d = 0; d < anel.qtd; d++) {
          var angulo = (d / anel.qtd) * Math.PI * 2;
          var faseP = tempo * 2 - i * 0.4;
          var pulsoRaio = easeInOutSine((Math.sin(faseP) + 1) / 2) * 6 * escala - 3 * escala;
          var x = cx + Math.cos(angulo) * (anel.raio + pulsoRaio);
          var y = cy + Math.sin(angulo) * (anel.raio + pulsoRaio);

          var faseOp = (Math.sin(faseP + d * 0.2) + 1) / 2;
          var opacidade = 0.3 + easeInOutSine(faseOp) * 0.7;
          var mistura = smoothstep(0.2, 0.8, easeInOutCubic((Math.sin(faseP) + 1) / 2));
          var rgb = interpolar(cor.base, cor.destaque, mistura);

          ctx.beginPath();
          ctx.arc(x, y, 2 * escala, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(" + rgb.join(",") + "," + opacidade + ")";
          ctx.fill();
        }
      });

      raf = requestAnimationFrame(passo);
    }
    raf = requestAnimationFrame(passo);

    return {
      destruir: function () {
        ativo = false;
        if (raf) cancelAnimationFrame(raf);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  };

  window.erpSkeletonLinhas = function (qtd, colspan, comAvatar) {
    var quadrado = comAvatar === false ? "" : '<span class="skeleton-box skeleton-quadrado"></span>';
    var linha =
      '<tr><td colspan="' + colspan + '"><div class="skeleton-linha">' +
      quadrado +
      '<span class="skeleton-col">' +
      '<span class="skeleton-box skeleton-linha-texto" style="width:60%;"></span>' +
      '<span class="skeleton-box skeleton-linha-texto" style="width:35%;"></span>' +
      "</span></div></td></tr>";
    return new Array(qtd || 5).fill(linha).join("");
  };

  window.erpSkeletonCards = function (qtd) {
    var card =
      '<div class="item-lista"><div class="skeleton-linha">' +
      '<span class="skeleton-box skeleton-quadrado"></span>' +
      '<span class="skeleton-col">' +
      '<span class="skeleton-box skeleton-linha-texto" style="width:55%;"></span>' +
      '<span class="skeleton-box skeleton-linha-texto" style="width:30%;"></span>' +
      "</span></div></div>";
    return new Array(qtd || 4).fill(card).join("");
  };
})();
