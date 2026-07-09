import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  KeyRound,
  ShieldCheck,
  Smartphone,
  ShieldOff,
  Check,
  X,
  Loader2,
  Search,
  ChevronDown,
  Lock,
  Unlock,
  RotateCcw,
} from "lucide-react";

type Corretora = { id: string; nome: string };
type SegurancaConfig = { corretora_id: string; metodo: "totp" | "palavra_chave" | "dispositivo" | "nenhum" };
type DeviceRequest = {
  id: string;
  corretora_id: string | null;
  email: string;
  device_info: string | null;
  ip_address: string | null;
  status: string;
  requested_at: string;
  exigir_ip: boolean;
  ip_aprovado: string | null;
  ultimo_uso_em: string | null;
};

// Extrai um resumo legível do navegador/SO a partir do User-Agent bruto,
// já que mostrar a string inteira não ajuda quem vai aprovar/negar.
function resumoDispositivo(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo desconhecido";
  const so = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "Mac"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Dispositivo";
  const navegador = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "navegador";
  return `${so} · ${navegador}`;
}

// Precisa gerar exatamente o mesmo hash que a edge function
// verify-metodo-seguranca usa para validar a palavra-chave no login
// (SHA-256("<palavra normalizada>:<corretora_id>")).
async function hashPalavraChave(palavra: string, corretoraId: string): Promise<string> {
  const normalizada = palavra.trim().toLowerCase();
  const data = new TextEncoder().encode(`${normalizada}:${corretoraId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface SegurancaAcessoConfigProps {
  readOnly?: boolean;
}

export function SegurancaAcessoConfig({ readOnly = false }: SegurancaAcessoConfigProps) {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [configs, setConfigs] = useState<Record<string, SegurancaConfig>>({});
  const [novaPalavra, setNovaPalavra] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<DeviceRequest[]>([]);
  const [aprovados, setAprovados] = useState<DeviceRequest[]>([]);
  const [bloqueados, setBloqueados] = useState<DeviceRequest[]>([]);
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(false);
  const [dispositivosExpandido, setDispositivosExpandido] = useState(false);

  const loadTudo = async () => {
    setLoading(true);
    try {
      const [corretorasRes, configsRes, dispositivosRes] = await Promise.all([
        supabase.from("corretoras").select("id, nome").order("nome"),
        supabase.from("corretora_seguranca_config").select("corretora_id, metodo"),
        supabase
          .from("device_approval_requests")
          .select("id, corretora_id, email, device_info, ip_address, status, requested_at, exigir_ip, ip_aprovado, ultimo_uso_em")
          .order("requested_at", { ascending: false }),
      ]);

      if (corretorasRes.data) setCorretoras(corretorasRes.data);
      if (configsRes.data) {
        const map: Record<string, SegurancaConfig> = {};
        configsRes.data.forEach((c: any) => {
          map[c.corretora_id] = c;
        });
        setConfigs(map);
      }
      if (dispositivosRes.data) {
        const rows = dispositivosRes.data as DeviceRequest[];
        setPendentes(rows.filter((r) => r.status === "pending"));
        setAprovados(rows.filter((r) => r.status === "approved"));
        setBloqueados(rows.filter((r) => r.status === "blocked"));
      }
    } catch (error) {
      console.error("Erro ao carregar configurações de segurança:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTudo();
  }, []);

  const handleMetodoChange = async (corretoraId: string, metodo: string) => {
    if (readOnly) return;
    setSaving(corretoraId);
    try {
      const { error } = await supabase.from("corretora_seguranca_config").upsert(
        {
          corretora_id: corretoraId,
          metodo,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "corretora_id" },
      );

      if (error) throw error;
      setConfigs((prev) => ({ ...prev, [corretoraId]: { corretora_id: corretoraId, metodo: metodo as any } }));
      toast.success("Método de verificação atualizado!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar método de verificação.");
    }
    setSaving(null);
  };

  const handleSalvarPalavra = async (corretoraId: string) => {
    if (readOnly) return;
    const palavra = novaPalavra[corretoraId];
    if (!palavra || !palavra.trim()) {
      toast.error("Digite uma palavra-chave.");
      return;
    }
    setSaving(corretoraId);
    try {
      const hash = await hashPalavraChave(palavra, corretoraId);
      const { error } = await supabase.from("corretora_seguranca_config").upsert(
        {
          corretora_id: corretoraId,
          metodo: "palavra_chave",
          palavra_chave_hash: hash,
          palavra_chave_atualizada_em: new Date().toISOString(),
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "corretora_id" },
      );

      if (error) throw error;
      setConfigs((prev) => ({ ...prev, [corretoraId]: { corretora_id: corretoraId, metodo: "palavra_chave" } }));
      setNovaPalavra((prev) => ({ ...prev, [corretoraId]: "" }));
      toast.success("Palavra-chave definida!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar palavra-chave.");
    }
    setSaving(null);
  };

  // Aprovar/negar uma solicitação pendente. Ao aprovar, trava o IP daquele
  // momento como "ip_aprovado" — pra quem depois quiser ligar a exigência de
  // IP (switch "Exigir este IP") ela já tem um valor de referência salvo.
  const handleResolverDispositivo = async (requestId: string, decisao: "approved" | "denied") => {
    if (readOnly) return;
    setResolvendo(requestId);
    try {
      const alvo = pendentes.find((p) => p.id === requestId);
      const { error } = await supabase
        .from("device_approval_requests")
        .update({
          status: decisao,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          ...(decisao === "approved" ? { ip_aprovado: alvo?.ip_address ?? null } : {}),
        })
        .eq("id", requestId);

      if (error) throw error;
      await loadTudo();
      toast.success(decisao === "approved" ? "Dispositivo aprovado!" : "Acesso negado.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar solicitação.");
    }
    setResolvendo(null);
  };

  // Bloqueia um dispositivo já aprovado (ou reverte um bloqueio).
  const handleAlterarStatus = async (requestId: string, novoStatus: "approved" | "blocked") => {
    if (readOnly) return;
    setResolvendo(requestId);
    try {
      const { error } = await supabase
        .from("device_approval_requests")
        .update({ status: novoStatus, resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .eq("id", requestId);
      if (error) throw error;
      await loadTudo();
      toast.success(novoStatus === "blocked" ? "Dispositivo bloqueado." : "Dispositivo desbloqueado.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar dispositivo.");
    }
    setResolvendo(null);
  };

  // Revoga a aprovação por completo — remove o registro, então o próximo
  // login desse aparelho vai pedir aprovação de novo, do zero.
  const handleRevogar = async (requestId: string) => {
    if (readOnly) return;
    setResolvendo(requestId);
    try {
      const { error } = await supabase.from("device_approval_requests").delete().eq("id", requestId);
      if (error) throw error;
      await loadTudo();
      toast.success("Aprovação revogada. Vai pedir aprovação de novo no próximo login.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao revogar dispositivo.");
    }
    setResolvendo(null);
  };

  // Liga/desliga a exigência de IP fixo pra um dispositivo já aprovado —
  // mesmo padrão do módulo Ponto (trava por IP opt-in por dispositivo).
  const handleToggleExigirIp = async (requestId: string, exigirIp: boolean) => {
    if (readOnly) return;
    try {
      const { error } = await supabase
        .from("device_approval_requests")
        .update({ exigir_ip: exigirIp })
        .eq("id", requestId);
      if (error) throw error;
      setAprovados((prev) => prev.map((d) => (d.id === requestId ? { ...d, exigir_ip: exigirIp } : d)));
      toast.success(exigirIp ? "Agora este dispositivo só entra pelo IP aprovado." : "Trava de IP removida.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar trava de IP.");
    }
  };

  const corretorasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return corretoras;
    return corretoras.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [corretoras, busca]);

  const nomeCorretora = (id: string | null) => corretoras.find((c) => c.id === id)?.nome || "—";

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Solicitações pendentes de aprovação por dispositivo */}
      {pendentes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {pendentes.length} solicitação(ões) de acesso aguardando aprovação
          </p>
          {pendentes.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-200 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.email}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {nomeCorretora(p.corretora_id)} · {resumoDispositivo(p.device_info)} · IP {p.ip_address || "desconhecido"} ·{" "}
                  {new Date(p.requested_at).toLocaleString("pt-BR")}
                </p>
              </div>
              {!readOnly && (
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    disabled={resolvendo === p.id}
                    onClick={() => handleResolverDispositivo(p.id, "denied")}
                  >
                    <X className="h-3.5 w-3.5" /> Negar
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    disabled={resolvendo === p.id}
                    onClick={() => handleResolverDispositivo(p.id, "approved")}
                  >
                    <Check className="h-3.5 w-3.5" /> Aprovar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Método de verificação por associação — colapsado por padrão, no mesmo
          estilo dos demais itens desta tela (ícone + título + descrição). */}
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="w-full flex items-center justify-between gap-4 p-4 hover:bg-muted/20 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Método de verificação em duas etapas por associação</p>
              <p className="text-[11px] text-muted-foreground">
                Cada associação pode usar um método diferente para o segundo fator de login dos parceiros.
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${expandido ? "rotate-180" : ""}`}
          />
        </button>

        {expandido && (
          <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
            <div className="relative w-full sm:w-56 ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar associação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-9 pl-8"
              />
            </div>

            {corretoras.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma associação cadastrada.</p>
            )}

            {corretoras.length > 0 && corretorasFiltradas.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma associação encontrada.</p>
            )}

            {corretorasFiltradas.map((c) => {
              const metodo = configs[c.id]?.metodo || "totp";
              return (
                <div key={c.id} className="rounded-xl border border-border/50 p-4 bg-background space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <p className="text-sm font-medium">{c.nome}</p>
                    <Select
                      value={metodo}
                      onValueChange={(v) => handleMetodoChange(c.id, v)}
                      disabled={readOnly || saving === c.id}
                    >
                      <SelectTrigger className="w-full sm:w-64 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="totp">
                          <span className="flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5" /> Google Authenticator (TOTP)
                          </span>
                        </SelectItem>
                        <SelectItem value="palavra_chave">
                          <span className="flex items-center gap-2">
                            <KeyRound className="h-3.5 w-3.5" /> Palavra-chave
                          </span>
                        </SelectItem>
                        <SelectItem value="dispositivo">
                          <span className="flex items-center gap-2">
                            <Smartphone className="h-3.5 w-3.5" /> Aprovação por dispositivo
                          </span>
                        </SelectItem>
                        <SelectItem value="nenhum">
                          <span className="flex items-center gap-2">
                            <ShieldOff className="h-3.5 w-3.5" /> Nenhuma (sem 2ª etapa)
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {metodo === "palavra_chave" && !readOnly && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Definir/alterar palavra-chave"
                        value={novaPalavra[c.id] || ""}
                        onChange={(e) => setNovaPalavra((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className="h-9"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0"
                        disabled={saving === c.id}
                        onClick={() => handleSalvarPalavra(c.id)}
                      >
                        Salvar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dispositivos aprovados/bloqueados por associação — mesmo padrão do
          módulo Ponto: uma vez aprovado, o dispositivo é lembrado entre
          logins; dá pra exigir o mesmo IP, bloquear ou revogar. */}
      <div className="rounded-xl border border-border/50 bg-muted/10 overflow-hidden">
        <button
          type="button"
          onClick={() => setDispositivosExpandido((v) => !v)}
          className="w-full flex items-center justify-between gap-4 p-4 hover:bg-muted/20 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Dispositivos aprovados por associação</p>
              <p className="text-[11px] text-muted-foreground">
                {aprovados.length} aprovado(s) · {bloqueados.length} bloqueado(s). Dá pra exigir o mesmo IP, bloquear ou revogar cada um.
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${dispositivosExpandido ? "rotate-180" : ""}`}
          />
        </button>

        {dispositivosExpandido && (
          <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-3">
            {aprovados.length === 0 && bloqueados.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhum dispositivo aprovado ainda. Eles aparecem aqui assim que forem aceitos acima.
              </p>
            )}

            {aprovados.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <Unlock className="h-3.5 w-3.5" /> Aprovados
                </p>
                {aprovados.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border/50 p-3 bg-background space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{d.email}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {nomeCorretora(d.corretora_id)} · {resumoDispositivo(d.device_info)} · IP {d.ip_address || "desconhecido"}
                          {d.ultimo_uso_em && <> · último uso {new Date(d.ultimo_uso_em).toLocaleString("pt-BR")}</>}
                        </p>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1"
                            disabled={resolvendo === d.id}
                            onClick={() => handleRevogar(d.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Revogar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                            disabled={resolvendo === d.id}
                            onClick={() => handleAlterarStatus(d.id, "blocked")}
                          >
                            <Lock className="h-3.5 w-3.5" /> Bloquear
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <Switch
                        checked={d.exigir_ip}
                        disabled={readOnly}
                        onCheckedChange={(v) => handleToggleExigirIp(d.id, v)}
                      />
                      <span className="text-xs text-muted-foreground">
                        Exigir este IP ({d.ip_aprovado || d.ip_address || "—"}) para liberar este dispositivo
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {bloqueados.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-700 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> Bloqueados
                </p>
                {bloqueados.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/40 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.email}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {nomeCorretora(d.corretora_id)} · {resumoDispositivo(d.device_info)} · IP {d.ip_address || "desconhecido"}
                      </p>
                    </div>
                    {!readOnly && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 shrink-0"
                        disabled={resolvendo === d.id}
                        onClick={() => handleAlterarStatus(d.id, "approved")}
                      >
                        <Unlock className="h-3.5 w-3.5" /> Desbloquear
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
