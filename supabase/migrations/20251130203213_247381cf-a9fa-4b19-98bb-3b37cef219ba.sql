-- Tabela de categorias de perguntas por tipo de sinistro
CREATE TABLE public.sinistro_pergunta_categorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_sinistro TEXT NOT NULL, -- 'colisao', 'roubo_furto', 'vidros', 'danos_natureza', 'incendio', 'perda_total'
  nome TEXT NOT NULL, -- ex: 'Análise Prévia', 'Análise Financeira', 'Análise Documental', 'Checklist Causalidade'
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de perguntas configuráveis
CREATE TABLE public.sinistro_perguntas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  categoria_id UUID REFERENCES public.sinistro_pergunta_categorias(id) ON DELETE CASCADE,
  tipo_sinistro TEXT NOT NULL,
  pergunta TEXT NOT NULL,
  tipo_campo TEXT NOT NULL DEFAULT 'select', -- 'select', 'text', 'textarea', 'date', 'valor', 'mapa'
  opcoes JSONB, -- array de opções para select
  peso INTEGER NOT NULL DEFAULT 0, -- peso para cálculo
  peso_positivo TEXT[], -- respostas que dão peso positivo
  peso_negativo TEXT[], -- respostas que dão peso negativo
  obrigatoria BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  auto_preenchivel TEXT, -- campo que pode ser preenchido automaticamente
  nivel_alerta TEXT, -- 'atencao', 'passivel_negativa', 'passivel_ressarcimento', 'aprovacao'
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Configurações de vistoria por corretora
CREATE TABLE public.vistoria_config_corretora (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretora_id UUID NOT NULL REFERENCES public.corretoras(id) ON DELETE CASCADE,
  prazo_realizacao_dias INTEGER NOT NULL DEFAULT 7, -- prazo para realização da vistoria
  prazo_expiracao_link_horas INTEGER NOT NULL DEFAULT 48, -- prazo de expiração do link
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(corretora_id)
);

-- Criar índices
CREATE INDEX idx_sinistro_perguntas_tipo ON public.sinistro_perguntas(tipo_sinistro);
CREATE INDEX idx_sinistro_perguntas_categoria ON public.sinistro_perguntas(categoria_id);
CREATE INDEX idx_sinistro_pergunta_categorias_tipo ON public.sinistro_pergunta_categorias(tipo_sinistro);
CREATE INDEX idx_vistoria_config_corretora ON public.vistoria_config_corretora(corretora_id);

-- RLS
ALTER TABLE public.sinistro_pergunta_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sinistro_perguntas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vistoria_config_corretora ENABLE ROW LEVEL SECURITY;

-- Políticas para categorias
CREATE POLICY "Authenticated users can view categories"
ON public.sinistro_pergunta_categorias FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage categories"
ON public.sinistro_pergunta_categorias FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Políticas para perguntas
CREATE POLICY "Authenticated users can view questions"
ON public.sinistro_perguntas FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage questions"
ON public.sinistro_perguntas FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Políticas para configuração vistoria
CREATE POLICY "Authenticated users can view vistoria config"
ON public.vistoria_config_corretora FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Superintendente and admin can manage vistoria config"
ON public.vistoria_config_corretora FOR ALL
USING (has_role(auth.uid(), 'superintendente'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Triggers para updated_at
CREATE TRIGGER update_sinistro_pergunta_categorias_updated_at
BEFORE UPDATE ON public.sinistro_pergunta_categorias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sinistro_perguntas_updated_at
BEFORE UPDATE ON public.sinistro_perguntas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vistoria_config_corretora_updated_at
BEFORE UPDATE ON public.vistoria_config_corretora
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir categorias padrão para Colisão/Danos/Incêndio/Outros
INSERT INTO public.sinistro_pergunta_categorias (tipo_sinistro, nome, ordem) VALUES
('colisao', 'Análise Prévia', 1),
('colisao', 'Análise Financeira', 2),
('colisao', 'Análise Documental', 3),
('colisao', 'Checklist Causalidade', 4),
('colisao', 'Relato Analista', 5),
('roubo_furto', 'Análise Prévia', 1),
('roubo_furto', 'Análise Financeira', 2),
('roubo_furto', 'Análise Documental', 3),
('roubo_furto', 'Checklist Causalidade', 4),
('roubo_furto', 'Relato Analista', 5),
('vidros', 'Análise Prévia', 1),
('vidros', 'Análise Documental', 2),
('vidros', 'Checklist Causalidade', 3),
('vidros', 'Relato Analista', 4);