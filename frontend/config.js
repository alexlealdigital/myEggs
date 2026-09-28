// Configuração do myEggs — edite só este arquivo para apontar para outra API
// ou ajustar a arte.
(function () {
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  window.MYEGGS_CONFIG = {
    // URL do backend no Render (sem barra no final)
    API_BASE: local ? "http://127.0.0.1:5000" : "https://myeggs-api.onrender.com",

    // Sprites. Se um arquivo não existir, o jogo desenha a versão vetorial.
    //   ovo.png            4:5   (ex.: 160x200)
    //   alvo.png           10:13 (ex.: 400x520)
    //   alvo_acertado.png  mesma proporção do alvo
    SPRITES: {
      egg: "assets/sprites/ovo.png",
      target: "assets/sprites/alvo.png",
      targetHit: "assets/sprites/alvo_acertado.png"
    },

    // Área de acerto, em frações da caixa do alvo (0 = esquerda/topo, 1 = direita/base).
    // Calibrada para o alvo.png atual. Se trocar a arte, ajuste aqui.
    //   head: elipse (centro cx,cy e raios rx,ry)  -> 3 pontos
    //   body: retângulo (x1..x2, y1..y2)           -> 1 ponto
    // Para visualizar as áreas no jogo, abra o site com ?hitbox no final da URL.
    HITBOX: {
      head: { cx: 0.50, cy: 0.28, rx: 0.28, ry: 0.28 },
      body: { x1: 0.10, x2: 0.90, y1: 0.55, y2: 1.00 }
    }
  };
})();
