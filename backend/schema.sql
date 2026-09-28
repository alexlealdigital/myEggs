-- =====================================================================
-- myEggs — schema Supabase
-- Cole tudo no SQL Editor do Supabase e clique em "Run".
-- Pode rodar mais de uma vez: é idempotente.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Contador global de jogadas (linha única)
-- ---------------------------------------------------------------------
create table if not exists public.myeggs_stats (
  id           smallint primary key default 1,
  total_plays  bigint   not null default 0,
  updated_at   timestamptz not null default now(),
  constraint myeggs_stats_single_row check (id = 1)
);

insert into public.myeggs_stats (id, total_plays)
values (1, 0)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Cada clique em "Jogar" gera uma partida (usada para validar o score)
-- ---------------------------------------------------------------------
create table if not exists public.myeggs_plays (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished    boolean     not null default false,
  finished_at timestamptz
);

create index if not exists myeggs_plays_started_idx
  on public.myeggs_plays (started_at desc);

-- ---------------------------------------------------------------------
-- Pontuações (1 por partida)
-- ---------------------------------------------------------------------
create table if not exists public.myeggs_scores (
  id          bigserial primary key,
  play_id     uuid not null unique references public.myeggs_plays(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 16),
  score       integer not null check (score >= 0 and score <= 100000),
  duration_s  numeric(8,2) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists myeggs_scores_rank_idx
  on public.myeggs_scores (score desc, created_at asc);

-- ---------------------------------------------------------------------
-- RPC: inicia partida (incrementa contador + cria play) numa transação
-- ---------------------------------------------------------------------
create or replace function public.myeggs_start_play()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total bigint;
  v_play  uuid;
begin
  update public.myeggs_stats
     set total_plays = total_plays + 1,
         updated_at  = now()
   where id = 1
  returning total_plays into v_total;

  if v_total is null then
    insert into public.myeggs_stats (id, total_plays) values (1, 1)
    on conflict (id) do update set total_plays = public.myeggs_stats.total_plays + 1
    returning total_plays into v_total;
  end if;

  insert into public.myeggs_plays default values
  returning id into v_play;

  return json_build_object('play_id', v_play, 'total_plays', v_total);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: fecha a partida uma única vez (evita reenviar score da mesma play)
-- Retorna os segundos decorridos, ou null se já foi usada / não existe.
-- ---------------------------------------------------------------------
create or replace function public.myeggs_finish_play(p_play_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
begin
  update public.myeggs_plays
     set finished = true,
         finished_at = now()
   where id = p_play_id
     and finished = false
  returning started_at into v_started;

  if v_started is null then
    return null;
  end if;

  return extract(epoch from (now() - v_started));
end;
$$;

-- ---------------------------------------------------------------------
-- Segurança: RLS ligado e SEM políticas públicas.
-- Só o backend (service_role) lê e escreve. O front nunca fala direto
-- com o Supabase.
-- ---------------------------------------------------------------------
alter table public.myeggs_stats  enable row level security;
alter table public.myeggs_plays  enable row level security;
alter table public.myeggs_scores enable row level security;

revoke all on function public.myeggs_start_play()        from public, anon, authenticated;
revoke all on function public.myeggs_finish_play(uuid)   from public, anon, authenticated;
grant execute on function public.myeggs_start_play()      to service_role;
grant execute on function public.myeggs_finish_play(uuid) to service_role;
