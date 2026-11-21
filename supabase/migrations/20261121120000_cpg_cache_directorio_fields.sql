-- El CPG migró la consulta de colegiados a https://pagos.cpg.org.gt/document/directorio.
-- La edge function consultar-colegiado ahora guarda en la caché los campos que
-- publica el directorio nuevo. Columnas nuevas, opcionales y compatibles.
--   estado_cpg   : estado tal como lo reporta el CPG (ACTIVO, INACTIVO, EXENTO, …)
--   activo_hasta : fecha "Activo hasta" (dd/mm/aaaa)
--   carrera      : profesión registrada
-- `estatus` sigue siendo ACTIVO/INACTIVO; los EXENTOS se guardan como ACTIVO.
-- El DPI que expone el directorio no se guarda.

alter table public.cpg_colegiados_cache
  add column if not exists estado_cpg   text,
  add column if not exists activo_hasta text,
  add column if not exists carrera      text;
