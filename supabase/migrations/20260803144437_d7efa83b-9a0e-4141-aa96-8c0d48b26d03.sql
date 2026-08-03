
create or replace function public.is_equipe_interna(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id,'admin') or public.has_role(_user_id,'superintendente')
      or public.has_role(_user_id,'administrativo') or public.has_role(_user_id,'lider')
      or public.has_role(_user_id,'comercial')
$$;

-- formulario_respostas
drop policy if exists "Auth lê respostas" on public.formulario_respostas;
drop policy if exists "Auth exclui respostas" on public.formulario_respostas;
create policy "Respostas visiveis por associacao" on public.formulario_respostas
for select to authenticated using (
  public.is_equipe_interna(auth.uid())
  or exists (select 1 from public.formularios f
             where f.id = formulario_respostas.formulario_id
               and f.corretora_id = public.get_user_corretora_id(auth.uid()))
);
create policy "Respostas excluidas por associacao" on public.formulario_respostas
for delete to authenticated using (
  public.is_equipe_interna(auth.uid())
  or exists (select 1 from public.formularios f
             where f.id = formulario_respostas.formulario_id
               and f.corretora_id = public.get_user_corretora_id(auth.uid()))
);

-- registros_ponto
drop policy if exists "Authenticated users can view registros_ponto" on public.registros_ponto;
create policy "Ponto visivel por associacao" on public.registros_ponto
for select to authenticated using (
  public.is_equipe_interna(auth.uid())
  or exists (select 1 from public.funcionarios f
             where f.id = registros_ponto.funcionario_id
               and f.corretora_id = public.get_user_corretora_id(auth.uid()))
);

-- sga_eventos
drop policy if exists "Authenticated users can view sga_eventos" on public.sga_eventos;
drop policy if exists "Authenticated users can insert sga_eventos" on public.sga_eventos;
drop policy if exists "Authenticated users can delete sga_eventos" on public.sga_eventos;
create policy "Eventos visiveis por associacao" on public.sga_eventos
for select to authenticated using (
  public.is_equipe_interna(auth.uid())
  or exists (select 1 from public.sga_importacoes i
             where i.id = sga_eventos.importacao_id
               and i.corretora_id = public.get_user_corretora_id(auth.uid()))
);
create policy "Eventos inseridos por associacao" on public.sga_eventos
for insert to authenticated with check (
  public.is_equipe_interna(auth.uid())
  or exists (select 1 from public.sga_importacoes i
             where i.id = sga_eventos.importacao_id
               and i.corretora_id = public.get_user_corretora_id(auth.uid()))
);
create policy "Eventos excluidos por associacao" on public.sga_eventos
for delete to authenticated using (
  public.is_equipe_interna(auth.uid())
  or exists (select 1 from public.sga_importacoes i
             where i.id = sga_eventos.importacao_id
               and i.corretora_id = public.get_user_corretora_id(auth.uid()))
);
