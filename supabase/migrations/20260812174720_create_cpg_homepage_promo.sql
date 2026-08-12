-- Configuración aislada de publicidad para Aula Virtual CPG.
-- No modifica tablas, usuarios ni políticas de los otros productos del proyecto.
create table public.cpg_homepage_promo (
  id smallint primary key default 1 check (id = 1),
  active boolean not null default false,
  image_url text not null default '',
  link_url text not null default '',
  alt_text text not null default 'Actividad destacada',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

comment on table public.cpg_homepage_promo is
  'Publicidad configurable de la portada de Aula Virtual CPG.';

alter table public.cpg_homepage_promo enable row level security;

revoke all on table public.cpg_homepage_promo from anon, authenticated;
grant select on table public.cpg_homepage_promo to anon, authenticated;
grant insert, update on table public.cpg_homepage_promo to authenticated;

create policy "cpg_homepage_promo_public_read"
on public.cpg_homepage_promo
for select
to anon, authenticated
using (true);

create policy "cpg_homepage_promo_super_admin_insert"
on public.cpg_homepage_promo
for insert
to authenticated
with check ((select auth.uid()) = '57b8603a-dcb6-45e8-ab45-a3e141c95eb0'::uuid);

create policy "cpg_homepage_promo_super_admin_update"
on public.cpg_homepage_promo
for update
to authenticated
using ((select auth.uid()) = '57b8603a-dcb6-45e8-ab45-a3e141c95eb0'::uuid)
with check ((select auth.uid()) = '57b8603a-dcb6-45e8-ab45-a3e141c95eb0'::uuid);

insert into public.cpg_homepage_promo (id)
values (1)
on conflict (id) do nothing;

-- Bucket exclusivo de esta función. Las imágenes son públicas, pero solo el
-- superadministrador real de Aula Virtual puede subir archivos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cpg-homepage-promos',
  'cpg-homepage-promos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

create policy "cpg_homepage_promos_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'cpg-homepage-promos');

create policy "cpg_homepage_promos_super_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'cpg-homepage-promos'
  and (select auth.uid()) = '57b8603a-dcb6-45e8-ab45-a3e141c95eb0'::uuid
);
