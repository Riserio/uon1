import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import TipoBoletoFilter, { useTiposBoletoRelatorio } from "./TipoBoletoFilter";

/** Admin: tipos de boleto do bloco principal do relatório diário da associação. */
export default function TiposBoletoRelatorioConfig({ corretoraId }: { corretoraId: string }) {
  const qc = useQueryClient();
  const { data: atual } = useTiposBoletoRelatorio(corretoraId);
  const [sel, setSel] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (atual) setSel(atual);
  }, [atual]);

  const salvar = async () => {
    if (sel.length === 0) {
      toast.error("Escolha ao menos um tipo de boleto.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("cobranca_automacao_config")
      .update({ tipos_boleto_relatorio: sel } as never)
      .eq("corretora_id", corretoraId)
      .select("id");
    setSaving(false);
    if (error) return toast.error("Não foi possível salvar.");
    if (!data || data.length === 0) return toast.error("Salve a configuração da automação desta associação primeiro.");
    qc.invalidateQueries({ queryKey: ["tipos_boleto_relatorio", corretoraId] });
    toast.success("Padrão do relatório diário atualizado.");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tipos de boleto do relatório diário</CardTitle>
        <CardDescription>
          Define quais boletos entram no bloco principal (inadimplência, esperado, recebido). Os demais aparecem em
          "Outras cobranças do mês". Também é o filtro inicial das telas de cobrança para quem não salvou um padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <TipoBoletoFilter corretoraId={corretoraId} selected={sel} onChange={setSel} className="sm:w-80" />
        <Button onClick={salvar} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}
