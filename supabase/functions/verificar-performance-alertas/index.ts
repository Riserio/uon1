import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResponsavelPerformance {
  id: string;
  nome: string;
  email: string;
  total: number;
  concluidos: number;
  taxaConclusao: number;
  tempoMedio: number;
  lider_id: string | null;
  lider_nome: string | null;
  lider_email: string | null;
  administrativo_id: string | null;
  administrativo_nome: string | null;
  administrativo_email: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    // Buscar metas ativas
    const { data: metas, error: metasError } = await supabase
      .from("performance_metas")
      .select("*")
      .eq("ativo", true)
      .single();

    if (metasError) {
      console.error("Erro ao buscar metas:", metasError);
      throw new Error("Erro ao buscar metas de performance");
    }

    console.log("Metas carregadas:", metas);

    // Buscar atendimentos dos últimos 30 dias
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - 30);

    const { data: atendimentos, error: atendimentosError } = await supabase
      .from("atendimentos")
      .select(
        `
        *,
        responsavel:profiles!atendimentos_responsavel_id_fkey(
          id,
          nome,
          email,
          lider_id,
          administrativo_id
        )
      `,
      )
      .gte("created_at", dataInicio.toISOString());

    if (atendimentosError) {
      console.error("Erro ao buscar atendimentos:", atendimentosError);
      throw new Error("Erro ao buscar atendimentos");
    }

    console.log(`Total de atendimentos encontrados: ${atendimentos?.length || 0}`);

    // Buscar todos os profiles para mapear líderes e administrativos
    const responsavelIds = [...new Set(atendimentos?.map((a: any) => a.responsavel?.id).filter(Boolean))];
    const liderIds = [...new Set(atendimentos?.map((a: any) => a.responsavel?.lider_id).filter(Boolean))];
    const administrativoIds = [
      ...new Set(atendimentos?.map((a: any) => a.responsavel?.administrativo_id).filter(Boolean)),
    ];

    const allProfileIds = [...new Set([...liderIds, ...administrativoIds])];

    let profilesMap = new Map();
    if (allProfileIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, nome, email").in("id", allProfileIds);

      profiles?.forEach((p: any) => {
        profilesMap.set(p.id, p);
      });
    }

    // Agrupar por responsável e calcular métricas
    const responsaveisMap = new Map<string, ResponsavelPerformance>();

    atendimentos?.forEach((atendimento: any) => {
      const resp = atendimento.responsavel;
      if (!resp || !resp.id) return;

      if (!responsaveisMap.has(resp.id)) {
        const lider = resp.lider_id ? profilesMap.get(resp.lider_id) : null;
        const administrativo = resp.administrativo_id ? profilesMap.get(resp.administrativo_id) : null;

        responsaveisMap.set(resp.id, {
          id: resp.id,
          nome: resp.nome,
          email: resp.email,
          total: 0,
          concluidos: 0,
          taxaConclusao: 0,
          tempoMedio: 0,
          lider_id: resp.lider_id,
          lider_nome: lider?.nome || null,
          lider_email: lider?.email || null,
          administrativo_id: resp.administrativo_id,
          administrativo_nome: administrativo?.nome || null,
          administrativo_email: administrativo?.email || null,
        });
      }

      const perfData = responsaveisMap.get(resp.id)!;
      perfData.total++;

      if (atendimento.data_concluido) {
        perfData.concluidos++;
        const tempo =
          Math.abs(new Date(atendimento.data_concluido).getTime() - new Date(atendimento.created_at).getTime()) /
          (1000 * 60 * 60); // horas
        perfData.tempoMedio = (perfData.tempoMedio * (perfData.concluidos - 1) + tempo) / perfData.concluidos;
      }
    });

    // Calcular taxa de conclusão
    responsaveisMap.forEach((perf) => {
      perf.taxaConclusao = perf.total > 0 ? Math.round((perf.concluidos / perf.total) * 100) : 0;
      perf.tempoMedio = Math.round(perf.tempoMedio);
    });

    console.log(`Responsáveis analisados: ${responsaveisMap.size}`);

    // Buscar superintendentes
    const { data: superintendentes, error: superError } = await supabase
      .from("user_roles")
      .select("user_id, profiles(nome, email)")
      .eq("role", "superintendente");

    if (superError) {
      console.error("Erro ao buscar superintendentes:", superError);
    }

    const superintendentesEmails =
      superintendentes?.filter((s: any) => s.profiles?.email).map((s: any) => s.profiles.email) || [];

    console.log(`Superintendentes encontrados: ${superintendentesEmails.length}`);

    // Verificar cada responsável e enviar alertas
    let alertasEnviados = 0;

    for (const [_, perf] of responsaveisMap) {
      const alertas: Array<{ tipo: string; valor: number; meta: number }> = [];

      // Verificar volume de atendimentos
      if (perf.total < metas.meta_minima_atendimentos) {
        alertas.push({
          tipo: "volume_baixo",
          valor: perf.total,
          meta: metas.meta_minima_atendimentos,
        });
      }

      // Verificar taxa de conclusão
      if (perf.taxaConclusao < metas.meta_taxa_conclusao) {
        alertas.push({
          tipo: "taxa_conclusao_baixa",
          valor: perf.taxaConclusao,
          meta: metas.meta_taxa_conclusao,
        });
      }

      // Verificar tempo médio
      if (perf.concluidos > 0 && perf.tempoMedio > metas.meta_tempo_medio_horas) {
        alertas.push({
          tipo: "tempo_medio_alto",
          valor: perf.tempoMedio,
          meta: metas.meta_tempo_medio_horas,
        });
      }

      // Se há alertas, enviar emails
      if (alertas.length > 0) {
        console.log(`Alertas para ${perf.nome}:`, alertas);

        const destinatarios = [perf.email];
        if (perf.lider_email) destinatarios.push(perf.lider_email);
        if (perf.administrativo_email) destinatarios.push(perf.administrativo_email);
        destinatarios.push(...superintendentesEmails);

        // Remover duplicados
        const destinatariosUnicos = [...new Set(destinatarios)];

        // Construir mensagem do email
        let mensagemAlertas = "";
        alertas.forEach((alerta) => {
          if (alerta.tipo === "volume_baixo") {
            mensagemAlertas += `<li><strong>Volume Baixo:</strong> ${alerta.valor} atendimentos (Meta: ${alerta.meta})</li>`;
          } else if (alerta.tipo === "taxa_conclusao_baixa") {
            mensagemAlertas += `<li><strong>Taxa de Conclusão Baixa:</strong> ${alerta.valor}% (Meta: ${alerta.meta}%)</li>`;
          } else if (alerta.tipo === "tempo_medio_alto") {
            mensagemAlertas += `<li><strong>Tempo Médio Alto:</strong> ${alerta.valor}h (Meta: ${alerta.meta}h)</li>`;
          }
        });

        const htmlEmail = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">⚠️ Alerta de Performance</h1>
            </div>
            
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1f2937; margin-top: 0;">Análise de Performance - ${perf.nome}</h2>
              
              <p style="color: #4b5563; font-size: 16px;">
                A análise dos últimos 30 dias identificou que o desempenho está abaixo das metas estabelecidas:
              </p>
              
              <div style="background: white; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0;">
                <h3 style="color: #dc2626; margin-top: 0;">Indicadores Abaixo da Meta:</h3>
                <ul style="color: #4b5563; font-size: 15px;">
                  ${mensagemAlertas}
                </ul>
              </div>
              
              <div style="background: white; padding: 20px; margin: 20px 0; border-radius: 8px;">
                <h3 style="color: #1f2937; margin-top: 0;">Resumo Geral:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px; color: #6b7280;">Total de Atendimentos:</td>
                    <td style="padding: 8px; font-weight: bold; color: #1f2937;">${perf.total}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px; color: #6b7280;">Atendimentos Concluídos:</td>
                    <td style="padding: 8px; font-weight: bold; color: #1f2937;">${perf.concluidos}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px; color: #6b7280;">Taxa de Conclusão:</td>
                    <td style="padding: 8px; font-weight: bold; color: #1f2937;">${perf.taxaConclusao}%</td>
                  </tr>
                  ${
                    perf.concluidos > 0
                      ? `
                  <tr>
                    <td style="padding: 8px; color: #6b7280;">Tempo Médio:</td>
                    <td style="padding: 8px; font-weight: bold; color: #1f2937;">${perf.tempoMedio}h</td>
                  </tr>
                  `
                      : ""
                  }
                </table>
              </div>
              
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #065f46; margin: 0; font-size: 14px;">
                  💡 <strong>Ação Recomendada:</strong> Analise os atendimentos em andamento e verifique se há necessidade de suporte adicional ou redistribuição de tarefas.
                </p>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                Este é um alerta automático gerado pelo sistema de gestão de atendimentos.
                <br>
                <strong>Período de análise:</strong> Últimos 30 dias
              </p>
            </div>
            
            <div style="background: #1f2937; padding: 20px; text-align: center;">
              <p style="color: #9ca3af; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} Sistema de Gestão de Atendimentos
              </p>
            </div>
          </div>
        `;

        try {
          const emailResult = await resend.emails.send({
            from: "Alertas de Performance <vangard@uon1.com.br>",
            to: destinatariosUnicos,
            subject: `⚠️ Alerta: Performance abaixo da meta - ${perf.nome}`,
            html: htmlEmail,
          });

          console.log(`Email enviado para: ${destinatariosUnicos.join(", ")}`);

          // Registrar alertas no banco
          for (const alerta of alertas) {
            await supabase.from("performance_alertas").insert({
              responsavel_id: perf.id,
              tipo_alerta: alerta.tipo,
              valor_atual: alerta.valor,
              meta_esperada: alerta.meta,
              periodo_analise: "30_dias",
              enviado_para: destinatariosUnicos,
            });
          }

          alertasEnviados++;
        } catch (emailError) {
          console.error(`Erro ao enviar email para ${perf.nome}:`, emailError);
        }
      }
    }

    console.log(`Total de alertas enviados: ${alertasEnviados}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Análise concluída. ${alertasEnviados} alertas enviados.`,
        responsaveisAnalisados: responsaveisMap.size,
        alertasEnviados,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Erro na verificação de performance:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
