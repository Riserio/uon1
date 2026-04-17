-- Tabela de configurações globais da Jornada de Trabalho (singleton)
CREATE TABLE IF NOT EXISTS public.jornada_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tolerancia_atraso_minutos INTEGER NOT NULL DEFAULT 10,
  lembretes_automaticos_ativos BOOLEAN NOT NULL DEFAULT true,
  horario_entrada_padrao TIME NOT NULL DEFAULT '08:00',
  horario_saida_almoco_padrao TIME NOT NULL DEFAULT '12:00',
  horario_volta_almoco_padrao TIME NOT NULL DEFAULT '13:00',
  horario_saida_padrao TIME NOT NULL DEFAULT '18:00',
  mensagem_entrada TEXT NOT NULL DEFAULT 'Hora de bater o ponto de entrada!',
  mensagem_saida_almoco TEXT NOT NULL DEFAULT 'Horário de almoço! Não esqueça de bater o ponto.',
  mensagem_volta_almoco TEXT NOT NULL DEFAULT 'Bom retorno! Bata o ponto de volta do almoço.',
  mensagem_saida TEXT NOT NULL DEFAULT 'Fim do expediente! Bata o ponto de saída.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jornada_config ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados podem ler (precisam saber o estado dos lembretes)
CREATE POLICY "Authenticated can read jornada_config"
ON public.jornada_config FOR SELECT
TO authenticated
USING (true);

-- Apenas admin/superintendente/administrativo podem alterar
CREATE POLICY "Admins can insert jornada_config"
ON public.jornada_config FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'superintendente'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

CREATE POLICY "Admins can update jornada_config"
ON public.jornada_config FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'superintendente'::app_role) OR
  has_role(auth.uid(), 'administrativo'::app_role)
);

CREATE TRIGGER update_jornada_config_updated_at
BEFORE UPDATE ON public.jornada_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir registro singleton inicial
INSERT INTO public.jornada_config DEFAULT VALUES;