-- Aula Virtual CPG (MVP) - Esquema Supabase (Postgres)
-- Ejecutar en Supabase > SQL Editor

-- 1) Extensiones
create extension if not exists "pgcrypto";

-- 2) Tabla perfiles (roles)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

-- Trigger para crear perfil automáticamente al crear usuario en Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'member')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 3) Categorías y cursos (videos)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  sort_order int default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  description text,
  youtube_url text,
  youtube_video_id text,
  cover_image_url text,
  duration_seconds int,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_courses_updated_at on public.courses;
create trigger set_courses_updated_at
before update on public.courses
for each row execute procedure public.set_updated_at();

-- 4) Evaluaciones
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  is_enabled boolean not null default false,
  pass_percent int not null default 80,
  created_at timestamptz not null default now(),
  unique(course_id)
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  sort_order int not null default 1,
  question text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  correct_option char(1) not null check (correct_option in ('A','B','C')),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  colegiado text not null,
  answers jsonb not null,
  score_percent int not null,
  passed boolean not null,
  verify_code text unique,
  created_at timestamptz not null default now()
);

-- 5) Seguridad: Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.courses enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;

-- Helper: es admin?
create or replace function public.is_admin(uid uuid)
returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$ language sql stable;

-- Profiles: cada usuario ve su perfil; admin puede ver todos
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

-- Categories: autenticados pueden leer; solo admin escribe
drop policy if exists "categories_select_auth" on public.categories;
create policy "categories_select_auth" on public.categories
for select using (auth.role() = 'authenticated');

drop policy if exists "categories_admin_write" on public.categories;
create policy "categories_admin_write" on public.categories
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Courses: autenticados leen solo publicados; admin ve todo y escribe
drop policy if exists "courses_select_published" on public.courses;
create policy "courses_select_published" on public.courses
for select using (published = true or public.is_admin(auth.uid()));

drop policy if exists "courses_admin_write" on public.courses;
create policy "courses_admin_write" on public.courses
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Quizzes: autenticados leen solo habilitados y curso publicado; admin escribe y lee todo
drop policy if exists "quizzes_select_enabled" on public.quizzes;
create policy "quizzes_select_enabled" on public.quizzes
for select using (
  public.is_admin(auth.uid())
  or (
    is_enabled = true
    and exists (select 1 from public.courses c where c.id = course_id and c.published = true)
  )
);

drop policy if exists "quizzes_admin_write" on public.quizzes;
create policy "quizzes_admin_write" on public.quizzes
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Questions: autenticados leen solo si evaluación habilitada; admin escribe
drop policy if exists "questions_select_enabled" on public.quiz_questions;
create policy "questions_select_enabled" on public.quiz_questions
for select using (
  public.is_admin(auth.uid())
  or exists (select 1 from public.quizzes q where q.id = quiz_id and q.is_enabled = true)
);

drop policy if exists "questions_admin_write" on public.quiz_questions;
create policy "questions_admin_write" on public.quiz_questions
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Attempts: el usuario solo ve los suyos; inserta solo los suyos; admin ve todo
drop policy if exists "attempts_select_own" on public.quiz_attempts;
create policy "attempts_select_own" on public.quiz_attempts
for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "attempts_insert_own" on public.quiz_attempts;
create policy "attempts_insert_own" on public.quiz_attempts
for insert with check (user_id = auth.uid());

-- Updates de attempts no permitidos por defecto (inmutables)
revoke update, delete on public.quiz_attempts from anon, authenticated;

-- 6) Recomendación: deshabilitar acceso anónimo a tablas (se controla por RLS).

-- =========================
-- V2: Certificados con folio correlativo y registro histórico
-- =========================

-- Tabla de configuración del certificado (1 fila)
create table if not exists public.certificate_settings (
  id int primary key default 1,
  institution_name text not null default 'Colegio de Psicólogos de Guatemala',
  header_line text not null default 'Certificado de Aprobación',
  city text not null default 'Guatemala',
  country text not null default 'Guatemala',
  logo_url text,
  background_watermark_url text,
  signer1_name text not null default 'Presidencia',
  signer1_title text not null default 'Junta Directiva',
  signer1_image_url text,
  signer2_name text not null default 'Secretaría',
  signer2_title text not null default 'Junta Directiva',
  signer2_image_url text,
  footer_note text default 'Documento emitido digitalmente a través del Aula Virtual.',
  updated_at timestamptz not null default now(),
  constraint certificate_settings_singleton check (id = 1)
);

insert into public.certificate_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.set_updated_at_certificate_settings()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_certificate_settings_updated_at on public.certificate_settings;
create trigger set_certificate_settings_updated_at
before update on public.certificate_settings
for each row execute procedure public.set_updated_at_certificate_settings();

-- Secuencia para folio correlativo
create sequence if not exists public.certificate_folio_seq;

-- Tabla de certificados (registro histórico)
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.quiz_attempts(id) on delete cascade,

  -- campos derivados (se llenan por trigger para evitar manipulación)
  user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  full_name text,
  colegiado text,
  course_title text,
  duration_seconds int,

  issued_at timestamptz not null default now(),
  folio_number bigint not null default nextval('public.certificate_folio_seq'),
  folio_code text unique,
  verify_code text unique,

  settings_snapshot jsonb not null default '{}'::jsonb
);

-- Genera folio_code: CPG-AV-YYYY-000001
create or replace function public.set_certificate_codes()
returns trigger as $$
declare
  y text;
begin
  if new.issued_at is null then
    new.issued_at = now();
  end if;

  y := to_char(new.issued_at, 'YYYY');

  if new.folio_code is null then
    new.folio_code := 'CPG-AV-' || y || '-' || lpad(new.folio_number::text, 6, '0');
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists set_certificate_codes_trigger on public.certificates;
create trigger set_certificate_codes_trigger
before insert on public.certificates
for each row execute procedure public.set_certificate_codes();

-- Población de campos del certificado desde el attempt + course + settings
create or replace function public.populate_certificate_fields()
returns trigger as $$
declare
  a record;
  c record;
  s jsonb;
begin
  select * into a from public.quiz_attempts where id = new.attempt_id;
  if not found then
    raise exception 'Attempt no encontrado';
  end if;

  if a.passed is distinct from true then
    raise exception 'Solo se emiten certificados para evaluaciones aprobadas';
  end if;

  -- Derivar campos
  new.user_id := a.user_id;
  new.course_id := a.course_id;
  new.full_name := a.full_name;
  new.colegiado := a.colegiado;
  new.verify_code := coalesce(new.verify_code, a.verify_code);

  select title, duration_seconds into c from public.courses where id = a.course_id;
  if found then
    new.course_title := c.title;
    new.duration_seconds := c.duration_seconds;
  end if;

  select to_jsonb(cs) into s from public.certificate_settings cs where cs.id = 1;
  new.settings_snapshot := coalesce(s, '{}'::jsonb);

  return new;
end;
$$ language plpgsql;

drop trigger if exists populate_certificate_fields_trigger on public.certificates;
create trigger populate_certificate_fields_trigger
before insert on public.certificates
for each row execute procedure public.populate_certificate_fields();

-- RLS para nuevas tablas
alter table public.certificate_settings enable row level security;
alter table public.certificates enable row level security;

-- certificate_settings: cualquiera puede leer; solo admin puede actualizar
drop policy if exists "cert_settings_select_all" on public.certificate_settings;
create policy "cert_settings_select_all" on public.certificate_settings
for select using (true);

drop policy if exists "cert_settings_admin_write" on public.certificate_settings;
create policy "cert_settings_admin_write" on public.certificate_settings
for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- certificates: el usuario ve los suyos; admin ve todo
drop policy if exists "certificates_select_own" on public.certificates;
create policy "certificates_select_own" on public.certificates
for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Insert: el usuario solo puede emitir para su propio attempt (garantizado por trigger + WITH CHECK)
drop policy if exists "certificates_insert_own" on public.certificates;
create policy "certificates_insert_own" on public.certificates
for insert with check (
  exists (
    select 1 from public.quiz_attempts a
    where a.id = attempt_id and a.user_id = auth.uid() and a.passed = true
  )
);

revoke update, delete on public.certificates from anon, authenticated;

-- Función pública de verificación (exposición mínima)
create or replace function public.get_certificate_public(p_code text)
returns table (
  folio_code text,
  full_name text,
  colegiado text,
  course_title text,
  duration_seconds int,
  issued_at timestamptz,
  verify_code text
)
language sql
security definer
set search_path = public
as $$
  select
    c.folio_code,
    c.full_name,
    c.colegiado,
    c.course_title,
    c.duration_seconds,
    c.issued_at,
    c.verify_code
  from public.certificates c
  where c.verify_code = p_code
  limit 1;
$$;

grant execute on function public.get_certificate_public(text) to anon, authenticated;

-- Función para generar PDF por código (incluye snapshot de settings)
create or replace function public.get_certificate_pdf(p_code text)
returns table (
  attempt_id uuid,
  folio_code text,
  full_name text,
  colegiado text,
  course_title text,
  duration_seconds int,
  issued_at timestamptz,
  verify_code text,
  settings_snapshot jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.attempt_id,
    c.folio_code,
    c.full_name,
    c.colegiado,
    c.course_title,
    c.duration_seconds,
    c.issued_at,
    c.verify_code,
    c.settings_snapshot
  from public.certificates c
  where c.verify_code = p_code
  limit 1;
$$;

grant execute on function public.get_certificate_pdf(text) to anon, authenticated;
