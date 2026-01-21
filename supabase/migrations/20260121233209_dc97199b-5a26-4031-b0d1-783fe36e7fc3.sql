-- Tabela de configuração de automação Hinova por associação
CREATE TABLE public.cobranca_automacao_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  hinova_url TEXT NOT NULL DEFAULT 'https://eris.hinova.com.br/sga/sgav4_valecar/v5/login.php',
  hinova_user TEXT NOT NULL DEFAULT '',
  hinova_pass TEXT NOT NULL DEFAULT '',
  hinova_codigo_cliente TEXT DEFAULT '2363',
  layout_relatorio TEXT DEFAULT 'BI - Vangard Cobrança',
  ativo BOOLEAN NOT NULL DEFAULT true,
  ultima_execucao TIMESTAMP WITH TIME ZONE,
  ultimo_status TEXT,
  ultimo_erro TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(corretora_id)
);

-- Comentários
COMMENT ON TABLE public.cobranca_automacao_config IS 'Configuração da automação Hinova por associação';
COMMENT ON COLUMN public.cobranca_automacao_config.hinova_url IS 'URL de login do portal Hinova';
COMMENT ON COLUMN public.cobranca_automacao_config.hinova_user IS 'Usuário de acesso ao portal';
COMMENT ON COLUMN public.cobranca_automacao_config.hinova_pass IS 'Senha criptografada de acesso';
COMMENT ON COLUMN public.cobranca_automacao_config.hinova_codigo_cliente IS 'Código do cliente no Hinova';
COMMENT ON COLUMN public.cobranca_automacao_config.layout_relatorio IS 'Nome do layout de relatório a ser selecionado';

-- Enable RLS
ALTER TABLE public.cobranca_automacao_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins podem ver todas as configurações"
ON public.cobranca_automacao_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superintendente', 'administrativo')
  )
);

CREATE POLICY "Admins podem criar configurações"
ON public.cobranca_automacao_config
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superintendente')
  )
);

CREATE POLICY "Admins podem atualizar configurações"
ON public.cobranca_automacao_config
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superintendente')
  )
);

CREATE POLICY "Admins podem deletar configurações"
ON public.cobranca_automacao_config
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superintendente')
  )
);

-- Trigger para updated_at
CREATE TRIGGER update_cobranca_automacao_config_updated_at
BEFORE UPDATE ON public.cobranca_automacao_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();