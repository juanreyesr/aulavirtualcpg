-- Cola de activación manual (Hotmail/Outlook/Live/MSN) alimentada desde el servidor.
--
-- Problema: el frontend insertaba en aulacaeduc.cpg_email_verification_queue
-- justo después de signUp(), cuando el usuario aún es anónimo (sin sesión).
-- El upsert (INSERT ... ON CONFLICT DO UPDATE) choca con RLS (la política de
-- UPDATE exige admin) y el error se tragaba en silencio: desde junio 2026 no
-- entró ninguna cuenta a la cola aunque había decenas sin confirmar.
--
-- Solución: triggers SECURITY DEFINER sobre auth.users (no dependen de RLS
-- ni de la sesión del navegador) + backfill de las cuentas existentes.

create or replace function aulacaeduc.is_problematic_email_domain(p_email text)
returns boolean
language sql immutable
as $$
  select split_part(lower(coalesce(p_email, '')), '@', 2) ~ '^(hotmail|outlook|live|msn|windowslive|passport)\.'
$$;

-- 1) Nueva cuenta sin confirmar con dominio Microsoft → entra a la cola
create or replace function aulacaeduc.enqueue_unconfirmed_ms_user()
returns trigger
language plpgsql
security definer
set search_path = aulacaeduc, public
as $$
begin
  if new.email_confirmed_at is null and aulacaeduc.is_problematic_email_domain(new.email) then
    insert into aulacaeduc.cpg_email_verification_queue (email, collegiate_number, name, domain)
    select lower(new.email), p.collegiate_number::text, p.name, split_part(lower(new.email), '@', 2)
    from (select 1) x
    left join lateral (
      select collegiate_number, name from aulacaeduc.cpg_user_profiles
      where lower(email) = lower(new.email) order by created_at desc limit 1
    ) p on true
    on conflict (email) do update
      set activated_at = null, activated_by = null, notes = null, created_at = now()
      where aulacaeduc.cpg_email_verification_queue.activated_at is not null;
  end if;
  return new;
exception when others then
  -- Nunca bloquear el registro por un fallo en la cola
  return new;
end;
$$;

drop trigger if exists trg_enqueue_unconfirmed_ms_user on auth.users;
create trigger trg_enqueue_unconfirmed_ms_user
  after insert on auth.users
  for each row execute function aulacaeduc.enqueue_unconfirmed_ms_user();

-- 2) Cuando la cuenta se confirma (por correo o por un admin) → sale de la cola
create or replace function aulacaeduc.resolve_confirmed_user_in_queue()
returns trigger
language plpgsql
security definer
set search_path = aulacaeduc, public
as $$
begin
  update aulacaeduc.cpg_email_verification_queue
     set activated_at = coalesce(new.email_confirmed_at, now()),
         activated_by = coalesce(activated_by, 'confirmación automática')
   where lower(email) = lower(new.email) and activated_at is null;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_resolve_confirmed_user_in_queue on auth.users;
create trigger trg_resolve_confirmed_user_in_queue
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function aulacaeduc.resolve_confirmed_user_in_queue();

-- 3) El perfil (colegiado/nombre) se guarda después del signUp → completar la fila
create or replace function aulacaeduc.fill_queue_from_profile()
returns trigger
language plpgsql
security definer
set search_path = aulacaeduc, public
as $$
begin
  update aulacaeduc.cpg_email_verification_queue
     set collegiate_number = coalesce(nullif(collegiate_number, ''), new.collegiate_number::text),
         name = coalesce(nullif(name, ''), new.name)
   where lower(email) = lower(new.email) and activated_at is null;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_fill_queue_from_profile on aulacaeduc.cpg_user_profiles;
create trigger trg_fill_queue_from_profile
  after insert or update of email, name, collegiate_number on aulacaeduc.cpg_user_profiles
  for each row execute function aulacaeduc.fill_queue_from_profile();

-- 4) Backfill: todas las cuentas Microsoft sin confirmar que ya existen
insert into aulacaeduc.cpg_email_verification_queue (email, collegiate_number, name, domain, created_at)
select distinct on (lower(u.email))
       lower(u.email), p.collegiate_number::text, p.name, split_part(lower(u.email), '@', 2), u.created_at
from auth.users u
left join lateral (
  select collegiate_number, name from aulacaeduc.cpg_user_profiles
  where lower(email) = lower(u.email) order by created_at desc limit 1
) p on true
where u.email_confirmed_at is null
  and aulacaeduc.is_problematic_email_domain(u.email)
order by lower(u.email), u.created_at desc
on conflict (email) do update
  set activated_at = null, activated_by = null, notes = null,
      collegiate_number = coalesce(excluded.collegiate_number, aulacaeduc.cpg_email_verification_queue.collegiate_number),
      name = coalesce(excluded.name, aulacaeduc.cpg_email_verification_queue.name)
  where aulacaeduc.cpg_email_verification_queue.notes is distinct from 'Descartado sin activar'
    and (aulacaeduc.cpg_email_verification_queue.activated_at is not null
         or aulacaeduc.cpg_email_verification_queue.collegiate_number is null);

-- Ya no se permite insertar desde el cliente: lo hace el trigger
drop policy if exists "Insert queue" on aulacaeduc.cpg_email_verification_queue;
