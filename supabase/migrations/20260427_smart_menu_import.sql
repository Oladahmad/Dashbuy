create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('menu-imports', 'menu-imports', false)
on conflict (id) do nothing;

create table if not exists public.menu_import_sessions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  source_file_name text not null,
  source_mime_type text not null,
  source_file_size bigint not null,
  source_storage_path text not null,
  status text not null default 'review',
  extracted_menu jsonb not null default '{}'::jsonb,
  review_menu jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  processing_notes jsonb not null default '[]'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  slug text not null,
  platform_category text not null check (platform_category in ('main','side','protein','swallow','soup','drink','extra')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, slug)
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.menu_import_sessions(id) on delete set null,
  vendor_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  name text not null,
  description text,
  notes text,
  base_price integer,
  pricing_type text not null check (pricing_type in ('fixed','per_scoop','per_unit','variant')),
  food_type text not null check (food_type in ('single','combo')),
  unit_label text,
  image_url text,
  source_confidence numeric(4,3) not null default 0.5,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_variants (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  size_label text,
  price integer not null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_combos (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  component_names jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_image_cache (
  query_key text primary key,
  image_url text not null,
  source_provider text not null check (source_provider in ('search','generated')),
  updated_at timestamptz not null default now()
);

create index if not exists menu_import_sessions_vendor_idx on public.menu_import_sessions (vendor_id, created_at desc);
create index if not exists menu_items_vendor_idx on public.menu_items (vendor_id, created_at desc);

alter table public.menu_import_sessions enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_variants enable row level security;
alter table public.menu_combos enable row level security;
alter table public.menu_image_cache enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_import_sessions' and policyname = 'vendors_manage_own_menu_import_sessions'
  ) then
    create policy vendors_manage_own_menu_import_sessions on public.menu_import_sessions
      for all using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_categories' and policyname = 'vendors_manage_own_menu_categories'
  ) then
    create policy vendors_manage_own_menu_categories on public.menu_categories
      for all using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_items' and policyname = 'vendors_manage_own_menu_items'
  ) then
    create policy vendors_manage_own_menu_items on public.menu_items
      for all using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_variants' and policyname = 'vendors_manage_menu_variants'
  ) then
    create policy vendors_manage_menu_variants on public.menu_variants
      for all using (
        exists (
          select 1 from public.menu_items mi
          where mi.id = menu_item_id and mi.vendor_id = auth.uid()
        )
      ) with check (
        exists (
          select 1 from public.menu_items mi
          where mi.id = menu_item_id and mi.vendor_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_combos' and policyname = 'vendors_manage_menu_combos'
  ) then
    create policy vendors_manage_menu_combos on public.menu_combos
      for all using (
        exists (
          select 1 from public.menu_items mi
          where mi.id = menu_item_id and mi.vendor_id = auth.uid()
        )
      ) with check (
        exists (
          select 1 from public.menu_items mi
          where mi.id = menu_item_id and mi.vendor_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'menu_image_cache' and policyname = 'service_role_menu_image_cache'
  ) then
    create policy service_role_menu_image_cache on public.menu_image_cache
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;
