# myEggs

Um game de Alex Leal — Lizards Games.

O ovo corre lá em cima, o alvo corre lá embaixo. Toque para soltar o ovo.
Cabeça vale 3 pontos, corpo vale 1. Três ovos no chão e acabou.
Instalável como app (PWA) e jogável offline (sem ranking offline).

```
myEggs/
  backend/           Flask API  -> Render
  frontend/          PWA estático -> Netlify
  render.yaml        blueprint do Render (usa backend/)
  netlify.toml       publica frontend/
  subir-github.bat   envia tudo para o GitHub com 2 cliques
```

## Enviar para o GitHub
Dois cliques em `subir-github.bat`. Ele conecta a pasta ao repositório
`alexlealdigital/myEggs` (se ainda não estiver), atualiza a versão do cache do PWA,
pede a mensagem do commit (Enter usa uma padrão) e faz o push.
Render e Netlify publicam sozinhos a cada push.

## 1. Supabase (uma vez)
SQL Editor > cole `backend/schema.sql` > Run. Pode rodar de novo sem problema.

## 2. Render (uma vez)
New > Blueprint > escolha o repositório `myEggs`. Ele lê o `render.yaml`.
Preencha as variáveis que ele pedir:
- `SUPABASE_SERVICE_KEY`: Supabase > Project Settings > API Keys >
  **service_role** (aba Legacy, começa com `eyJ`) ou uma **Secret key** (`sb_secret_...`).
  A chave `anon` não funciona aqui: o banco bloqueia ela de propósito.
- `ALLOWED_ORIGINS`: a URL do Netlify, ex. `https://myeggs.netlify.app`

Teste: `https://myeggs-api.onrender.com/api/health` deve mostrar `"configured": true`.
Se o Render der outro nome ao serviço, ajuste `API_BASE` em `frontend/config.js`.

## 3. Netlify (uma vez)
Add new site > Import from Git > `myEggs`. Não precisa mexer em nada:
o `netlify.toml` já manda publicar a pasta `frontend`.
Depois, coloque a URL final em `ALLOWED_ORIGINS` no Render.

## Arte
Sprites em `frontend/assets/sprites/`:
- `ovo.png` 4:5
- `alvo.png` e `alvo_acertado.png` 10:13

A área de acerto fica em `frontend/config.js` (`HITBOX`), em frações da imagem.
Abra o jogo com `?hitbox` no fim da URL para ver as áreas desenhadas por cima do alvo
(vermelho = cabeça, verde = corpo) e ajustar quando trocar a arte.

## Rodar local (PowerShell)
```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SUPABASE_URL="https://opueaziqjfaaakfnbvin.supabase.co"
$env:SUPABASE_SERVICE_KEY="cole-a-chave"
$env:ALLOWED_ORIGINS="http://127.0.0.1:5500"
python app.py
```
Em outro terminal: `cd frontend; python -m http.server 5500` e abra http://127.0.0.1:5500

## API
| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/health` | status |
| GET | `/api/leaderboard` | top 5 + total de partidas |
| POST | `/api/play` | +1 partida, devolve `play_id` |
| POST | `/api/score` | `{play_id, name, score}`, uma vez por partida |

Cada `play_id` aceita um único score e o servidor recusa pontuações impossíveis
para o tempo jogado. O Render free dorme depois de 15 min parado; o jogo o acorda
ao abrir e nunca trava esperando a rede.
