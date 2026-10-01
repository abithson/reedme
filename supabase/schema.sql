-- MoneyTrail Supabase schema (PostgreSQL).
-- Run in the Supabase SQL editor. Every business-scoped table is protected by RLS.
-- Never put a service-role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  business_type text not null default 'retail',
  country text not null default 'NG' check (country ~ '^[A-Z]{2}$'),
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  phone text,
  phone_normalized text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone_normalized),
  unique (id, business_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid,
  order_number text not null,
  customer_name text not null,
  customer_phone text,
  order_date date not null,
  due_date date,
  amount numeric(16,2) not null check (amount >= 0),
  recorded_paid numeric(16,2) not null default 0 check (recorded_paid >= 0),
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  duplicate_flag boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  constraint order_customer_business_fk foreign key (customer_id, business_id)
    references public.customers(id, business_id) deferrable initially deferred
);

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('customers', 'orders', 'transactions')),
  file_name text not null,
  source text not null default 'csv',
  rows_seen integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  matched_count integer not null default 0,
  unmatched_count integer not null default 0,
  needs_review_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  import_id uuid,
  transaction_date timestamptz not null,
  reference text,
  description text not null default '',
  amount numeric(16,2) not null check (amount >= 0),
  transaction_type text not null check (transaction_type in ('credit', 'debit')),
  sender_name text,
  sender_phone text,
  channel text,
  balance numeric(16,2),
  matched_order_id uuid,
  match_status text not null default 'unmatched' check (match_status in ('unmatched', 'possible', 'matched', 'ignored')),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  match_reason text,
  duplicate_flag boolean not null default false,
  duplicate_of uuid,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  constraint transaction_import_business_fk foreign key (import_id, business_id)
    references public.imports(id, business_id) on delete set null (import_id),
  constraint transaction_order_business_fk foreign key (matched_order_id, business_id)
    references public.orders(id, business_id) deferrable initially deferred,
  constraint transaction_duplicate_business_fk foreign key (duplicate_of, business_id)
    references public.transactions(id, business_id) on delete set null (duplicate_of)
);

create table if not exists public.transaction_matches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  transaction_id uuid not null,
  order_id uuid not null,
  amount numeric(16,2) not null check (amount >= 0),
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  match_method text not null default 'manual_review',
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint match_transaction_business_fk foreign key (transaction_id, business_id)
    references public.transactions(id, business_id) on delete cascade,
  constraint match_order_business_fk foreign key (order_id, business_id)
    references public.orders(id, business_id) on delete cascade
);

create table if not exists public.exceptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  fingerprint text not null,
  type text not null check (type in (
    'UNMATCHED_PAYMENT', 'UNPAID_ORDER', 'PARTIAL_PAYMENT', 'OVERDUE_PAYMENT',
    'POSSIBLE_DUPLICATE', 'AMOUNT_MISMATCH', 'UNUSUAL_TRANSACTION'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high')),
  state text not null default 'open' check (state in ('open', 'resolved', 'dismissed')),
  title text not null,
  description text not null,
  amount numeric(16,2) not null default 0 check (amount >= 0),
  related_order_id uuid,
  related_transaction_id uuid,
  evidence jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, fingerprint),
  constraint exception_order_business_fk foreign key (related_order_id, business_id)
    references public.orders(id, business_id) on delete cascade,
  constraint exception_transaction_business_fk foreign key (related_transaction_id, business_id)
    references public.transactions(id, business_id) on delete cascade
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Upgrade older NGN-only installs to country-aware workspaces and neutral amount column names.
alter table public.businesses add column if not exists country text not null default 'NG';
alter table public.businesses drop constraint if exists businesses_country_check;
alter table public.businesses drop constraint if exists businesses_currency_check;
alter table public.businesses add constraint businesses_country_check check (country ~ '^[A-Z]{2}$');
alter table public.businesses add constraint businesses_currency_check check (currency ~ '^[A-Z]{3}$');

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'amount_ngn')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'amount') then
    alter table public.orders rename column amount_ngn to amount;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'recorded_paid_ngn')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'recorded_paid') then
    alter table public.orders rename column recorded_paid_ngn to recorded_paid;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'amount_ngn')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'amount') then
    alter table public.transactions rename column amount_ngn to amount;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'balance_ngn')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'balance') then
    alter table public.transactions rename column balance_ngn to balance;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transaction_matches' and column_name = 'amount_ngn')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'transaction_matches' and column_name = 'amount') then
    alter table public.transaction_matches rename column amount_ngn to amount;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'exceptions' and column_name = 'amount_ngn')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'exceptions' and column_name = 'amount') then
    alter table public.exceptions rename column amount_ngn to amount;
  end if;
end $$;

create index if not exists business_members_user_idx on public.business_members(user_id);
create index if not exists customers_business_name_idx on public.customers(business_id, name);
create index if not exists orders_business_date_idx on public.orders(business_id, order_date desc);
create index if not exists orders_business_due_idx on public.orders(business_id, due_date);
create index if not exists orders_business_number_idx on public.orders(business_id, order_number);
create index if not exists transactions_business_date_idx on public.transactions(business_id, transaction_date desc);
create index if not exists transactions_business_reference_idx on public.transactions(business_id, reference);
create index if not exists transactions_business_match_idx on public.transactions(business_id, match_status);
create index if not exists exceptions_business_state_idx on public.exceptions(business_id, state, created_at desc);
create index if not exists audit_logs_business_created_idx on public.audit_logs(business_id, created_at desc);

-- These SECURITY DEFINER helpers prevent recursive business_members RLS checks.
-- They expose only a boolean and can only be executed by authenticated users.
create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_business_role(uuid, text[]) from public;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;

-- New users create a workspace through this function, which binds ownership to auth.uid().
-- Drop the earlier two-argument RPC so PostgREST has one unambiguous create_business function.
drop function if exists public.create_business(text, text);
create or replace function public.create_business(
  business_name text,
  business_type text default 'retail',
  business_country text default 'NG',
  business_currency text default 'NGN',
  business_timezone text default 'UTC'
)
returns public.businesses
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  created_business public.businesses;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(business_name)) < 1 or length(trim(business_name)) > 120 then
    raise exception 'Business name must be between 1 and 120 characters';
  end if;
  if coalesce(business_country, '') !~ '^[A-Z]{2}$' then
    raise exception 'Country must be a two-letter uppercase ISO code';
  end if;
  if coalesce(business_currency, '') !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter uppercase ISO code';
  end if;
  if not exists (select 1 from pg_timezone_names where name = business_timezone) then
    raise exception 'Choose a valid timezone';
  end if;

  insert into public.businesses(name, business_type, country, currency, timezone)
  values (
    trim(business_name),
    coalesce(nullif(trim(business_type), ''), 'retail'),
    business_country,
    business_currency,
    business_timezone
  )
  returning * into created_business;

  insert into public.business_members(business_id, user_id, role)
  values (created_business.id, auth.uid(), 'owner');

  return created_business;
end;
$$;

revoke all on function public.create_business(text, text, text, text, text) from public;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.businesses, public.business_members,
  public.customers, public.orders, public.imports, public.transactions,
  public.transaction_matches, public.exceptions, public.audit_logs to authenticated;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.imports enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_matches enable row level security;
alter table public.exceptions enable row level security;
alter table public.audit_logs enable row level security;

-- Make this script safe to rerun after a partial setup.
drop policy if exists "Members can read their businesses" on public.businesses;
drop policy if exists "Owners and admins can update their businesses" on public.businesses;
drop policy if exists "Members can read memberships in their businesses" on public.business_members;
drop policy if exists "Owners and admins can manage memberships" on public.business_members;
create policy "Members can read their businesses" on public.businesses
for select to authenticated using (public.is_business_member(id));
create policy "Owners and admins can update their businesses" on public.businesses
for update to authenticated using (public.has_business_role(id, array['owner','admin']))
with check (public.has_business_role(id, array['owner','admin']));
create policy "Members can read memberships in their businesses" on public.business_members
for select to authenticated using (user_id = auth.uid() or public.is_business_member(business_id));
create policy "Owners and admins can manage memberships" on public.business_members
for all to authenticated using (public.has_business_role(business_id, array['owner','admin']))
with check (public.has_business_role(business_id, array['owner','admin']));

-- Business-scoped data: viewers can read; members can insert/update; admins can delete.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['customers','orders','transactions','imports','exceptions'] loop
    execute format('drop policy if exists %I on public.%I', 'Members can read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'Members can insert ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'Members can update ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'Admins can delete ' || table_name, table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_business_member(business_id))', 'Members can read ' || table_name, table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_business_role(business_id, array[''owner'',''admin'',''member'']))', 'Members can insert ' || table_name, table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_business_role(business_id, array[''owner'',''admin'',''member''])) with check (public.has_business_role(business_id, array[''owner'',''admin'',''member'']))', 'Members can update ' || table_name, table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_business_role(business_id, array[''owner'',''admin'']))', 'Admins can delete ' || table_name, table_name);
  end loop;
end $$;

-- Match history and audit logs are append-only from the client.
drop policy if exists "Members can read transaction_matches" on public.transaction_matches;
drop policy if exists "Members can insert transaction_matches" on public.transaction_matches;
drop policy if exists "Members can read audit_logs" on public.audit_logs;
drop policy if exists "Members can insert audit_logs" on public.audit_logs;
create policy "Members can read transaction_matches" on public.transaction_matches
for select to authenticated using (public.is_business_member(business_id));
create policy "Members can insert transaction_matches" on public.transaction_matches
for insert to authenticated with check (public.has_business_role(business_id, array['owner','admin','member']));
create policy "Members can read audit_logs" on public.audit_logs
for select to authenticated using (public.is_business_member(business_id));
create policy "Members can insert audit_logs" on public.audit_logs
for insert to authenticated with check (public.has_business_role(business_id, array['owner','admin','member']));
