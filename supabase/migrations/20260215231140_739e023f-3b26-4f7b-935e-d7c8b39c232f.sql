
ALTER TABLE public.hinova_credenciais 
ADD COLUMN url_cobranca text DEFAULT '',
ADD COLUMN url_eventos text DEFAULT '',
ADD COLUMN url_mgf text DEFAULT '';

COMMENT ON COLUMN public.hinova_credenciais.url_cobranca IS 'URL direta da página de relatório de cobrança no portal Hinova';
COMMENT ON COLUMN public.hinova_credenciais.url_eventos IS 'URL direta da página de relatório de eventos no portal Hinova';
COMMENT ON COLUMN public.hinova_credenciais.url_mgf IS 'URL direta da página de relatório MGF no portal Hinova';
