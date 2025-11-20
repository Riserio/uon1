-- Adicionar novos campos na tabela vistorias
ALTER TABLE vistorias
ADD COLUMN IF NOT EXISTS crlv_fotos_urls text[],
ADD COLUMN IF NOT EXISTS fez_bo boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS bo_url text,
ADD COLUMN IF NOT EXISTS assinatura_url text,
ADD COLUMN IF NOT EXISTS foi_hospital boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS laudo_medico_url text,
ADD COLUMN IF NOT EXISTS motorista_faleceu boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS atestado_obito_url text,
ADD COLUMN IF NOT EXISTS policia_foi_local boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_evento timestamp with time zone,
ADD COLUMN IF NOT EXISTS hora_evento text,
ADD COLUMN IF NOT EXISTS condutor_veiculo text,
ADD COLUMN IF NOT EXISTS narrar_fatos text,
ADD COLUMN IF NOT EXISTS vitima_ou_causador text,
ADD COLUMN IF NOT EXISTS tem_terceiros boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS placa_terceiro text,
ADD COLUMN IF NOT EXISTS local_tem_camera boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS croqui_acidente_url text,
ADD COLUMN IF NOT EXISTS laudo_alcoolemia_url text;

-- Criar tabela de contratos
CREATE TABLE IF NOT EXISTS contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corretora_id uuid REFERENCES corretoras(id) ON DELETE CASCADE,
  numero_contrato text NOT NULL,
  descricao text,
  data_inicio date,
  data_fim date,
  valor_mensal numeric(10,2),
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid NOT NULL
);

-- Habilitar RLS na tabela contratos
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para contratos
CREATE POLICY "Authenticated users can view contracts"
ON contratos FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Superintendente can manage contracts"
ON contratos FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superintendente'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_contratos_updated_at
BEFORE UPDATE ON contratos
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- Adicionar campo contrato_id nas vistorias
ALTER TABLE vistorias
ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES contratos(id) ON DELETE SET NULL;