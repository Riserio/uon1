-- Tabela para armazenar histórico diário de inadimplência
CREATE TABLE public.cobranca_inadimplencia_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  mes_referencia VARCHAR(7) NOT NULL, -- formato YYYY-MM
  dia INTEGER NOT NULL CHECK (dia >= 1 AND dia <= 31),
  data_registro DATE NOT NULL, -- data em que foi registrado
  percentual_inadimplencia NUMERIC(6,4) NOT NULL DEFAULT 0, -- ex: 8.5432%
  qtde_abertos INTEGER NOT NULL DEFAULT 0,
  qtde_emitidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(corretora_id, mes_referencia, dia, data_registro)
);

-- Índices para performance
CREATE INDEX idx_cobranca_inadimplencia_historico_lookup 
  ON public.cobranca_inadimplencia_historico(corretora_id, mes_referencia, data_registro);

-- Enable RLS
ALTER TABLE public.cobranca_inadimplencia_historico ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários autenticados podem visualizar histórico"
  ON public.cobranca_inadimplencia_historico FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir histórico"
  ON public.cobranca_inadimplencia_historico FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar histórico"
  ON public.cobranca_inadimplencia_historico FOR UPDATE
  TO authenticated
  USING (true);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cobranca_inadimplencia_historico;

COMMENT ON TABLE public.cobranca_inadimplencia_historico IS 'Armazena snapshots diários da inadimplência real para comparação histórica';
COMMENT ON COLUMN public.cobranca_inadimplencia_historico.data_registro IS 'Data em que o snapshot foi registrado (para comparar diferentes dias)';