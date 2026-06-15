
-- 1) Permitir equipes sem líder direto (lideranças vivem em equipe_lideres)
ALTER TABLE public.equipes ALTER COLUMN lider_id DROP NOT NULL;

-- 2) Garantir unicidade do nome do cargo e popular cargos padrão
CREATE UNIQUE INDEX IF NOT EXISTS cargos_nome_unique_idx ON public.cargos (LOWER(nome));

INSERT INTO public.cargos (nome, descricao, cor, ativo)
SELECT v.nome, v.descricao, v.cor, true
FROM (VALUES
  ('Superintendente',  'Gestão executiva da associação',           '#6366f1'),
  ('Administrativo',   'Suporte e operação administrativa',        '#8b5cf6'),
  ('Líder',            'Liderança de equipe comercial',            '#ec4899'),
  ('Comercial',        'Atendimento e vendas',                     '#f97316'),
  ('Analista de Sinistros', 'Análise e tratamento de sinistros',   '#ef4444'),
  ('Financeiro',       'Gestão financeira e cobrança',             '#22c55e'),
  ('Atendimento',      'Atendimento ao associado',                 '#14b8a6'),
  ('Ouvidoria',        'Tratamento de manifestações',              '#0ea5e9'),
  ('Vistoriador',      'Realização de vistorias',                  '#eab308'),
  ('Parceiro',         'Acesso parceiro / portal',                 '#64748b')
) AS v(nome, descricao, cor)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cargos c WHERE LOWER(c.nome) = LOWER(v.nome)
);
