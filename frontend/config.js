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
      targetHit: "assets/sprites/alvo_acertado.png",
      //   figurante_esq.png / figurante_dir.png  400x540 (base da imagem = pé no palco)
      //   aviao.png                              440x200, olhando para a DIREITA
      sideLeft: "assets/sprites/figurante_esq.png",
      sideRight: "assets/sprites/figurante_dir.png",
      plane: "assets/sprites/aviao.png"
    },

    // Vozes do alvo quando é atingido (tocam em sorteio, sem repetir a mesma seguida).
    //   delay:  segundos depois do splat
    //   volume: 0 a 1
    //   mode:   "cut"  = acerto novo corta a voz que ainda está tocando
    //           "skip" = se uma voz ainda estiver tocando, o acerto novo fica sem voz
    AUDIO: {
      hitVoices: [
        "assets/audio/eggs_01.mp3",
        "assets/audio/eggs_02.mp3",
        "assets/audio/eggs_04.mp3",
        "assets/audio/eggs_05.mp3",
        "assets/audio/eggs_06.mp3",
        "assets/audio/eggs_07.mp3"
      ],
      delay: 0.12,
      volume: 0.9,
      mode: "cut"
    },

    // Elementos de cena quando sobra o último ovo (tempos em segundos).
    //   triggerLives: com quantos ovos restantes começa (1 = último ovo)
    //   firstDelay:   espera até o primeiro aparecer
    //   gapMin/Max:   intervalo sorteado entre um e outro
    //   rise/hold/fall: subir, ficar, descer (figurantes laterais)
    //   planeTime:    tempo do avião cruzando a tela
    //   planeY:       altura do avião (0 = topo, 1 = base)
    SCENE: {
      triggerLives: 1,
      firstDelay: 0.5,
      gapMin: 0.9,
      gapMax: 2.0,
      rise: 0.45,
      hold: 0.9,
      fall: 0.4,
      planeTime: 2.8,
      planeY: 0.40
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
