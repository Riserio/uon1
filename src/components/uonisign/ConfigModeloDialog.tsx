import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Settings2 } from "lucide-react";
import {
  CAMPOS_PADRAO,
  mascarar,
  pendenciasDoModelo,
  soDigitos,
  variaveisSemCampo,
} from "../../../supabase/functions/uonisign/modelo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Modelo = Record<string, any>;

/**
 * Configuração dos modelos para o fluxo novo (D8, Q3): dados da Contratada,
 * signatário fixo da Vangard, prazo e lembretes. O texto continua sendo
 * editado em "Templates". Alterar texto, campos ou signatário gera nova versão
 * (contratos já gerados não mudam — RN05).
 */
export default function ConfigModeloDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState<string>("");
  const [form, setForm] = useState<Modelo | null>(null);
  const [salvando, setSalvando] = useState(false);
  // A Vangard é a mesma em todos os modelos: por padrão replica dados e signatário
  const [aplicarTodos, setAplicarTodos] = useState(true);

  const { data: modelos, refetch } = useQuery({
    queryKey: ["uonisign_modelos_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contrato_templates").select("*").order("titulo");
      if (error) throw error;
      return (data ?? []) as Modelo[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (!selecionado && modelos?.length) setSelecionado((modelos.find((m) => m.fluxo_versao >= 2) ?? modelos[0]).id);
  }, [open, modelos, selecionado]);

  useEffect(() => {
    const m = modelos?.find((x) => x.id === selecionado);
    if (!m) return;
    setForm({
      fluxo2: (m.fluxo_versao ?? 1) >= 2,
      ativo: m.ativo !== false,
      prazo: String(m.prazo_assinatura_dias ?? 15),
      lembretes: (m.lembrete_dias ?? [3, 7, 12]).join(", "),
      contratada: { razao_social: "", cnpj: "", endereco: "", email: "", representante: "", foro: "", ...(m.contratada ?? {}) },
      sig: { nome: "", cpf: "", email: "", telefone: "", canais: ["email"], ...(m.signatario_contratada ?? {}) },
    });
  }, [modelos, selecionado]);

  const modelo = modelos?.find((x) => x.id === selecionado);
  const pend = useMemo(
    () => (form && modelo ? pendenciasDoModelo(form.contratada, form.sig, modelo.conteudo_html ?? "") : []),
    [form, modelo],
  );
  const semCampo = useMemo(() => {
    if (!modelo) return [];
    const campos = Array.isArray(modelo.campos) && modelo.campos.length ? modelo.campos : CAMPOS_PADRAO;
    return variaveisSemCampo(modelo.conteudo_html ?? "", campos);
  }, [modelo]);

  const setK = (k: string, v: string) => setForm((f) => (f ? { ...f, contratada: { ...f.contratada, [k]: v } } : f));
  const setS = (k: string, v: unknown) => setForm((f) => (f ? { ...f, sig: { ...f.sig, [k]: v } } : f));

  const salvar = async () => {
    if (!form || !modelo) return;
    const prazo = Number(form.prazo);
    const lembretes: number[] = form.lembretes
      .split(",")
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => Number.isInteger(n) && n > 0);
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > 90) return toast.error("Prazo deve ser de 1 a 90 dias");
    if (lembretes.some((d: number) => d >= prazo)) return toast.error("Os lembretes devem ser antes do fim do prazo");
    setSalvando(true);
    try {
      const patch: Modelo = {
        ativo: form.ativo,
        fluxo_versao: form.fluxo2 ? 2 : 1,
        prazo_assinatura_dias: prazo,
        lembrete_dias: [...new Set<number>(lembretes)].sort((a, b) => a - b),
        contratada: { ...form.contratada, cnpj: soDigitos(form.contratada.cnpj) },
        signatario_contratada: {
          ...form.sig,
          cpf: soDigitos(form.sig.cpf),
          telefone: soDigitos(form.sig.telefone),
          email: String(form.sig.email ?? "").trim().toLowerCase(),
        },
      };
      // Modelo antigo habilitado no fluxo novo sem campos: usa o formulário padrão
      if (form.fluxo2 && !(Array.isArray(modelo.campos) && modelo.campos.length)) patch.campos = CAMPOS_PADRAO;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("contrato_templates").update(patch).eq("id", modelo.id);
      if (error) throw error;
      const outros = aplicarTodos ? (modelos ?? []).filter((m) => m.id !== modelo.id && (m.fluxo_versao ?? 1) >= 2) : [];
      for (const m of outros) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: e2 } = await (supabase as any)
          .from("contrato_templates")
          .update({ contratada: patch.contratada, signatario_contratada: patch.signatario_contratada })
          .eq("id", m.id);
        if (e2) throw e2;
      }
      toast.success(outros.length ? `Modelo salvo e dados da Vangard aplicados a mais ${outros.length} modelo(s)` : "Modelo salvo");
      refetch();
      qc.invalidateQueries({ queryKey: ["uonisign_modelos"] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível salvar: " + (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" /> Configurar modelos
          </DialogTitle>
          <DialogDescription>Dados da Contratada, signatário fixo da Vangard, prazo e lembretes. O texto é editado em “Templates”.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <ul className="space-y-1">
            {modelos?.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelecionado(m.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm ${m.id === selecionado ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                >
                  {m.titulo}
                  <span className="block text-[11px] text-muted-foreground">
                    {(m.fluxo_versao ?? 1) >= 2 ? "Fluxo novo" : "Fluxo antigo"} · v{m.versao ?? 1}
                    {m.ativo === false && " · inativo"}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {form && modelo && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.fluxo2} onCheckedChange={(v) => setForm({ ...form, fluxo2: v })} /> Usar no fluxo novo (assinatura com código)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /> Ativo
                </label>
              </div>

              {form.fluxo2 &&
                (pend.length ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>Envio bloqueado até preencher: {pend.join(", ")}.</span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm flex gap-2 text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> Modelo pronto para envio.
                  </div>
                ))}
              {semCampo.length > 0 && (
                <p className="text-xs text-amber-700">
                  Variáveis no texto sem campo correspondente: {semCampo.map((v) => <Badge key={v} variant="outline" className="mr-1">{v}</Badge>)}
                </p>
              )}

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Contratada</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Razão social" valor={form.contratada.razao_social} onChange={(v) => setK("razao_social", v)} />
                  <Campo rotulo="CNPJ" valor={mascarar("cnpj", form.contratada.cnpj ?? "")} onChange={(v) => setK("cnpj", soDigitos(v))} />
                  <Campo rotulo="Endereço completo" valor={form.contratada.endereco} onChange={(v) => setK("endereco", v)} amplo />
                  <Campo rotulo="E-mail para notificações" valor={form.contratada.email} onChange={(v) => setK("email", v)} />
                  <Campo rotulo="Representante (no texto)" valor={form.contratada.representante} onChange={(v) => setK("representante", v)} ajuda="Se vazio, usa o signatário" />
                  <Campo rotulo="Foro (comarca)" valor={form.contratada.foro} onChange={(v) => setK("foro", v)} />
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Signatário fixo da Contratada (assina por último)</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Nome completo" valor={form.sig.nome} onChange={(v) => setS("nome", v)} />
                  <Campo rotulo="CPF" valor={mascarar("cpf", form.sig.cpf ?? "")} onChange={(v) => setS("cpf", soDigitos(v))} />
                  <Campo rotulo="E-mail" valor={form.sig.email} onChange={(v) => setS("email", v)} />
                  <Campo rotulo="Celular" valor={mascarar("celular", form.sig.telefone ?? "")} onChange={(v) => setS("telefone", soDigitos(v))} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={(form.sig.canais ?? []).includes("whatsapp")}
                    onCheckedChange={(v) => setS("canais", v ? ["email", "whatsapp"] : ["email"])}
                  />{" "}
                  Receber também por WhatsApp
                </label>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="text-sm font-semibold col-span-full">Prazo e lembretes</legend>
                <Campo rotulo="Prazo de cada convite (dias)" valor={form.prazo} onChange={(v) => setForm({ ...form, prazo: soDigitos(v) })} />
                <Campo rotulo="Lembretes (dias após o convite)" valor={form.lembretes} onChange={(v) => setForm({ ...form, lembretes: v })} ajuda="Ex.: 3, 7, 12" />
              </fieldset>
            </div>
          )}
        </div>

        <DialogFooter className="sm:items-center sm:justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
            <Switch checked={aplicarTodos} onCheckedChange={setAplicarTodos} /> Usar os dados da Contratada e o signatário em todos os modelos
          </label>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={salvar} disabled={salvando || !form}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, valor, onChange, ajuda, amplo }: { rotulo: string; valor?: string; onChange: (v: string) => void; ajuda?: string; amplo?: boolean }) {
  const id = `cfg-${rotulo.replace(/\W+/g, "-")}`;
  return (
    <div className={amplo ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}
