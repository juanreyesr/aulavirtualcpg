-- Ajustes a la cola de activación (Hotmail/Outlook/Live/MSN):
--
-- 1) El estado ACTIVO/INACTIVO no impide crear cuenta en el aula (eso solo se
--    refleja en los certificados). La aprobación automática ahora activa a
--    cualquier colegiado real (que exista en cpg_colegiados_cache), sin importar
--    su estado. Invitados (100000) y cuentas sin colegiado siguen en revisión manual.
--
-- 2) cpg_user_profiles tiene un solo registro por número de colegiado, así que
--    los invitados (todos con 100000) se sobrescriben entre sí y la cola perdía
--    el vínculo. El frontend ahora manda colegiado y nombre en los metadatos de
--    la cuenta (signUp options.data) y el trigger los usa primero.
--
-- 3) Función para el panel: devuelve la cola con colegiado, nombre y estado.

create or replace function aulacaeduc.enqueue_unconfirmed_ms_user()
returns trigger
language plpgsql
security definer
set search_path = aulacaeduc, public
as $$
begin
  if new.email_confirmed_at is null and aulacaeduc.is_problematic_email_domain(new.email) then
    insert into aulacaeduc.cpg_email_verification_queue (email, collegiate_number, name, domain)
    select lower(new.email),
           coalesce(nullif(new.raw_user_meta_data->>'collegiate_number', ''), p.collegiate_number::text),
           coalesce(nullif(new.raw_user_meta_data->>'name', ''), p.name),
           split_part(lower(new.email), '@', 2)
    from (select 1) x
    left join lateral (
      select collegiate_number, name from aulacaeduc.cpg_user_profiles
      where lower(email) = lower(new.email) order by created_at desc limit 1
    ) p on true
    on conflict (email) do update
      set activated_at = null, activated_by = null, notes = null, created_at = now(),
          collegiate_number = excluded.collegiate_number, name = excluded.name
      where aulacaeduc.cpg_email_verification_queue.activated_at is not null;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function aulacaeduc.auto_approve_verification_queue()
returns integer
language plpgsql
security definer
set search_path = aulacaeduc, public
as $$
declare
  v_emails text[];
  v_count integer;
begin
  select coalesce(array_agg(lower(q.email)), '{}')
    into v_emails
  from aulacaeduc.cpg_email_verification_queue q
  where q.activated_at is null
    and q.notes is distinct from 'Descartado sin activar'
    and coalesce(q.collegiate_number, '') not in ('', '100000', '0000')
    and exists (select 1 from public.cpg_colegiados_cache c where c.numero = q.collegiate_number);

  if cardinality(v_emails) = 0 then
    return 0;
  end if;

  update aulacaeduc.cpg_email_verification_queue
     set activated_by = 'aprobación automática (colegiado verificado)'
   where lower(email) = any (v_emails) and activated_at is null;

  update auth.users
     set email_confirmed_at = now(), updated_at = now()
   where email_confirmed_at is null
     and lower(email) = any (v_emails);
  get diagnostics v_count = row_count;

  update aulacaeduc.cpg_email_verification_queue
     set activated_at = now()
   where lower(email) = any (v_emails) and activated_at is null;

  return v_count;
end;
$$;

revoke all on function aulacaeduc.auto_approve_verification_queue() from public, anon, authenticated;

create or replace function aulacaeduc.admin_verification_queue()
returns table (
  id bigint,
  email text,
  domain text,
  created_at timestamptz,
  collegiate_number text,
  name text,
  tipo text,
  estatus text,
  nombre_cpg text
)
language plpgsql
stable
security definer
set search_path = aulacaeduc, public
as $$
begin
  if not aulacaeduc.is_active_admin() then
    raise exception 'No tienes permisos de administrador';
  end if;
  return query
  select q.id, q.email, q.domain, q.created_at, q.collegiate_number, q.name,
         case
           when coalesce(q.collegiate_number, '') = '' then 'sin_colegiado'
           when q.collegiate_number in ('100000', '0000') then 'invitado'
           when c.numero is null then 'colegiado_no_verificado'
           else 'colegiado'
         end,
         c.estatus,
         c.nombre
  from aulacaeduc.cpg_email_verification_queue q
  left join public.cpg_colegiados_cache c on c.numero = q.collegiate_number
  where q.activated_at is null
  order by q.created_at desc;
end;
$$;

revoke all on function aulacaeduc.admin_verification_queue() from public, anon;
grant execute on function aulacaeduc.admin_verification_queue() to authenticated;
