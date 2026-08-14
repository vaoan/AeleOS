-- 0004 — platform roles.
--
-- Keyed on `identity_sub`, never `actor_ref`: a fursona cannot hold a
-- permission. There is deliberately no column capable of expressing one.
create table public.platform_roles (
  identity_sub  text not null,
  role          text not null,
  synced_at     timestamptz not null default now(),
  primary key (identity_sub, role)
);

alter table public.platform_roles enable row level security;
grant select, insert, update, delete on public.platform_roles to service_role;
revoke all on public.platform_roles from anon, authenticated;

create or replace function public.has_platform_role(role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_roles
    where identity_sub = auth.jwt() ->> 'sub'
      and role = role_key
  )
$$;

revoke all on function public.has_platform_role(text) from public;
