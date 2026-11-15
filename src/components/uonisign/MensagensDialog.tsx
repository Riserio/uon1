import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Mail, MessageCircle, RefreshCw, Send } from "lucide-react";
import { uonisign, ConfigWhatsApp } from "@/lib/uonisign/api";

const TIPOS: { id: string; nome: string; quando: string }[] = [
  { id: "convite", nome: "Convite", quando: "quando é a vez do signatário assinar" },
  { id: "codigo", nome: "Código", quando: "código de 6 dígitos para confirmar a assinatura" },
  { id: "lembrete", nome: "Lembrete", quando: "D+3, D+7 e D+12 sem assinatura" },
  { id: "concluido", nome: "Contrato assinado", quando: "cópia final depois que todos assinam" },
  { id: "aviso", nome: "Aviso", quando: "cancelado, recusado ou expirado" },
];

const VARIAVEIS: Record<string, string> = {
  nome: "Nome do signatário",
  contrato: "Título do contrato",
  numero: "Número do contrato",
  link: "Link de assinatura",
  prazo: "Prazo do link",
  dias: "Dias aguardando",
  codigo: "Código de assinatura",
  url_validacao: "Link de validação (Trust)",
  codigo_verificacao: "Código de verificação (Trust)",
  assunto: "Assunto do aviso",
  empresa: "Empresa (Contratada)",
  token: "Final do link de assinatura",
};

const PADRAO: Required<ConfigWhatsApp> = {
  idioma: "pt_BR",
  mensagens: {
    convite: { template: "uonisign_convite", parametros: ["nome", "contrato", "numero", "empresa", "prazo"], botao: "token" },
    codigo: { template: "uonisign_codigo", parametros: ["codigo"] },
    lembrete: { template: "uonisign_lembrete", parametros: ["nome", "contrato", "numero", "dias", "prazo"], botao: "token" },
    concluido: { template: "uonisign_concluido", parametros: ["nome", "contrato", "numero", "codigo_verificacao"], botao: "token" },
    aviso: { template: "uonisign_aviso", parametros: ["nome", "contrato", "numero", "assunto"], botao: null },
  },
};

const COR_STATUS: Record<string, string> = {
  APPROVED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  REJECTED: "bg-red-500/10 text-red-700 border-red-500/20",
};
const ROTULO_STATUS: Record<string, string> = { APPROVED: "Aprovado", PENDING: "Em análise na Meta", REJECTED: "Recusado", PAUSED: "Pausado", DISABLED: "Desativado" };

/** E-mail (atalho para os templates do sistema) e WhatsApp (template da Meta + variáveis). */
export default function MensagensDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<Required<ConfigWhatsApp>>(PADRAO);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["uonisign_wa_status"],
    queryFn: () => uonisign.waStatus(),
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    const c = data.config ?? {};
    setCfg({ idioma: c.idioma || PADRAO.idioma, mensagens: { ...PADRAO.mensagens, ...(c.mensagens ?? {}) } });
  }, [data]);

  const doIdioma = useMemo(() => (data?.templates ?? []).filter((t) => t.language === cfg.idioma), [data, cfg.idioma]);
  const faltamPadrao = PADRAO.mensagens && Object.values(PADRAO.mensagens).some((m) => !doIdioma.some((t) => t.name === m.template));

  const criarPadrao = async () => {
    setCriando(true);
    try {
      const r = await uonisign.waCriarPadrao();
      const erros = r.resultados.filter((x) => !x.ok);
      if (erros.length) toast.error(`A Meta recusou: ${erros.map((e) => `${e.name} (${e.detalhe})`).join("; ")}`, { duration: 12000 });
      else toast.success("Templates enviados para aprovação da Meta. A análise costuma levar de minutos a algumas horas.");
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCriando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("uonisign_config")
        .upsert({ chave: "whatsapp", valor: cfg, updated_by: u.user?.id, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast.success("Mensagens de WhatsApp salvas");
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível salvar: " + (e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  const setTemplate = (tipo: string, nome: string) => {
    const t = doIdioma.find((x) => x.name === nome);
    const atuais = cfg.mensagens[tipo]?.parametros ?? [];
    const n = t?.variaveis ?? atuais.length;
    const parametros = Array.from({ length: n }, (_, i) => atuais[i] ?? PADRAO.mensagens[tipo]?.parametros?.[i] ?? "nome");
    const botao = t?.url_botao ? (cfg.mensagens[tipo]?.botao ?? "token") : null;
    setCfg({ ...cfg, mensagens: { ...cfg.mensagens, [tipo]: { template: nome, parametros, botao } } });
  };

  const setParametro = (tipo: string, i: number, chave: string) => {
    const m = cfg.mensagens[tipo] ?? {};
    const parametros = [...(m.parametros ?? [])];
    parametros[i] = chave;
    setCfg({ ...cfg, mensagens: { ...cfg.mensagens, [tipo]: { ...m, parametros } } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mensagens do Uon1 Sign</DialogTitle>
          <DialogDescription>Textos de e-mail e templates de WhatsApp usados nos convites, códigos, lembretes e avisos.</DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex gap-3">
            <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">E-mail</p>
              <p className="text-muted-foreground">
                Os textos ficam em <strong>Central de Atendimento → Templates</strong>, nos tipos “Uon1 Sign — …”. Use variáveis como{" "}
                <code>{"{{nome}}"}</code>, <code>{"{{contrato}}"}</code>, <code>{"{{link}}"}</code> e <code>{"{{codigo}}"}</code>.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              navigate("/central-atendimento");
            }}
          >
            Editar textos de e-mail
          </Button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-sm">WhatsApp (Meta)</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar status
              </Button>
              <Button size="sm" variant="outline" onClick={criarPadrao} disabled={criando || !faltamPadrao}>
                {criando ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                {faltamPadrao ? "Criar templates do Uon1 Sign na Meta" : "Templates do Uon1 Sign já criados"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Fora da janela de 24h a Meta só entrega mensagens com template aprovado. Escolha, para cada mensagem, um template aprovado e o que vai em
            cada variável ({"{{1}}"}, {"{{2}}"}…). Enquanto não houver template aprovado, o e-mail continua sendo enviado normalmente e você pode mandar o
            link pelo seu WhatsApp no detalhe do contrato.
          </p>
          {data?.erro_meta && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> Não foi possível consultar a Meta: {data.erro_meta}
            </div>
          )}

          {TIPOS.map((tp) => {
            const m = cfg.mensagens[tp.id] ?? {};
            const t = doIdioma.find((x) => x.name === m.template);
            return (
              <div key={tp.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <div>
                    <p className="font-medium text-sm">{tp.nome}</p>
                    <p className="text-xs text-muted-foreground">{tp.quando}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={m.template ?? ""} onValueChange={(v) => setTemplate(tp.id, v)}>
                      <SelectTrigger className="w-[240px]" aria-label={`Template de ${tp.nome}`}>
                        <SelectValue placeholder="Escolha o template" />
                      </SelectTrigger>
                      <SelectContent>
                        {m.template && !t && <SelectItem value={m.template}>{m.template} (não existe na Meta)</SelectItem>}
                        {doIdioma.map((x) => (
                          <SelectItem key={x.name} value={x.name}>
                            {x.name} · {ROTULO_STATUS[x.status] ?? x.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {t ? (
                      <Badge variant="outline" className={COR_STATUS[t.status] ?? ""}>
                        {t.status === "APPROVED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {ROTULO_STATUS[t.status] ?? t.status}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-700 border-red-200">Não existe</Badge>
                    )}
                  </div>
                </div>
                {t?.corpo && <p className="text-xs bg-muted/40 rounded-lg p-2 whitespace-pre-wrap">{t.corpo}</p>}
                {t?.status === "REJECTED" && t.motivo_rejeicao && <p className="text-xs text-red-700">Motivo: {t.motivo_rejeicao}</p>}
                {t?.url_botao && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Botão: {t.url_botao.replace("{{1}}", "")}</span>
                    <Select
                      value={m.botao ?? "token"}
                      onValueChange={(v) => setCfg({ ...cfg, mensagens: { ...cfg.mensagens, [tp.id]: { ...m, botao: v } } })}
                    >
                      <SelectTrigger className="h-8 w-[210px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="token">Final do link de assinatura</SelectItem>
                        <SelectItem value="codigo_verificacao">Código de verificação (Trust)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(m.parametros ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(m.parametros ?? []).map((p, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono text-muted-foreground">{`{{${i + 1}}}`}</span>
                        <Select value={p} onValueChange={(v) => setParametro(tp.id, i, v)}>
                          <SelectTrigger className="h-8 w-[190px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(VARIAVEIS).map(([k, r]) => (
                              <SelectItem key={k} value={k}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
