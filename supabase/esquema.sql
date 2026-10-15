-- ===============================================================
-- Ivoryx: base de datos de equipos en Supabase
-- Cualquiera puede VER los equipos que no están vendidos.
-- Solo el usuario admin puede crear, editar o borrar (y subir fotos).
-- ===============================================================

create table if not exists public.equipos (
  id          uuid primary key default gen_random_uuid(),
  modelo      text not null,
  capacidad   text,
  color       text,
  condicion   text,
  bateria     smallint check (bateria between 1 and 100),
  precio      numeric(14, 2) not null check (precio >= 0),
  moneda      text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  detalle     text,
  estado      text not null default 'disponible' check (estado in ('disponible', 'reservado', 'vendido')),
  imagen      text not null default '',
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create index if not exists equipos_creado_idx on public.equipos (creado desc);

-- Fecha de última modificación automática
create or replace function public.equipos_tocar_actualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

drop trigger if exists equipos_actualizado on public.equipos;
create trigger equipos_actualizado before update on public.equipos
  for each row execute function public.equipos_tocar_actualizado();

-- ¿El usuario logueado es el admin?
create or replace function public.es_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'email') = '__ADMIN_EMAIL__', false);
$$;

-- Seguridad por filas
alter table public.equipos enable row level security;

grant select on public.equipos to anon, authenticated;
grant insert, update, delete on public.equipos to authenticated;

drop policy if exists "ver equipos publicados" on public.equipos;
create policy "ver equipos publicados" on public.equipos
  for select to anon, authenticated
  using (estado <> 'vendido' or (select public.es_admin()));

drop policy if exists "admin crea equipos" on public.equipos;
create policy "admin crea equipos" on public.equipos
  for insert to authenticated with check ((select public.es_admin()));

drop policy if exists "admin edita equipos" on public.equipos;
create policy "admin edita equipos" on public.equipos
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

drop policy if exists "admin borra equipos" on public.equipos;
create policy "admin borra equipos" on public.equipos
  for delete to authenticated using ((select public.es_admin()));

-- Fotos: bucket público para leer, solo el admin sube o borra
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipos', 'equipos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true;

drop policy if exists "admin sube fotos" on storage.objects;
create policy "admin sube fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'equipos' and (select public.es_admin()));

drop policy if exists "admin edita fotos" on storage.objects;
create policy "admin edita fotos" on storage.objects
  for update to authenticated using (bucket_id = 'equipos' and (select public.es_admin()));

drop policy if exists "admin borra fotos" on storage.objects;
create policy "admin borra fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'equipos' and (select public.es_admin()));
