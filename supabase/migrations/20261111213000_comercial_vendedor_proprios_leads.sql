-- Comercial: usuário com cargo restrito (ex.: Vendedor) vê só os leads em que
-- é o vendedor responsável.
--
-- Regra configurável no cargo: subitem "comercial:todos-leads" (Leads de todos
-- os vendedores). Oculto => só os próprios leads. Sem regra => vê todos
-- (comportamento anterior). Admin/superintendente sempre veem todos.
-- Aplicado em produção via SQL (backend Lovable Cloud) em 11/11/2026.

-- 1) Vínculo vendedor ↔ usuário do sistema
alter table public.comercial_vendedores
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;
create unique index if not exists comercial_vendedores_profile_id_key
  on public.comercial_vendedores(profile_id) where profile_id is not null;

-- vincula automaticamente quem já tem o mesmo e-mail
update public.comercial_vendedores v
   set profile_id = p.id
  from public.profiles p
 where v.profile_id is null and v.email is not null and lower(p.email) = lower(v.email)
   and not exists (select 1 from public.comercial_vendedores x where x.profile_id = p.id);

-- 2) Funções auxiliares (security definer: leem permissões sem esbarrar em RLS)
create or replace function public.comercial_ve_todos_leads(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from user_roles where user_id = _uid and role in ('admin','superintendente')) then true
    else coalesce(
      (select pode_visualizar from user_menu_permissions
        where user_id = _uid and menu_item = 'comercial:todos-leads' limit 1),
      (select cmp.pode_visualizar from cargo_menu_permissions cmp
         join profiles p on p.cargo_id = cmp.cargo_id
        where p.id = _uid and cmp.menu_item = 'comercial:todos-leads' limit 1),
      (select rmp.pode_visualizar from role_menu_permissions rmp
         join user_roles ur on ur.role = rmp.role
        where ur.user_id = _uid and rmp.menu_item = 'comercial:todos-leads' limit 1),
      true)
  end
$$;

create or replace function public.comercial_pode_ver_lead(_uid uuid, _vendedor_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.comercial_ve_todos_leads(_uid)
      or (_vendedor_id is not null and exists (
            select 1 from comercial_vendedores v where v.id = _vendedor_id and v.profile_id = _uid))
$$;

-- 3) Políticas
drop policy if exists "Comercial internos gerenciam leads" on public.comercial_leads;
create policy "Comercial internos gerenciam leads" on public.comercial_leads
  for all to authenticated
  using (not has_role(auth.uid(), 'parceiro'::app_role) and public.comercial_pode_ver_lead(auth.uid(), vendedor_id))
  with check (not has_role(auth.uid(), 'parceiro'::app_role) and public.comercial_pode_ver_lead(auth.uid(), vendedor_id));

drop policy if exists "Comercial internos leem historico" on public.comercial_lead_historico;
create policy "Comercial internos leem historico" on public.comercial_lead_historico
  for select to authenticated
  using (not has_role(auth.uid(), 'parceiro'::app_role) and exists (
    select 1 from public.comercial_leads l
     where l.id = lead_id and public.comercial_pode_ver_lead(auth.uid(), l.vendedor_id)));

-- 4) Cargo "Vendedor": só os próprios leads
insert into public.cargo_menu_permissions (cargo_id, menu_item, pode_visualizar, pode_editar)
select c.id, 'comercial:todos-leads', false, false from public.cargos c
 where c.nome = 'Vendedor'
   and not exists (select 1 from public.cargo_menu_permissions x where x.cargo_id = c.id and x.menu_item = 'comercial:todos-leads');
