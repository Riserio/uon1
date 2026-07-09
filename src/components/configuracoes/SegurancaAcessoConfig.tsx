import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Smartphone, ShieldOff, Check, X, Loader2, Search, ChevronDown } from "lucide-react";

type Corretora = { id: string; nome: string };
type SegurancaConfig = { corretora_id: string; metodo: "totp" | "palavra_chave" | "dispositivo" | "nenhum" };
type DeviceRequest = {
  id: string;
  corretora_id: string | null;
  email: string;
  device_info: string | null;
  status: string;
  requested_at: string;
};

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

const metodoInfo: Record<string, { label: string; icon: any }> = {
  totp: { label: "Google Authenticator (TOTP)", icon: ShieldCheck },
  palavra_chave: { label: "Palavra-chave", icon: KeyRound },
  dispositivo: { label: "Aprovação por dispositivo", icon: Smartphone },
  nenhum: { label: "Nenhuma (sem 2ª etapa)", icon: ShieldOff },
};

export function SegurancaAcessoConfig({ readOnly = false }: SegurancaAcessoConfigProps) {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState<Corretora[]>([]);
  const [configs, setConfigs] = useState<Record<string, SegurancaConfig>>({});
  const [novaPalavra, setNovaPalavra] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<DeviceRequest[]>([]);
  const [resolvendo, setResolvendo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState(false);

  const loadTudo = async () => {
    setLoading(true);
    try {
      const [corretorasRes, configsRes, pendentesRes] = await Promise.all([
        supabase.from("corretoras").select("id, nome").order("nome"),
        supabase.from("corretora_seguranca_config").select("corretora_id, metodo"),
        supabase
          .from("device_approval_requests")
          .select("id, corretora_id, email, device_info, status, requested_at")
          .eq("status", "pending")
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
      if (pendentesRes.data) setPendentes(pendentesRes.data as DeviceRequest[]);
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

  const handleResolverDispositivo = async (requestId: string, decisao: "approved" | "denied") => {
    if (readOnly) return;
    setResolvendo(requestId);
    try {
      const { error } = await supabase
        .from("device_approval_requests")
        .update({
          status: decisao,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
        })
        .eq("id", requestId);

      if (error) throw error;
      setPendentes((prev) => prev.filter((p) => p.id !== requestId));
      toast.success(decisao === "approved" ? "Dispositivo aprovado!" : "Acesso negado.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao processar solicitação.");
    }
    setResolvendo(null);
  };

  const corretorasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return corretoras;
    return corretoras.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [corretoras, busca]);

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
          {pendentes.map((p) => {
            const corretoraNome = corretoras.find((c) => c.id === p.corretora_id)?.nome || "—";
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-200 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {corretoraNome} · {new Date(p.requested_at).toLocaleString("pt-BR")}
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
            );
          })}
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
    </div>
  );
}
