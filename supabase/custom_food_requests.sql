-- Dashbuy test-run custom food request tables
-- Run this in Supabase SQL Editor before testing the new Custom Plate flow.

create table if not exists public.custom_food_requests (
  id uuid primary key default extensions.uuid_generate_v4(),
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  vendor_id uuid not null references public.profiles (id) on delete cascade,
  restaurant_name text not null,
  plate_name text not null default 'Custom Plate',
  plate_fee numeric not null default 200,
  items_subtotal numeric not null default 0,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists custom_food_requests_order_id_idx
  on public.custom_food_requests(order_id);
create index if not exists custom_food_requests_created_at_idx
  on public.custom_food_requests(created_at desc);

create table if not exists public.custom_food_request_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  request_id uuid not null references public.custom_food_requests (id) on delete cascade,
  food_name text not null,
  units integer not null check (units > 0),
  unit_price numeric not null check (unit_price >= 0),
  line_total numeric not null check (line_total >= 0)
);

create index if not exists custom_food_request_items_request_id_idx
  on public.custom_food_request_items(request_id);

-- Recommended for security parity (optional if you only read/write with service role)
alter table public.custom_food_requests enable row level security;
alter table public.custom_food_request_items enable row level security;

drop policy if exists custom_food_requests_customer_rw on public.custom_food_requests;
create policy custom_food_requests_customer_rw
  on public.custom_food_requests
  for all
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

drop policy if exists custom_food_request_items_customer_rw on public.custom_food_request_items;
create policy custom_food_request_items_customer_rw
  on public.custom_food_request_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.custom_food_requests r
      where r.id = request_id and r.customer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.custom_food_requests r
      where r.id = request_id and r.customer_id = auth.uid()
    )
  );
