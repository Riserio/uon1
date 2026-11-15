import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePermissoes } from "@/hooks/usePermissoes";
import { useComercialAcesso } from "@/hooks/useComercialAcesso";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useWhatsAppUnread } from "@/hooks/useWhatsAppUnread";
import { usePendingUsers } from "@/hooks/usePendingUsers";
import { UserProfile } from "@/components/UserProfile";
import { RadarMercado } from "@/components/painel/RadarMercado";
import { ResumoComercial, ResumoContratos } from "@/components/painel/ResumoComercial";
import { AgendaPainel } from "@/components/painel/AgendaPainel";
import { AvisosAlertas } from "@/components/painel/AvisosAlertas";
import { PainelOperacional } from "@/components/painel/PainelOperacional";
import { usePainelComercial, usePainelContratos } from "@/components/painel/dados";

/**
 * Painel inicial. Cada bloco só aparece para quem tem o módulo liberado, e os
 * números vêm filtrados pelo banco (RLS): vendedor vê os próprios leads,
 * propostas e contratos; líder e gerente, a equipe; administrador, tudo.
 */
export default function Dashboard() {
  const { user, userRole } = useAuth();
  const { podeVer, acessoTotal } = usePermissoes();
  const { nivel, gestor } = useComercialAcesso();
  const [logoUrl] = useLocalStorage<string>("app-logo-url", "");
  const mensagens = useUnreadMessages();
  const whatsapp = useWhatsAppUnread();
  const pendentes = usePendingUsers();

  const admin = acessoTotal || userRole === "admin" || userRole === "superintendente";
  const verComercial = podeVer("comercial") && nivel !== "nenhum";
  const verContratos = podeVer("contratos");
  const verAgenda = podeVer("agenda");
  const verReunioes = podeVer("talka");

  const comercial = usePainelComercial(verComercial);
  const contratos = usePainelContratos(verContratos);

  const { data: nome } = useQuery({
    queryKey: ["painel_nome", user?.id],
    enabled: !!user,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome").eq("id", user!.id).maybeSingle();
      return (data?.nome as string | undefined) ?? (user?.user_metadata?.nome as string | undefined) ?? "";
    },
  });

  const saudacao = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }, []);
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0];

  // Uma frase com o que espera o usuário hoje, no lugar de uma fileira de números
  const resumo = useMemo(() => {
    const partes: string[] = [];
    const k = verContratos ? contratos.data : undefined;
    const c = verComercial ? comercial.data : undefined;
    const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
    if (k?.aAssinar.length) partes.push(plural(k.aAssinar.length, "contrato esperando assinatura", "contratos esperando assinatura"));
    if (c?.cotacoes.aguardando) partes.push(plural(c.cotacoes.aguardando, "proposta aguardando aceite", "propostas aguardando aceite"));
    if (c?.aceitasSemContrato.length) partes.push(plural(c.aceitasSemContrato.length, "proposta aceita para virar contrato", "propostas aceitas para virar contrato"));
    if (!partes.length) return null;
    return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  }, [verContratos, verComercial, contratos.data, comercial.data]);

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full px-4 md:px-6 py-4 md:py-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 object-contain shrink-0" />
            ) : (
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="h-5 w-5 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-bold text-2xl sm:text-3xl tracking-tight">
                {saudacao}
                {primeiroNome ? `, ${primeiroNome}` : ""}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base">
                <span className="capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</span>
                {resumo ? `. Você tem ${resumo}.` : ""}
              </p>
            </div>
          </div>
          <UserProfile />
        </div>

        {/* Radar do mercado ao lado do que pede ação */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RadarMercado admin={admin} />
          <AvisosAlertas
            comercial={verComercial ? comercial.data : undefined}
            contratos={verContratos ? contratos.data : undefined}
            gestorComercial={gestor}
            whatsapp={whatsapp}
            mensagens={mensagens}
            usuariosPendentes={admin ? pendentes : 0}
            podeVer={podeVer}
          />
        </div>

        {/* Resumo comercial e contratos: só o que a hierarquia do usuário alcança */}
        {(verComercial || verContratos) && (
          <div className={`grid gap-4 ${verComercial && verContratos ? "xl:grid-cols-5" : ""}`}>
            {verComercial && (
              <div className={verContratos ? "xl:col-span-3" : ""}>
                <ResumoComercial dados={comercial.data} carregando={comercial.isLoading} nivel={nivel} />
              </div>
            )}
            {verContratos && (
              <div className={verComercial ? "xl:col-span-2" : ""}>
                <ResumoContratos dados={contratos.data} carregando={contratos.isLoading} />
              </div>
            )}
          </div>
        )}

        {(verAgenda || verReunioes) && <AgendaPainel podeAgenda={verAgenda} podeReunioes={verReunioes} />}

        {admin && <PainelOperacional comercial={comercial.data} contratos={contratos.data} />}
      </div>
    </div>
  );
}
