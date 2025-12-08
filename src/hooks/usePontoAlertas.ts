import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Bell } from "lucide-react";

export function usePontoAlertas() {
  const { user } = useAuth();
  const lastCheckedRef = useRef<string | null>(null);
  const shownAlertsRef = useRef<Set<string>>(new Set());

  // Buscar funcionário vinculado ao usuário
  const { data: funcionario } = useQuery({
    queryKey: ["funcionario_by_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome")
        .eq("profile_id", user.id)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Buscar alertas ativos do funcionário
  const { data: alertas } = useQuery({
    queryKey: ["alertas_ponto_ativos", funcionario?.id],
    queryFn: async () => {
      if (!funcionario?.id) return [];
      const { data, error } = await supabase
        .from("alertas_ponto")
        .select("*")
        .eq("funcionario_id", funcionario.id)
        .eq("ativo", true);
      if (error) throw error;
      return data;
    },
    enabled: !!funcionario?.id,
    refetchInterval: 60000, // Refetch every minute
  });

  // Verificar alertas a cada minuto
  useEffect(() => {
    if (!alertas || alertas.length === 0) return;

    const checkAlerts = () => {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const currentMinuteKey = `${now.toDateString()}-${currentTime}`;

      // Evitar verificar múltiplas vezes no mesmo minuto
      if (lastCheckedRef.current === currentMinuteKey) return;
      lastCheckedRef.current = currentMinuteKey;

      alertas.forEach((alerta: any) => {
        // Verificar se é o dia correto
        if (!alerta.dias_semana?.includes(currentDay)) return;

        // Verificar horário
        const alertaTime = alerta.horario_programado?.substring(0, 5);
        if (alertaTime !== currentTime) return;

        // Verificar se já exibiu este alerta hoje
        const alertaKey = `${alerta.id}-${now.toDateString()}`;
        if (shownAlertsRef.current.has(alertaKey)) return;
        shownAlertsRef.current.add(alertaKey);

        // Exibir toast
        toast(alerta.mensagem || "Lembrete de Ponto!", {
          description: getAlertaDescription(alerta.tipo),
          duration: 10000,
          icon: "🔔",
        });

        // Marcar como enviado no banco
        supabase
          .from("alertas_ponto")
          .update({ enviado_em: new Date().toISOString() })
          .eq("id", alerta.id)
          .then(() => {});
      });
    };

    // Verificar imediatamente e depois a cada 30 segundos
    checkAlerts();
    const interval = setInterval(checkAlerts, 30000);

    return () => clearInterval(interval);
  }, [alertas]);

  return { funcionario, alertas };
}

function getAlertaDescription(tipo: string): string {
  switch (tipo) {
    case "lembrete_entrada":
      return "Hora de registrar a entrada!";
    case "lembrete_saida":
      return "Hora de registrar a saída!";
    case "lembrete_almoco":
      return "Lembrete do horário de almoço!";
    default:
      return "Lembrete de ponto";
  }
}
