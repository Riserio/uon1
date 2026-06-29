import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, X, ShieldCheck, Smartphone, Monitor, Trash2, ShieldAlert } from "lucide-react";
import { useState } from "react";

export default function DispositivosPonto() {
  const qc = useQueryClient();

  const { data: dispositivos } = useQuery({
    queryKey: ["dispositivos_ponto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispositivos_ponto")
        .select("*, funcionarios(nome, cargo, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });

  const { data: config } = useQuery({
    queryKey: ["jornada_config"],
    queryFn: async () => {
      const { data } = await supabase.from("jornada_config").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const atualizar = useMutation({
    mutationFn: async (vars: {
      id: string;
      status?: "aprovado" | "bloqueado" | "pendente";
      apelido?: string;
      exigir_ip?: boolean;
    }) => {
      const patch: any = { ...vars };
      delete patch.id;
      if (vars.status === "aprovado") {
        const { data: u } = await supabase.auth.getUser();
        patch.aprovado_por = u.user?.id;
        patch.aprovado_em = new Date().toISOString();
      }
      const { error } = await supabase.from("dispositivos_ponto").update(patch).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atualizado");
      qc.invalidateQueries({ queryKey: ["dispositivos_ponto"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dispositivos_ponto").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dispositivo removido");
      qc.invalidateQueries({ queryKey: ["dispositivos_ponto"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const salvarConfig = useMutation({
    mutationFn: async (vars: { exigir_aprovacao_dispositivo?: boolean; exigir_ip_dispositivo?: boolean }) => {
      if (!config) return;
      const { error } = await supabase
        .from("jornada_config")
        .update(vars)
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["jornada_config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pendentes = (dispositivos || []).filter((d: any) => d.status === "pendente");
  const aprovados = (dispositivos || []).filter((d: any) => d.status === "aprovado");
  const bloqueados = (dispositivos || []).filter((d: any) => d.status === "bloqueado");

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" /> Aprovação de Dispositivos · Ponto
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Controle de qual computador/celular cada colaborador pode usar para bater o ponto.
        </p>
      </div>

      <Card className="rounded-2xl bg-muted/40 backdrop-blur">
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold">Regras gerais</h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Exigir aprovação de dispositivo</Label>
              <p className="text-xs text-muted-foreground">
                A primeira batida em um novo navegador/celular cria uma solicitação para o gestor.
              </p>
            </div>
            <Switch
              checked={config?.exigir_aprovacao_dispositivo ?? true}
              onCheckedChange={(v) =>
                salvarConfig.mutate({ exigir_aprovacao_dispositivo: v })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Travar também pelo IP</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, dispositivos aprovados só funcionam no mesmo IP da aprovação.
              </p>
            </div>
            <Switch
              checked={config?.exigir_ip_dispositivo ?? false}
              onCheckedChange={(v) => salvarConfig.mutate({ exigir_ip_dispositivo: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">
            Pendentes
            {pendentes.length > 0 && (
              <Badge className="ml-2 bg-orange-500 text-white">{pendentes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="aprovados">Aprovados ({aprovados.length})</TabsTrigger>
          <TabsTrigger value="bloqueados">Bloqueados ({bloqueados.length})</TabsTrigger>
        </TabsList>

        {[
          { key: "pendentes", lista: pendentes },
          { key: "aprovados", lista: aprovados },
          { key: "bloqueados", lista: bloqueados },
        ].map(({ key, lista }) => (
          <TabsContent key={key} value={key} className="space-y-3">
            {lista.length === 0 ? (
              <Card className="rounded-2xl bg-muted/40">
                <CardContent className="p-8 text-center text-muted-foreground text-sm">
                  Nenhum dispositivo nesta lista.
                </CardContent>
              </Card>
            ) : (
              lista.map((d: any) => {
                const mobile = /Mobile|Android|iPhone/i.test(d.user_agent || "");
                const Icon = mobile ? Smartphone : Monitor;
                return (
                  <Card key={d.id} className="rounded-2xl bg-muted/40 backdrop-blur">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold">
                              {d.funcionarios?.nome || "Colaborador"}
                            </p>
                            <Badge variant="outline">{d.funcionarios?.cargo || "—"}</Badge>
                            <Badge
                              variant={
                                d.status === "aprovado"
                                  ? "default"
                                  : d.status === "bloqueado"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {d.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {d.navegador} · {d.plataforma} · IP {d.ip || "?"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            Fingerprint: <code className="text-[10px]">{d.fingerprint?.slice(0, 24)}…</code>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Solicitado em {new Date(d.created_at).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Apelido</Label>
                          <Input
                            defaultValue={d.apelido || ""}
                            placeholder="Ex.: Notebook Vangard"
                            onBlur={(e) =>
                              e.target.value !== (d.apelido || "") &&
                              atualizar.mutate({ id: d.id, apelido: e.target.value })
                            }
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                          <Switch
                            checked={!!d.exigir_ip}
                            onCheckedChange={(v) =>
                              atualizar.mutate({ id: d.id, exigir_ip: v })
                            }
                          />
                          <Label className="text-sm">Exigir mesmo IP</Label>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        {d.status !== "aprovado" && (
                          <Button
                            size="sm"
                            onClick={() => atualizar.mutate({ id: d.id, status: "aprovado" })}
                          >
                            <Check className="h-4 w-4 mr-1" /> Aprovar
                          </Button>
                        )}
                        {d.status !== "bloqueado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => atualizar.mutate({ id: d.id, status: "bloqueado" })}
                          >
                            <ShieldAlert className="h-4 w-4 mr-1" /> Bloquear
                          </Button>
                        )}
                        {d.status === "aprovado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => atualizar.mutate({ id: d.id, status: "pendente" })}
                          >
                            <X className="h-4 w-4 mr-1" /> Revogar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive ml-auto"
                          onClick={() => excluir.mutate(d.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}