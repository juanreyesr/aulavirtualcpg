-- La aplicación Aula Virtual usa el esquema aulacaeduc como predeterminado.
-- Mover la tabla conserva sus datos, sus políticas RLS, permisos y su FK a
-- auth.users, sin modificar ninguna otra tabla o esquema del proyecto.
do $$
begin
  if to_regnamespace('aulacaeduc') is null then
    raise exception 'El esquema esperado aulacaeduc no existe';
  end if;

  if to_regclass('public.cpg_homepage_promo') is not null
     and to_regclass('aulacaeduc.cpg_homepage_promo') is null then
    alter table public.cpg_homepage_promo set schema aulacaeduc;
  end if;
end;
$$;

-- Fuerza a PostgREST a reconocer de inmediato el nuevo esquema de la tabla.
notify pgrst, 'reload schema';
