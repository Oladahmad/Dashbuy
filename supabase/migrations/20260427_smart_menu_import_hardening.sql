do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_import_sessions_status_check'
  ) then
    alter table public.menu_import_sessions
      add constraint menu_import_sessions_status_check
      check (status in ('review', 'publishing', 'published', 'failed'));
  end if;
end $$;

create index if not exists menu_import_sessions_status_idx
  on public.menu_import_sessions (vendor_id, status, created_at desc);

create index if not exists menu_items_session_idx
  on public.menu_items (session_id, vendor_id, created_at desc);

create index if not exists menu_variants_menu_item_idx
  on public.menu_variants (menu_item_id, sort_order);

create index if not exists menu_combos_menu_item_idx
  on public.menu_combos (menu_item_id);
