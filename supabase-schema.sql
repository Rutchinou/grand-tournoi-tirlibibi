-- ============================================================
-- LE GRAND TOURNOI DES TIRLIBIBI
-- Schéma Supabase pour la version GitHub Pages + Supabase Auth
-- IMPORTANT : ce script repart d'une base vide.
-- ============================================================

create extension if not exists pgcrypto;

drop view if exists public.standings cascade;
drop table if exists public.admin_logs cascade;
drop table if exists public.results cascade;
drop table if exists public.final_games cascade;
drop table if exists public.vetos cascade;
drop table if exists public.game_votes cascade;
drop table if exists public.games cascade;
drop table if exists public.tournament_settings cascade;
drop table if exists public.players cascade;

create table public.players (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null unique,
  avatar text not null default '🎲',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tournament_settings (
  id integer primary key default 1 check (id=1),
  preparation_locked boolean not null default false,
  tournament_started boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.tournament_settings(id) values(1);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  proposed_by uuid not null references public.players(id) on delete cascade,
  image_url text,
  game_url text,
  created_at timestamptz not null default now()
);

create table public.game_votes (
  voter_id uuid not null references public.players(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  priority integer not null check (priority between 1 and 5),
  primary key(voter_id,game_id)
);

create table public.vetos (
  player_id uuid not null unique references public.players(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade
);

create table public.final_games (
  game_id uuid primary key references public.games(id) on delete cascade,
  position integer not null unique check (position between 1 and 15),
  selected_automatically boolean not null default true,
  admin_modified boolean not null default false
);

create table public.results (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  rank integer not null check (rank between 1 and 5),
  points integer not null check (points between 1 and 5),
  entered_by uuid not null references public.players(id),
  is_admin_edit boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(game_id,player_id),
  unique(game_id,rank)
);

create table public.admin_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.players(id),
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index games_proposer_idx on public.games(proposed_by);
create index votes_game_idx on public.game_votes(game_id);
create index vetos_game_idx on public.vetos(game_id);
create index results_player_idx on public.results(player_id);

-- Helper sécurisé pour RLS.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.players
    where id = auth.uid() and is_admin = true
  );
$$;

-- Profil joueur : l'inscription Auth crée ensuite sa ligne players côté navigateur.
alter table public.players enable row level security;
alter table public.tournament_settings enable row level security;
alter table public.games enable row level security;
alter table public.game_votes enable row level security;
alter table public.vetos enable row level security;
alter table public.final_games enable row level security;
alter table public.results enable row level security;
alter table public.admin_logs enable row level security;

create policy players_select on public.players for select to authenticated using (true);
create policy players_insert_self on public.players for insert to authenticated
  with check (id=auth.uid() and not is_admin and
    (select count(*) from public.players where is_admin=false) < 5);
create policy players_update_self on public.players for update to authenticated
  using (id=auth.uid() or public.is_admin())
  with check (id=auth.uid() or public.is_admin());

create policy settings_select on public.tournament_settings for select to authenticated using (true);
create policy settings_admin_update on public.tournament_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy games_select on public.games for select to authenticated using (true);
create policy games_insert on public.games for insert to authenticated
  with check (
    proposed_by=auth.uid()
    and not (select preparation_locked from public.tournament_settings where id=1)
    and (select count(*) from public.games where proposed_by=auth.uid()) < 5
  );
create policy games_admin_delete on public.games for delete to authenticated using (public.is_admin());

create policy votes_select on public.game_votes for select to authenticated
  using (voter_id=auth.uid() or public.is_admin());
create policy votes_insert on public.game_votes for insert to authenticated
  with check (
    voter_id=auth.uid()
    and not (select preparation_locked from public.tournament_settings where id=1)
    and exists(select 1 from public.games g where g.id=game_id and g.proposed_by<>auth.uid())
  );
create policy votes_update on public.game_votes for update to authenticated
  using (voter_id=auth.uid()) with check (voter_id=auth.uid());

create policy vetos_select on public.vetos for select to authenticated
  using (player_id=auth.uid() or public.is_admin());
create policy vetos_insert on public.vetos for insert to authenticated
  with check (
    player_id=auth.uid()
    and not (select preparation_locked from public.tournament_settings where id=1)
    and not exists(select 1 from public.vetos where player_id=auth.uid())
    and exists(select 1 from public.games g where g.id=game_id and g.proposed_by<>auth.uid())
    and (
      select count(*) from public.vetos v
      join public.games g on g.id=v.game_id
      where g.proposed_by=(select proposed_by from public.games where id=game_id)
    ) < 2
  );

create policy finals_select on public.final_games for select to authenticated using (true);
create policy finals_admin_insert on public.final_games for insert to authenticated
  with check (public.is_admin());
create policy finals_admin_update on public.final_games for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy finals_admin_delete on public.final_games for delete to authenticated
  using (public.is_admin());

create policy results_select on public.results for select to authenticated using (true);
create policy results_insert_own on public.results for insert to authenticated
  with check (player_id=auth.uid() and entered_by=auth.uid() and not is_admin_edit);
create policy results_update_own on public.results for update to authenticated
  using (player_id=auth.uid() and entered_by=auth.uid())
  with check (player_id=auth.uid() and entered_by=auth.uid() and not is_admin_edit);
create policy results_admin_all on public.results for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy logs_admin on public.admin_logs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace view public.standings as
select p.id,p.name,p.avatar,
       coalesce(sum(r.points),0)::int as points,
       count(r.game_id)::int as games_played,
       count(*) filter(where r.rank=1)::int as wins,
       count(*) filter(where r.rank<=3)::int as podiums
from public.players p
left join public.results r on r.player_id=p.id
where p.is_admin=false
group by p.id,p.name,p.avatar
order by points desc, wins desc, name;

-- Création d'un compte admin :
-- 1) Créez d'abord le compte admin dans l'onglet Auth > Users de Supabase
--    (ou via le formulaire du site).
-- 2) Puis exécutez, en remplaçant l'adresse :
-- update public.players set is_admin=true where lower(email)=lower('VOTRE_EMAIL_ADMIN');
