-- 0014 — a person can find out their own public address.
--
-- `0011` gives everybody a permanent number and optionally a vanity, and `0012`
-- serves their profile at `/{address}`. Nothing let them LEARN that address:
-- `person_addresses` grants no client role anything, deliberately, because a
-- readable table is an enumerator over every person on the platform.
--
-- So somebody could have a public profile and no way to discover its URL, which
-- makes the page unshareable by the one person it belongs to. This closes that
-- without opening the table.
--
-- It returns **one row for the caller only**, resolved through
-- `current_person_ref()` — so it carries the active-person filter with it, and
-- a suspended person is told nothing rather than handed a link to a page that
-- no longer serves.
--
-- The canonical address is the vanity when there is one, else the number,
-- matching what `public_person` reports. Both keep resolving; this is the one
-- to show somebody and the one to put in a link.
create or replace function public.my_address()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pa.address
    from public.person_addresses pa
   where pa.actor_ref = public.current_person_ref()
   order by (pa.kind = 'vanity') desc, pa.created_at
   limit 1
$$;

revoke all on function public.my_address() from public, anon;
grant execute on function public.my_address() to authenticated;
grant execute on function public.my_address() to service_role;
