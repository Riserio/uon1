
-- Table to track event status changes over time
CREATE TABLE public.sga_eventos_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_id UUID NOT NULL REFERENCES public.sga_eventos(id) ON DELETE CASCADE,
  protocolo TEXT,
  situacao_anterior TEXT,
  situacao_nova TEXT NOT NULL,
  importacao_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by evento_id
CREATE INDEX idx_sga_eventos_historico_evento_id ON public.sga_eventos_historico(evento_id);
CREATE INDEX idx_sga_eventos_historico_protocolo ON public.sga_eventos_historico(protocolo);

-- Enable RLS
ALTER TABLE public.sga_eventos_historico ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read
CREATE POLICY "Authenticated users can read event history"
  ON public.sga_eventos_historico FOR SELECT
  TO authenticated
  USING (true);

-- Policy: authenticated users can insert
CREATE POLICY "Authenticated users can insert event history"
  ON public.sga_eventos_historico FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Enable realtime for sga_eventos so cards update automatically
ALTER PUBLICATION supabase_realtime ADD TABLE public.sga_eventos;

-- Trigger to automatically log status changes
CREATE OR REPLACE FUNCTION public.log_sga_evento_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.situacao_evento IS DISTINCT FROM NEW.situacao_evento THEN
    INSERT INTO public.sga_eventos_historico (evento_id, protocolo, situacao_anterior, situacao_nova)
    VALUES (NEW.id, NEW.protocolo, OLD.situacao_evento, NEW.situacao_evento);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_sga_evento_status_change
  AFTER UPDATE ON public.sga_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.log_sga_evento_status_change();
