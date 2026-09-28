"""
myEggs — backend (Flask + Supabase via REST)

Endpoints
  GET  /api/health       -> status
  GET  /api/leaderboard  -> top 5 + total de jogadas
  POST /api/play         -> conta +1 jogada e devolve play_id
  POST /api/score        -> grava pontuação de uma play (uma única vez)

Variáveis de ambiente
  SUPABASE_URL           https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY   service_role (legada, eyJ...) ou secret key (sb_secret_...)
                         NUNCA a anon/publishable, e NUNCA no front
  ALLOWED_ORIGINS        https://myeggs.netlify.app,http://127.0.0.1:5500
"""

import os
import re
import time
import uuid
import threading
from collections import defaultdict, deque

import requests
from flask import Flask, jsonify, request
from flask_cors import CORS

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()
]

TOP_N = 5
MAX_NAME_LEN = 16
MAX_SCORE = 100_000
MAX_PLAY_AGE_S = 60 * 60          # play expira em 1h
POINTS_PER_SECOND_CAP = 4.0       # teto físico do jogo (~3.3 pts/s no máximo)
POINTS_GRACE = 6
HTTP_TIMEOUT = 8

app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=86400,
)


# ---------------------------------------------------------------------------
# Supabase REST helpers
# ---------------------------------------------------------------------------
class SupabaseError(Exception):
    pass


def _headers(extra=None):
    h = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
    # Chave legada (JWT "eyJ...") vai também no Authorization.
    # Chave nova (sb_secret_...) vai só no apikey — o gateway do Supabase cuida do resto.
    if SUPABASE_KEY.startswith("eyJ"):
        h["Authorization"] = f"Bearer {SUPABASE_KEY}"
    if extra:
        h.update(extra)
    return h


def _check_config():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise SupabaseError("Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY).")


def sb_rpc(fn, payload=None):
    _check_config()
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        json=payload or {},
        headers=_headers(),
        timeout=HTTP_TIMEOUT,
    )
    if r.status_code >= 300:
        raise SupabaseError(f"rpc {fn}: {r.status_code} {r.text[:200]}")
    return r.json()


def sb_select(table, params):
    _check_config()
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/{table}",
        params=params,
        headers=_headers(),
        timeout=HTTP_TIMEOUT,
    )
    if r.status_code >= 300:
        raise SupabaseError(f"select {table}: {r.status_code} {r.text[:200]}")
    return r.json()


def sb_insert(table, row):
    _check_config()
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        json=row,
        headers=_headers({"Prefer": "return=minimal"}),
        timeout=HTTP_TIMEOUT,
    )
    if r.status_code >= 300:
        raise SupabaseError(f"insert {table}: {r.status_code} {r.text[:200]}")


def get_top():
    rows = sb_select(
        "myeggs_scores",
        {
            "select": "name,score",
            "order": "score.desc,created_at.asc",
            "limit": str(TOP_N),
        },
    )
    return [{"name": r["name"], "score": int(r["score"])} for r in rows]


def get_total_plays():
    rows = sb_select("myeggs_stats", {"select": "total_plays", "id": "eq.1"})
    return int(rows[0]["total_plays"]) if rows else 0


# ---------------------------------------------------------------------------
# Rate limit simples em memória (por IP)
# ---------------------------------------------------------------------------
_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def rate_limited(bucket, limit, window_s):
    ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "?").split(",")[0].strip()
    key = f"{bucket}:{ip}"
    now = time.monotonic()
    with _hits_lock:
        q = _hits[key]
        while q and now - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            return True
        q.append(now)
    return False


# ---------------------------------------------------------------------------
# Validação
# ---------------------------------------------------------------------------
_ctrl = re.compile(r"[\x00-\x1f\x7f<>]")
_spaces = re.compile(r"\s+")


def clean_name(raw):
    if not isinstance(raw, str):
        return None
    name = _ctrl.sub("", raw)
    name = _spaces.sub(" ", name).strip()
    name = name[:MAX_NAME_LEN].strip()
    return name or None


def parse_uuid(raw):
    try:
        return str(uuid.UUID(str(raw)))
    except (ValueError, TypeError, AttributeError):
        return None


def err(msg, code):
    return jsonify({"ok": False, "error": msg}), code


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------
@app.get("/")
@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "myeggs-api", "configured": bool(SUPABASE_URL and SUPABASE_KEY)})


@app.get("/api/leaderboard")
def leaderboard():
    try:
        return jsonify({"ok": True, "top": get_top(), "total_plays": get_total_plays()})
    except (SupabaseError, requests.RequestException) as e:
        app.logger.error("leaderboard: %s", e)
        return err("Ranking indisponível no momento.", 503)


@app.post("/api/play")
def start_play():
    if rate_limited("play", limit=40, window_s=60):
        return err("Muitas partidas seguidas. Espere alguns segundos.", 429)
    try:
        data = sb_rpc("myeggs_start_play")
        return jsonify({
            "ok": True,
            "play_id": data["play_id"],
            "total_plays": int(data["total_plays"]),
        })
    except (SupabaseError, requests.RequestException, KeyError, TypeError) as e:
        app.logger.error("play: %s", e)
        return err("Não foi possível registrar a partida.", 503)


@app.post("/api/score")
def submit_score():
    if rate_limited("score", limit=20, window_s=60):
        return err("Muitos envios seguidos. Espere alguns segundos.", 429)

    body = request.get_json(silent=True) or {}
    play_id = parse_uuid(body.get("play_id"))
    name = clean_name(body.get("name"))
    score = body.get("score")

    if not play_id:
        return err("Partida inválida.", 400)
    if not name:
        return err("Digite um nome de 1 a 16 caracteres.", 400)
    if isinstance(score, bool) or not isinstance(score, int) or not (0 <= score <= MAX_SCORE):
        return err("Pontuação inválida.", 400)

    try:
        elapsed = sb_rpc("myeggs_finish_play", {"p_play_id": play_id})
        if elapsed is None:
            return err("Essa partida já foi registrada ou não existe.", 409)
        elapsed = float(elapsed)
        if elapsed > MAX_PLAY_AGE_S:
            return err("Partida expirada.", 410)
        if score > int(elapsed * POINTS_PER_SECOND_CAP) + POINTS_GRACE:
            return err("Pontuação não confere com o tempo de jogo.", 422)

        sb_insert("myeggs_scores", {
            "play_id": play_id,
            "name": name,
            "score": score,
            "duration_s": round(elapsed, 2),
        })
        top = get_top()
        in_top = any(t["name"] == name and t["score"] == score for t in top)
        return jsonify({"ok": True, "top": top, "in_top": in_top})
    except (SupabaseError, requests.RequestException, ValueError) as e:
        app.logger.error("score: %s", e)
        return err("Não foi possível salvar a pontuação.", 503)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
