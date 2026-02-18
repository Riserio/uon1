import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, Legend, ComposedChart, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, AlertCircle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Settings, TrendingDown } from "lucide-react";
import { InadimplenciaReferenciaConfigDialog } from "./InadimplenciaReferenciaConfigDialog";
import { supabase } from "@/integrations/supabase/client";

interface CobrancaDashboardProps {
  boletos: any[];
  loading: boolean;
  corretoraId?: string;
  mesReferencia?: string;
  isPortalAccess?: boolean;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const formatCompactCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(0)}k`;
  }
  return `R$ ${value.toFixed(0)}`;
};

const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`;
};

// Custom tooltip
const CustomTooltip = ({ active, payload, label, isCurrency = false, isPercent = false }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {isPercent ? formatPercent(entry.value) : isCurrency ? formatCurrency(entry.value) : entry.value.toLocaleString('pt-BR')}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function CobrancaDashboard({ boletos, loading, corretoraId, mesReferencia, isPortalAccess }: CobrancaDashboardProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [inadimplenciaConfig, setInadimplenciaConfig] = useState<Map<number, number>>(new Map());
  const [inadimplenciaHistorico, setInadimplenciaHistorico] = useState<Map<number, number>>(new Map());
  const inadimplenciaScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicators, setShowScrollIndicators] = useState({ left: false, right: false });

  // Carregar configuração de inadimplência do banco
  const loadInadimplenciaConfig = async () => {
    if (!corretoraId || !mesReferencia) return;
    
    try {
      const { data, error } = await supabase
        .from("cobranca_inadimplencia_config")
        .select("dia, percentual_referencia")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia);

      if (error) throw error;

      const configMap = new Map<number, number>();
      data?.forEach(d => {
        configMap.set(d.dia, Number(d.percentual_referencia));
      });
      setInadimplenciaConfig(configMap);
    } catch (error) {
      console.error("Erro ao carregar config inadimplência:", error);
    }
  };

  // Carregar histórico de inadimplência (snapshot mais recente diferente de hoje ou de ontem)
  const loadInadimplenciaHistorico = async () => {
    if (!corretoraId || !mesReferencia) return;
    
    try {
      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];
      
      // Primeiro, tentar buscar registros de dias anteriores
      let { data, error } = await supabase
        .from("cobranca_inadimplencia_historico")
        .select("dia, percentual_inadimplencia, data_registro")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia)
        .lt("data_registro", hojeStr)
        .order("data_registro", { ascending: false })
        .limit(31);

      if (error) throw error;

      // Se não houver dados de dias anteriores, buscar qualquer dado disponível para visualização
      if (!data || data.length === 0) {
        const { data: todayData, error: todayError } = await supabase
          .from("cobranca_inadimplencia_historico")
          .select("dia, percentual_inadimplencia, data_registro")
          .eq("corretora_id", corretoraId)
          .eq("mes_referencia", mesReferencia)
          .order("data_registro", { ascending: false })
          .limit(31);
        
        if (!todayError && todayData && todayData.length > 0) {
          data = todayData;
          console.log("Usando histórico do dia atual como referência inicial");
        }
      }

      const historicoMap = new Map<number, number>();
      const dataRegistroMaisRecente = data?.[0]?.data_registro;
      
      // Filtrar apenas os registros desta data mais recente
      data?.filter(d => d.data_registro === dataRegistroMaisRecente).forEach(d => {
        historicoMap.set(d.dia, Number(d.percentual_inadimplencia));
      });
      
      console.log("Histórico carregado:", historicoMap.size, "dias, data:", dataRegistroMaisRecente);
      setInadimplenciaHistorico(historicoMap);
    } catch (error) {
      console.error("Erro ao carregar histórico inadimplência:", error);
    }
  };

  // Salvar snapshot diário de inadimplência
  const saveInadimplenciaSnapshot = async (inadimplenciaPorDia: Array<{ dia: number; inadimplenciaReal: number; qtdeVencidos: number; qtdeEmitidos: number }>) => {
    if (!corretoraId || !mesReferencia || isPortalAccess) return;
    
    try {
      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];
      
      // Preparar dados para upsert
      const registros = inadimplenciaPorDia.map(item => ({
        corretora_id: corretoraId,
        mes_referencia: mesReferencia,
        dia: item.dia,
        data_registro: hojeStr,
        percentual_inadimplencia: item.inadimplenciaReal,
        qtde_abertos: item.qtdeVencidos,
        qtde_emitidos: item.qtdeEmitidos
      }));

      // Upsert para evitar duplicatas
      const { error } = await supabase
        .from("cobranca_inadimplencia_historico")
        .upsert(registros, {
          onConflict: "corretora_id,mes_referencia,dia,data_registro"
        });

      if (error) {
        console.error("Erro ao salvar histórico inadimplência:", error);
      } else {
        console.log("Snapshot salvo com sucesso:", registros.length, "registros para", hojeStr);
        // Recarregar histórico para exibir os dados
        loadInadimplenciaHistorico();
      }
    } catch (error) {
      console.error("Erro ao salvar histórico inadimplência:", error);
    }
  };

  // Gerar histórico retroativo para todos os dias passados do mês
  const generateHistoricoRetroativo = async () => {
    if (!corretoraId || !mesReferencia || isPortalAccess || !boletos.length) return;
    
    try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth();
      const anoAtual = hoje.getFullYear();
      const diaHoje = hoje.getDate();
      
      // Verificar se já existe histórico para este mês
      const { data: existingData, error: checkError } = await supabase
        .from("cobranca_inadimplencia_historico")
        .select("id")
        .eq("corretora_id", corretoraId)
        .eq("mes_referencia", mesReferencia)
        .limit(1);
      
      if (checkError) throw checkError;
      
      // Se já existe histórico, não gerar novamente
      if (existingData && existingData.length > 0) {
        console.log("Histórico já existe para este mês");
        return;
      }
      
      // Filtrar boletos válidos
      const boletosFiltrados = boletos.filter(b => 
        b.situacao && b.situacao.toUpperCase() !== 'CANCELADO'
      );
      
      const registrosHistorico: any[] = [];
      
      // Para cada dia passado do mês, calcular a inadimplência que existia naquele dia
      for (let diaCalc = 1; diaCalc < diaHoje; diaCalc++) {
        const dataRef = new Date(anoAtual, mesAtual, diaCalc);
        const dataRefStr = dataRef.toISOString().split('T')[0];
        
        // Boletos emitidos até este dia (dia_vencimento_veiculo <= diaCalc)
        const boletosEmitidosAteDia = boletosFiltrados.filter(b => {
          const diaVenc = b.dia_vencimento_veiculo;
          return diaVenc != null && diaVenc <= diaCalc;
        });
        
        // Boletos que estavam pagos ATÉ aquela data específica
        const boletosPagosAteDia = boletosEmitidosAteDia.filter(b => {
          if (b.situacao && b.situacao.toUpperCase() === 'BAIXADO') {
            if (b.data_pagamento) {
              const dataPagamento = new Date(b.data_pagamento);
              return dataPagamento <= dataRef;
            }
            return true;
          }
          return false;
        });
        
        const qtdeEmitidos = boletosEmitidosAteDia.length;
        const qtdeVencidos = qtdeEmitidos - boletosPagosAteDia.length;
        const percentInadimplencia = qtdeEmitidos > 0 
          ? (qtdeVencidos / qtdeEmitidos) * 100 
          : 0;
        
        registrosHistorico.push({
          corretora_id: corretoraId,
          mes_referencia: mesReferencia,
          dia: diaCalc,
          data_registro: dataRefStr,
          percentual_inadimplencia: percentInadimplencia,
          qtde_abertos: qtdeVencidos,
          qtde_emitidos: qtdeEmitidos
        });
      }
      
      if (registrosHistorico.length > 0) {
        const { error } = await supabase
          .from("cobranca_inadimplencia_historico")
          .upsert(registrosHistorico, {
            onConflict: "corretora_id,mes_referencia,dia,data_registro"
          });
        
        if (error) {
          console.error("Erro ao gerar histórico retroativo:", error);
        } else {
          console.log("Histórico retroativo gerado:", registrosHistorico.length, "dias");
          loadInadimplenciaHistorico();
        }
      }
    } catch (error) {
      console.error("Erro ao gerar histórico retroativo:", error);
    }
  };

  useEffect(() => {
    loadInadimplenciaConfig();
    loadInadimplenciaHistorico();
  }, [corretoraId, mesReferencia]);

  // Gerar histórico retroativo quando os boletos carregam
  useEffect(() => {
    if (boletos.length > 0 && corretoraId && mesReferencia) {
      generateHistoricoRetroativo();
    }
  }, [boletos.length, corretoraId, mesReferencia]);

  // Function to update scroll indicators
  const updateScrollIndicators = () => {
    const el = inadimplenciaScrollRef.current;
    if (el) {
      const canScrollLeft = el.scrollLeft > 10;
      const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 10;
      setShowScrollIndicators({ left: canScrollLeft, right: canScrollRight });
    }
  };

  // Handle manual scroll
  const handleScroll = (direction: 'left' | 'right') => {
    const el = inadimplenciaScrollRef.current;
    if (el) {
      const scrollAmount = 300;
      el.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };
  
  const stats = useMemo(() => {
    if (!boletos.length) return null;

    // Filtrar cancelados conforme especificação
    const boletosFiltrados = boletos.filter(b => 
      b.situacao && b.situacao.toUpperCase() !== 'CANCELADO'
    );

    // Separar por situação
    const boletosAbertos = boletosFiltrados.filter(b => 
      b.situacao && b.situacao.toUpperCase() === 'ABERTO'
    );
    const boletosPagos = boletosFiltrados.filter(b => 
      b.situacao && b.situacao.toUpperCase() === 'BAIXADO'
    );

    // Totais
    const totalBoletos = boletosFiltrados.length;
    const totalValor = boletosFiltrados.reduce((acc, b) => acc + (b.valor || 0), 0);
    const totalPago = boletosPagos.reduce((acc, b) => acc + (b.valor || 0), 0);
    const totalAberto = boletosAbertos.reduce((acc, b) => acc + (b.valor || 0), 0);

    // Por Dia Vencimento Veículo (emitidos, pagos, abertos)
    // Primeiro agregamos tudo junto para calcular percentuais
    const porDiaVencimentoAll: Record<string, { emitido: number; emitidoValor: number; pago: number; pagoValor: number; aberto: number; abertoValor: number }> = {};
    
    boletosFiltrados.forEach(b => {
      const dia = b.dia_vencimento_veiculo || 'N/I';
      if (!porDiaVencimentoAll[dia]) {
        porDiaVencimentoAll[dia] = { emitido: 0, emitidoValor: 0, pago: 0, pagoValor: 0, aberto: 0, abertoValor: 0 };
      }
      porDiaVencimentoAll[dia].emitido += 1;
      porDiaVencimentoAll[dia].emitidoValor += b.valor || 0;
      
      if (b.situacao && b.situacao.toUpperCase() === 'BAIXADO') {
        porDiaVencimentoAll[dia].pago += 1;
        porDiaVencimentoAll[dia].pagoValor += b.valor || 0;
      } else if (b.situacao && b.situacao.toUpperCase() === 'ABERTO') {
        porDiaVencimentoAll[dia].aberto += 1;
        porDiaVencimentoAll[dia].abertoValor += b.valor || 0;
      }
    });
    
    // Converter para arrays com percentuais
    const diasVencimentoData = Object.entries(porDiaVencimentoAll)
      .filter(([dia]) => dia !== 'N/I')
      .map(([dia, data]) => {
        const total = data.emitido;
        const percPago = total > 0 ? (data.pago / total) * 100 : 0;
        const percAberto = total > 0 ? (data.aberto / total) * 100 : 0;
        return {
          dia: `Dia ${dia}`,
          diaNum: parseInt(dia),
          qtde: data.emitido,
          valor: data.emitidoValor,
          percPago,
          percAberto
        };
      })
      .sort((a, b) => a.diaNum - b.diaNum);
    
    const diasVencimentoPagosData = Object.entries(porDiaVencimentoAll)
      .filter(([dia]) => dia !== 'N/I' && (porDiaVencimentoAll[dia].pago > 0 || porDiaVencimentoAll[dia].aberto > 0))
      .map(([dia, data]) => {
        const total = data.emitido;
        const percPago = total > 0 ? (data.pago / total) * 100 : 0;
        const percAberto = total > 0 ? (data.aberto / total) * 100 : 0;
        return {
          dia: `Dia ${dia}`,
          diaNum: parseInt(dia),
          qtde: data.pago,
          valor: data.pagoValor,
          percPago,
          percAberto
        };
      })
      .filter(item => item.qtde > 0)
      .sort((a, b) => a.diaNum - b.diaNum);
    
    const diasVencimentoAbertosData = Object.entries(porDiaVencimentoAll)
      .filter(([dia]) => dia !== 'N/I' && (porDiaVencimentoAll[dia].pago > 0 || porDiaVencimentoAll[dia].aberto > 0))
      .map(([dia, data]) => {
        const total = data.emitido;
        const percPago = total > 0 ? (data.pago / total) * 100 : 0;
        const percAberto = total > 0 ? (data.aberto / total) * 100 : 0;
        return {
          dia: `Dia ${dia}`,
          diaNum: parseInt(dia),
          qtde: data.aberto,
          valor: data.abertoValor,
          percPago,
          percAberto
        };
      })
      .filter(item => item.qtde > 0)
      .sort((a, b) => a.diaNum - b.diaNum);

    // Gráfico de Inadimplência por Dia do Mês (usando dia_vencimento_veiculo)
    const hoje = new Date();
    const mesAtual = hoje.getMonth();
    const anoAtual = hoje.getFullYear();
    const diaHoje = hoje.getDate();
    const diasDoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const inadimplenciaPorDia = [];
    
    // Calcular a inadimplência atual (valor do card) - usado para dias >= hoje
    const inadimplenciaAtual = totalBoletos > 0 
      ? (boletosAbertos.length / totalBoletos) * 100 
      : 0;
    
    for (let dia = 1; dia <= diasDoMes; dia++) {
      // Data de referência para este dia do mês
      const dataRef = new Date(anoAtual, mesAtual, dia);
      
      // Boletos com dia_vencimento_veiculo ATÉ este dia (emitidos até este dia)
      const boletosEmitidosAteDia = boletosFiltrados.filter(b => {
        const diaVenc = b.dia_vencimento_veiculo;
        return diaVenc != null && diaVenc <= dia;
      });
      
      // Boletos pagos até este dia
      const boletosPagosAteDia = boletosEmitidosAteDia.filter(b => {
        if (b.situacao && b.situacao.toUpperCase() === 'BAIXADO') {
          // Se tem data de pagamento, verificar se foi pago até esta data
          if (b.data_pagamento) {
            const dataPagamento = new Date(b.data_pagamento);
            return dataPagamento <= dataRef;
          }
          // Se não tem data de pagamento mas está baixado, considerar pago
          return true;
        }
        return false;
      });
      
      // Boletos vencidos = Boletos em aberto (emitidos - pagos)
      // Ou seja: boletos que deveriam ter sido pagos mas não foram
      let percentInadimplenciaReal: number;
      let qtdeVencidos: number;
      
      if (dia >= diaHoje) {
        // Para hoje e dias futuros: usar a inadimplência atual (linha reta)
        percentInadimplenciaReal = inadimplenciaAtual;
        // Vencidos = boletos em aberto cujo dia de vencimento já passou
        qtdeVencidos = boletosAbertos.filter(b => {
          const diaVenc = b.dia_vencimento_veiculo;
          return diaVenc != null && diaVenc <= dia;
        }).length;
      } else {
        // Para dias passados: Vencidos = Emitidos até dia - Pagos até dia
        qtdeVencidos = boletosEmitidosAteDia.length - boletosPagosAteDia.length;
        
        percentInadimplenciaReal = boletosEmitidosAteDia.length > 0 
          ? (qtdeVencidos / boletosEmitidosAteDia.length) * 100 
          : 0;
      }
      
      // Pegar referência do config ou usar 30% padrão
      const referenciaParaDia = inadimplenciaConfig.get(dia) ?? 30;
      
      // Pegar histórico (dia anterior/último disponível)
      const historicoParaDia = inadimplenciaHistorico.get(dia);
      
      inadimplenciaPorDia.push({
        dia,
        diaLabel: `${dia}`,
        inadimplenciaReal: percentInadimplenciaReal,
        inadimplenciaReferencia: referenciaParaDia,
        inadimplenciaHistorico: historicoParaDia,
        qtdeVencidos: qtdeVencidos,
        qtdePagos: dia >= diaHoje ? boletosPagosAteDia.length : boletosPagosAteDia.length,
        qtdeEmitidos: boletosEmitidosAteDia.length
      });
    }

    // Arrecadação Projetada x Recebida (por data de vencimento vs data de pagamento)
    const arrecadacaoPorDia: any = {};
    
    // Vencimentos por dia
    boletosFiltrados.forEach(b => {
      if (b.data_vencimento) {
        const dia = new Date(b.data_vencimento).getDate();
        if (!arrecadacaoPorDia[dia]) {
          arrecadacaoPorDia[dia] = { projetado: 0, recebido: 0 };
        }
        arrecadacaoPorDia[dia].projetado += b.valor || 0;
      }
    });
    
    // Pagamentos por dia
    boletosPagos.forEach(b => {
      if (b.data_pagamento) {
        const dia = new Date(b.data_pagamento).getDate();
        if (!arrecadacaoPorDia[dia]) {
          arrecadacaoPorDia[dia] = { projetado: 0, recebido: 0 };
        }
        arrecadacaoPorDia[dia].recebido += b.valor || 0;
      }
    });
    
    const arrecadacaoData = Object.entries(arrecadacaoPorDia)
      .map(([dia, data]: [string, any]) => ({
        dia: parseInt(dia),
        diaLabel: `Dia ${dia}`,
        projetado: data.projetado,
        recebido: data.recebido
      }))
      .sort((a, b) => a.dia - b.dia);

    // Ranking Regionais - Pagos
    const regionaisPagos = boletosPagos.reduce((acc: any, b) => {
      const regional = b.regional_boleto || 'N/I';
      if (regional !== 'N/I') {
        if (!acc[regional]) acc[regional] = { qtde: 0, valor: 0 };
        acc[regional].qtde += 1;
        acc[regional].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const regionaisPagosData = Object.entries(regionaisPagos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor);

    // Ranking Regionais - Abertos
    const regionaisAbertos = boletosAbertos.reduce((acc: any, b) => {
      const regional = b.regional_boleto || 'N/I';
      if (regional !== 'N/I') {
        if (!acc[regional]) acc[regional] = { qtde: 0, valor: 0 };
        acc[regional].qtde += 1;
        acc[regional].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const regionaisAbertosData = Object.entries(regionaisAbertos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor);

    // Ranking Cooperativas - Pagos
    const cooperativasPagos = boletosPagos.reduce((acc: any, b) => {
      const cooperativa = b.cooperativa || 'N/I';
      if (cooperativa !== 'N/I') {
        if (!acc[cooperativa]) acc[cooperativa] = { qtde: 0, valor: 0 };
        acc[cooperativa].qtde += 1;
        acc[cooperativa].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const cooperativasPagosData = Object.entries(cooperativasPagos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor);

    // Ranking Cooperativas - Abertos
    const cooperativasAbertos = boletosAbertos.reduce((acc: any, b) => {
      const cooperativa = b.cooperativa || 'N/I';
      if (cooperativa !== 'N/I') {
        if (!acc[cooperativa]) acc[cooperativa] = { qtde: 0, valor: 0 };
        acc[cooperativa].qtde += 1;
        acc[cooperativa].valor += b.valor || 0;
      }
      return acc;
    }, {});
    const cooperativasAbertosData = Object.entries(cooperativasAbertos)
      .map(([name, data]: [string, any]) => ({ name, qtde: data.qtde, valor: data.valor }))
      .sort((a: any, b: any) => b.valor - a.valor);

    // Ranking de Inadimplência por Regional (total emitido vs abertos)
    const regionaisInadimplencia: Record<string, { total: number; abertos: number; valor: number }> = {};
    boletosFiltrados.forEach(b => {
      const regional = b.regional_boleto || 'N/I';
      if (regional !== 'N/I') {
        if (!regionaisInadimplencia[regional]) {
          regionaisInadimplencia[regional] = { total: 0, abertos: 0, valor: 0 };
        }
        regionaisInadimplencia[regional].total += 1;
        if (b.situacao && b.situacao.toUpperCase() === 'ABERTO') {
          regionaisInadimplencia[regional].abertos += 1;
          regionaisInadimplencia[regional].valor += b.valor || 0;
        }
      }
    });
    
    const regionaisInadimplenciaData = Object.entries(regionaisInadimplencia)
      .filter(([_, data]) => data.total >= 5) // Mínimo de 5 boletos para ser relevante
      .map(([name, data]) => ({
        name,
        total: data.total,
        abertos: data.abertos,
        valor: data.valor,
        percentual: data.total > 0 ? (data.abertos / data.total) * 100 : 0
      }));
    
    // Menor inadimplência (ordenado do menor para maior)
    const regionaisMenorInadimplencia = [...regionaisInadimplenciaData]
      .sort((a, b) => a.percentual - b.percentual);
    
    // Maior inadimplência (ordenado do maior para menor)
    const regionaisMaiorInadimplencia = [...regionaisInadimplenciaData]
      .sort((a, b) => b.percentual - a.percentual);

    // Ranking de Inadimplência por Cooperativa (total emitido vs abertos)
    const cooperativasInadimplencia: Record<string, { total: number; abertos: number; valor: number }> = {};
    boletosFiltrados.forEach(b => {
      const cooperativa = b.cooperativa || 'N/I';
      if (cooperativa !== 'N/I') {
        if (!cooperativasInadimplencia[cooperativa]) {
          cooperativasInadimplencia[cooperativa] = { total: 0, abertos: 0, valor: 0 };
        }
        cooperativasInadimplencia[cooperativa].total += 1;
        if (b.situacao && b.situacao.toUpperCase() === 'ABERTO') {
          cooperativasInadimplencia[cooperativa].abertos += 1;
          cooperativasInadimplencia[cooperativa].valor += b.valor || 0;
        }
      }
    });
    
    const cooperativasInadimplenciaData = Object.entries(cooperativasInadimplencia)
      .filter(([_, data]) => data.total >= 5) // Mínimo de 5 boletos para ser relevante
      .map(([name, data]) => ({
        name,
        total: data.total,
        abertos: data.abertos,
        valor: data.valor,
        percentual: data.total > 0 ? (data.abertos / data.total) * 100 : 0
      }));
    
    // Menor inadimplência por cooperativa
    const cooperativasMenorInadimplencia = [...cooperativasInadimplenciaData]
      .sort((a, b) => a.percentual - b.percentual);
    
    // Maior inadimplência por cooperativa
    const cooperativasMaiorInadimplencia = [...cooperativasInadimplenciaData]
      .sort((a, b) => b.percentual - a.percentual);

    return {
      totalBoletos,
      totalValor,
      totalPago,
      totalAberto,
      qtdePagos: boletosPagos.length,
      qtdeAbertos: boletosAbertos.length,
      diasVencimentoData,
      diasVencimentoPagosData,
      diasVencimentoAbertosData,
      inadimplenciaPorDia,
      arrecadacaoData,
      regionaisPagosData,
      regionaisAbertosData,
      cooperativasPagosData,
      cooperativasAbertosData,
      regionaisMenorInadimplencia,
      regionaisMaiorInadimplencia,
      cooperativasMenorInadimplencia,
      cooperativasMaiorInadimplencia,
      percentualInadimplencia: totalBoletos > 0 ? (boletosAbertos.length / totalBoletos) * 100 : 0
    };
  }, [boletos, inadimplenciaConfig, inadimplenciaHistorico]);

  // Salvar snapshot diário quando os dados mudam
  useEffect(() => {
    if (stats?.inadimplenciaPorDia && corretoraId && mesReferencia && !isPortalAccess) {
      saveInadimplenciaSnapshot(stats.inadimplenciaPorDia);
    }
  }, [stats?.inadimplenciaPorDia, corretoraId, mesReferencia, isPortalAccess]);

  // Center on current day when data loads
  useEffect(() => {
    const el = inadimplenciaScrollRef.current;
    if (!el || !stats) return;

    const hoje = new Date();
    const diaHoje = hoje.getDate();
    
    // Find index of today in the data
    const targetIndex = stats.inadimplenciaPorDia.findIndex(d => d.dia === diaHoje);
    if (targetIndex !== -1) {
      const itemWidth = 30;
      const targetScroll = Math.max(0, (targetIndex * itemWidth) - (el.clientWidth / 2) + (itemWidth / 2));
      el.scrollTo({ left: targetScroll, behavior: 'auto' });
    }

    setTimeout(updateScrollIndicators, 100);
  }, [stats?.inadimplenciaPorDia]);

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!boletos.length || !stats) {
    return (
      <Card className="text-center py-12">
        <CardContent>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Dado Disponível</h3>
          <p className="text-muted-foreground">
            Importe uma planilha de boletos para visualizar os dashboards.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: "Boletos Emitidos", value: stats.totalBoletos.toLocaleString('pt-BR'), sub: formatCurrency(stats.totalValor), cls: "text-primary bg-primary/5 border-primary/20" },
          { label: "Boletos Pagos", value: stats.qtdePagos.toLocaleString('pt-BR'), sub: formatCurrency(stats.totalPago), cls: "text-emerald-600 bg-emerald-500/5 border-emerald-500/20" },
          { label: "Em Aberto", value: stats.qtdeAbertos.toLocaleString('pt-BR'), sub: formatCurrency(stats.totalAberto), cls: "text-red-600 bg-red-500/5 border-red-500/20" },
          { label: "Inadimplência", value: formatPercent(stats.percentualInadimplencia), sub: "do total emitido", cls: "text-amber-600 bg-amber-500/5 border-amber-500/20" },
        ].map(({ label, value, sub, cls }) => (
          <Card key={label} className={`rounded-2xl border ${cls}`}>
            <CardContent className="p-4">
              <div className={`text-[11px] font-medium mb-1 ${cls.split(" ")[0]}`}>{label}</div>
              <div className="text-xl font-bold tracking-tight">{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Boletos por Dia de Vencimento - Card moderno com gráfico + tabela */}
      <Card className="rounded-2xl overflow-hidden border-border/40">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-primary" />
            Boletos por Dia de Vencimento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Totais */}
          <div className="grid grid-cols-3 border-b bg-muted/20 px-5 py-3 gap-4">
            {[
              { label: "Emitidos", count: stats.totalBoletos, valor: stats.totalValor, color: "text-primary" },
              { label: "Pagos", count: stats.qtdePagos, valor: stats.totalPago, color: "text-emerald-600" },
              { label: "Em Aberto", count: stats.qtdeAbertos, valor: stats.totalAberto, color: "text-red-600" },
            ].map(({ label, count, valor, color }) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{count.toLocaleString('pt-BR')}</p>
                <p className={`text-xs ${color} opacity-80`}>{formatCurrency(valor)}</p>
              </div>
            ))}
          </div>

          {/* Mini gráfico de barras empilhadas */}
          {stats.diasVencimentoData.length > 0 && (
            <div className="px-4 pt-3 pb-2 overflow-x-auto scrollbar-hide">
              <div style={{ minWidth: Math.max(500, stats.diasVencimentoData.length * 38) + 'px' }}>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={stats.diasVencimentoData.map(item => {
                    const pagos = stats.diasVencimentoPagosData.find(p => p.diaNum === item.diaNum)?.qtde || 0;
                    const abertos = stats.diasVencimentoAbertosData.find(a => a.diaNum === item.diaNum)?.qtde || 0;
                    return { ...item, pagos, abertos };
                  })} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={20}>
                    <XAxis dataKey="dia" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.replace('Dia ', '')} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      formatter={(v: any, name: string) => [v.toLocaleString('pt-BR'), name === 'pagos' ? 'Pagos' : name === 'abertos' ? 'Em Aberto' : 'Emitidos']}
                    />
                    <Bar dataKey="pagos" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="abertos" stackId="a" fill="#ef4444" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Tabela compacta */}
          <div className="max-h-[320px] overflow-y-auto border-t border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dia</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Emitidos</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Pagos</th>
                  <th className="text-center px-3 py-2.5 text-[11px] font-semibold text-red-600 uppercase tracking-wide">Aberto</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Taxa</th>
                </tr>
              </thead>
              <tbody>
                {stats.diasVencimentoData.map((item, index) => {
                  const pagosItem = stats.diasVencimentoPagosData.find(p => p.diaNum === item.diaNum);
                  const abertosItem = stats.diasVencimentoAbertosData.find(a => a.diaNum === item.diaNum);
                  const taxaPagamento = item.qtde > 0 ? (pagosItem?.qtde || 0) / item.qtde * 100 : 0;
                  const taxaColor = taxaPagamento >= 80 ? 'text-emerald-600' : taxaPagamento >= 50 ? 'text-amber-600' : 'text-red-600';
                  const barColor = taxaPagamento >= 80 ? 'bg-emerald-500' : taxaPagamento >= 50 ? 'bg-amber-500' : 'bg-red-500';

                  return (
                    <tr key={item.dia} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${index % 2 === 0 ? '' : 'bg-muted/5'}`}>
                      <td className="px-4 py-2">
                        <span className="font-semibold text-sm">{item.dia}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="font-medium text-sm">{item.qtde.toLocaleString('pt-BR')}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="font-medium text-sm text-emerald-600">{(pagosItem?.qtde || 0).toLocaleString('pt-BR')}</span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(abertosItem?.qtde || 0) > 0 ? (
                          <span className="font-medium text-sm text-red-600">{abertosItem!.qtde.toLocaleString('pt-BR')}</span>
                        ) : (
                          <span className="text-emerald-500 text-sm">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, taxaPagamento)}%` }} />
                          </div>
                          <span className={`text-[11px] font-bold tabular-nums w-10 text-right ${taxaColor}`}>
                            {taxaPagamento.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico de Inadimplência */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Inadimplência por Dia</CardTitle>
            </div>
            {!isPortalAccess && corretoraId && mesReferencia && (
              <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)} className="gap-1.5 h-8 text-xs">
                <Settings className="h-3.5 w-3.5" />
                Configurar Referência
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="relative">
            {showScrollIndicators.left && (
              <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5">
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            {showScrollIndicators.right && (
              <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-card/90 border shadow-md rounded-full p-1.5">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
            <div className="overflow-x-auto scrollbar-hide" ref={inadimplenciaScrollRef} onScroll={updateScrollIndicators}>
              <div style={{ minWidth: Math.max(700, stats.inadimplenciaPorDia.length * 28) + 'px' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={stats.inadimplenciaPorDia} margin={{ top: 16, right: 8, bottom: 4, left: 0 }}>
                    <defs>
                      <linearGradient id="gradInadimplencia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="diaLabel" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} width={36} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                      formatter={(v: any, name: string) => [formatPercent(v), name]}
                      labelFormatter={(label) => {
                        const d = stats.inadimplenciaPorDia.find(x => x.diaLabel === label);
                        return d ? `Dia ${label} · ${d.qtdeVencidos} ab. de ${d.qtdeEmitidos}` : `Dia ${label}`;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="inadimplenciaReal" stroke="#3b82f6" fill="url(#gradInadimplencia)" strokeWidth={2} name="Real" dot={false} connectNulls />
                    <Line type="monotone" dataKey="inadimplenciaReferencia" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 4" name="Referência" dot={false} connectNulls />
                    {inadimplenciaHistorico.size > 0 && (
                      <Line type="monotone" dataKey="inadimplenciaHistorico" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" name="Histórico" dot={false} connectNulls />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1">← Arraste para navegar →</p>
          </div>
        </CardContent>
      </Card>

      {/* Arrecadação Projetada x Recebida */}
      <Card className="rounded-2xl border-border/40">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold">Arrecadação: Vencimentos vs Pagamentos</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto scrollbar-hide">
            <div style={{ minWidth: Math.max(600, stats.arrecadacaoData.length * 44) + 'px' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.arrecadacaoData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barGap={2}>
                  <XAxis dataKey="diaLabel" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => v.replace('Dia ', '')} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatCompactCurrency} width={48} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(v: any, name: string) => [formatCurrency(v), name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="projetado" fill="hsl(var(--primary))" name="Vencimentos" radius={[3, 3, 0, 0]} fillOpacity={0.7} />
                  <Bar dataKey="recebido" fill="#22c55e" name="Recebido" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rankings de Inadimplência - modernos com barras de progresso */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Menor Inadimplência por Regional */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold">Menor Inadimplência — Regional</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {stats.regionaisMenorInadimplencia.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.regionaisMenorInadimplencia.slice(0, 8).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maior Inadimplência por Regional */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <CardTitle className="text-sm font-semibold">Maior Inadimplência — Regional</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {stats.regionaisMaiorInadimplencia.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.regionaisMaiorInadimplencia.slice(0, 8).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{item.abertos}/{item.total}</span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-red-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Menor Inadimplência por Cooperativa */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <CardTitle className="text-sm font-semibold">Menor Inadimplência — Cooperativa</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {stats.cooperativasMenorInadimplencia.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.cooperativasMenorInadimplencia.slice(0, 8).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-emerald-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Maior Inadimplência por Cooperativa */}
        <Card className="rounded-2xl border-border/40">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <CardTitle className="text-sm font-semibold">Maior Inadimplência — Cooperativa</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {stats.cooperativasMaiorInadimplencia.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Sem dados suficientes</p>
            ) : (
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {stats.cooperativasMaiorInadimplencia.slice(0, 8).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{item.abertos}/{item.total}</span>
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, item.percentual)}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-red-600 tabular-nums w-12 text-right">{item.percentual.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rankings Regionais/Cooperativas: Pagos vs Abertos */}
      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "Regionais — Mais Pagos", data: stats.regionaisPagosData, isGreen: true },
          { title: "Regionais — Mais Abertos", data: stats.regionaisAbertosData, isGreen: false },
        ].map(({ title, data, isGreen }) => (
          <Card key={title} className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.slice(0, 10).map((item: any, i: number) => {
                  const maxVal = data[0]?.valor || 1;
                  const pct = (item.valor / maxVal) * 100;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">{item.qtde} bol.</span>
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${isGreen ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums w-16 text-right ${isGreen ? 'text-emerald-600' : 'text-red-600'}`}>{formatCompactCurrency(item.valor)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { title: "Cooperativas — Mais Pagas", data: stats.cooperativasPagosData, isGreen: true },
          { title: "Cooperativas — Mais Abertas", data: stats.cooperativasAbertosData, isGreen: false },
        ].map(({ title, data, isGreen }) => (
          <Card key={title} className="rounded-2xl border-border/40">
            <CardHeader className="pb-1 pt-4 px-5"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {data.slice(0, 10).map((item: any, i: number) => {
                  const maxVal = data[0]?.valor || 1;
                  const pct = (item.valor / maxVal) * 100;
                  return (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <span className="text-[11px] truncate flex-1" title={item.name}>{item.name}</span>
                      <span className="text-[10px] text-muted-foreground">{item.qtde} bol.</span>
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${isGreen ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums w-16 text-right ${isGreen ? 'text-emerald-600' : 'text-red-600'}`}>{formatCompactCurrency(item.valor)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog de configuração */}
      {corretoraId && mesReferencia && (
        <InadimplenciaReferenciaConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
          corretoraId={corretoraId}
          mesReferencia={mesReferencia}
          onSave={loadInadimplenciaConfig}
        />
      )}
    </div>
  );
}

