-- Adicionar campo proxy_url na tabela api_integrations para suportar proxy Hostinger
ALTER TABLE api_integrations 
ADD COLUMN IF NOT EXISTS proxy_url TEXT;

COMMENT ON COLUMN api_integrations.proxy_url IS 'URL do proxy intermediário (ex: Hostinger) para contornar whitelist de IP';