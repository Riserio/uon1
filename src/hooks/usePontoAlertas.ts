import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function usePontoAlertas() {
  const { user } = useAuth();
  const lastCheckedRef = useRef<string | null>(null);
  const shownAlertsRef = useRef<Set<string>>(new Set());

  // Configuração global de jornada
  const { data: config } = useQuery({
    queryKey: ["jornada_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jornada_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5 * 60_000,
  });

  // Funcionário vinculado ao usuário
  const { data: funcionario } = useQuery({
    queryKey: ["funcionario_by_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome, horario_entrada, horario_saida, horario_almoco_inicio, horario_almoco_fim")
        .eq("profile_id", user.id)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!config?.lembretes_automaticos_ativos) return;
    if (!funcionario) return;

    const buildAlerts = () => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      // segunda a sexta apenas (1-5)
      if (dayOfWeek === 0 || dayOfWeek === 6) return [];

      const horarios = [
        {
          tipo: "entrada",
          time: (funcionario.horario_entrada || config.horario_entrada_padrao || "08:00").substring(0, 5),
          mensagem: config.mensagem_entrada || "Hora de bater o ponto de entrada!",
          desc: "Hora de registrar a entrada!",
        },
        {
          tipo: "saida_almoco",
          time: (funcionario.horario_almoco_inicio || config.horario_saida_almoco_padrao || "12:00").substring(0, 5),
          mensagem: config.mensagem_saida_almoco || "Horário de almoço!",
          desc: "Não esqueça de bater o ponto de saída para almoço.",
        },
        {
          tipo: "volta_almoco",
          time: (funcionario.horario_almoco_fim || config.horario_volta_almoco_padrao || "13:00").substring(0, 5),
          mensagem: config.mensagem_volta_almoco || "Bom retorno!",
          desc: "Bata o ponto de volta do almoço.",
        },
        {
          tipo: "saida",
          time: (funcionario.horario_saida || config.horario_saida_padrao || "18:00").substring(0, 5),
          mensagem: config.mensagem_saida || "Fim do expediente!",
          desc: "Bata o ponto de saída.",
        },
      ];
      return horarios;
    };

    const checkAlerts = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const currentMinuteKey = `${now.toDateString()}-${currentTime}`;

      if (lastCheckedRef.current === currentMinuteKey) return;
      lastCheckedRef.current = currentMinuteKey;

      const alerts = buildAlerts();
      alerts.forEach((alerta) => {
        if (alerta.time !== currentTime) return;
        const key = `${alerta.tipo}-${now.toDateString()}`;
        if (shownAlertsRef.current.has(key)) return;
        shownAlertsRef.current.add(key);

        toast(alerta.mensagem, {
          description: alerta.desc,
          duration: 12000,
          icon: "🔔",
        });
      });
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 30_000);
    return () => clearInterval(interval);
  }, [config, funcionario]);

  return { funcionario, config };
}
