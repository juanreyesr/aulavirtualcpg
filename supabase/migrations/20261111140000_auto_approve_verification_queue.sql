-- Aprobación automática, cada hora, de la cola de activación (Hotmail/Outlook/Live/MSN).
--
-- Se activa una cuenta de la cola solo si:
--   * sigue pendiente (activated_at is null) y no fue descartada,
--   * tiene número de colegiado vinculado y no es invitado (100000),
--   * ese colegiado aparece ACTIVO en public.cpg_colegiados_cache
--     (la edge function consultar-colegiado lo guarda/actualiza en cada consulta,
--      y el registro siempre consulta el colegiado antes de crear la cuenta).
-- Las demás (inactivos, invitados, sin colegiado) quedan en la cola para revisión manual.

create extension if not exists pg_cron;

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
  join public.cpg_colegiados_cache c on c.numero = q.collegiate_number
  where q.activated_at is null
    and q.notes is distinct from 'Descartado sin activar'
    and coalesce(q.collegiate_number, '') not in ('', '100000')
    and upper(trim(c.estatus)) = 'ACTIVO';

  if cardinality(v_emails) = 0 then
    return 0;
  end if;

  -- 1) Etiquetar quién aprobó (el trigger conserva activated_by)
  update aulacaeduc.cpg_email_verification_queue
     set activated_by = 'aprobación automática (colegiado activo)'
   where lower(email) = any (v_emails) and activated_at is null;

  -- 2) Confirmar las cuentas; el trigger trg_resolve_confirmed_user_in_queue
  --    marca activated_at en la cola
  update auth.users
     set email_confirmed_at = now(), updated_at = now()
   where email_confirmed_at is null
     and lower(email) = any (v_emails);
  get diagnostics v_count = row_count;

  -- 3) Cerrar filas cuya cuenta ya estaba confirmada por otra vía
  update aulacaeduc.cpg_email_verification_queue
     set activated_at = now()
   where lower(email) = any (v_emails) and activated_at is null;

  return v_count;
end;
$$;

revoke all on function aulacaeduc.auto_approve_verification_queue() from public, anon, authenticated;

-- Cada hora, en el minuto 0
select cron.unschedule(jobid) from cron.job where jobname = 'auto_approve_verification_queue';
select cron.schedule(
  'auto_approve_verification_queue',
  '0 * * * *',
  $$select aulacaeduc.auto_approve_verification_queue();$$
);
