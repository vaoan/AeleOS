-- Keyed on identity_sub, never actor_ref: a fursona cannot hold a permission
-- (spec §7). There is deliberately no column capable of expressing one.
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

-- security definer: strip the default PUBLIC execute grant before granting.
revoke all on function public.has_platform_role(text) from public;
grant execute on function public.has_platform_role(text) to authenticated;
