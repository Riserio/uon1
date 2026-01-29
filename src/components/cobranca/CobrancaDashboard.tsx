import { useMemo, useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, ComposedChart, ReferenceLine
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, AlertCircle, Calendar, FileText, CheckCircle2, Clock, Building2, ChevronLeft, ChevronRight, Settings } from "lucide-react";
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
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

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
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

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
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

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
      .sort((a: any, b: any) => b.valor - a.valor)
      .slice(0, 10);

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
      .sort((a, b) => a.percentual - b.percentual)
      .slice(0, 10);
    
    // Maior inadimplência (ordenado do maior para menor)
    const regionaisMaiorInadimplencia = [...regionaisInadimplenciaData]
      .sort((a, b) => b.percentual - a.percentual)
      .slice(0, 10);

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
      .sort((a, b) => a.percentual - b.percentual)
      .slice(0, 10);
    
    // Maior inadimplência por cooperativa
    const cooperativasMaiorInadimplencia = [...cooperativasInadimplenciaData]
      .sort((a, b) => b.percentual - a.percentual)
      .slice(0, 10);

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
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Boletos Emitidos</p>
                <p className="text-2xl font-bold">{stats.totalBoletos.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-blue-600 font-medium">{formatCurrency(stats.totalValor)}</p>
              </div>
              <FileText className="h-8 w-8 text-primary/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Boletos Pagos</p>
                <p className="text-2xl font-bold">{stats.qtdePagos.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-green-600 font-medium">{formatCurrency(stats.totalPago)}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Boletos em Aberto</p>
                <p className="text-2xl font-bold">{stats.qtdeAbertos.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-red-600 font-medium">{formatCurrency(stats.totalAberto)}</p>
              </div>
              <Clock className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">% Inadimplência</p>
                <p className="text-2xl font-bold">{formatPercent(stats.percentualInadimplencia)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-yellow-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Boletos por Dia de Vencimento */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              Boletos Emitidos por Dia Venc.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.diasVencimentoData.map((item) => (
                <div key={item.dia} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                  <span className="font-medium">{item.dia}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-blue-600">{formatCurrency(item.valor)}</p>
                    <div className="flex gap-2 text-[10px] mt-0.5">
                      <span className="text-green-600">{formatPercent(item.percPago)} pago</span>
                      <span className="text-red-600">{formatPercent(item.percAberto)} aberto</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border-2 border-primary/20 mt-2">
                <span className="font-bold">Total</span>
                <div className="text-right">
                  <p className="font-bold">{stats.totalBoletos} boletos</p>
                  <p className="text-sm text-blue-600 font-semibold">{formatCurrency(stats.totalValor)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Boletos Pagos por Dia Venc.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.diasVencimentoPagosData.map((item) => (
                <div key={item.dia} className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg">
                  <span className="font-medium">{item.dia}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-green-600">{formatCurrency(item.valor)}</p>
                    <div className="flex gap-2 text-[10px] mt-0.5">
                      <span className="text-green-600 font-medium">{formatPercent(item.percPago)} pago</span>
                      <span className="text-red-600">{formatPercent(item.percAberto)} aberto</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-green-500/20 rounded-lg border-2 border-green-500/30 mt-2">
                <span className="font-bold">Total Pagos</span>
                <div className="text-right">
                  <p className="font-bold">{stats.qtdePagos} boletos</p>
                  <p className="text-sm text-green-600 font-semibold">{formatCurrency(stats.totalPago)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-red-500" />
              Boletos em Aberto por Dia Venc.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {stats.diasVencimentoAbertosData.map((item) => (
                <div key={item.dia} className="flex items-center justify-between p-2 bg-red-500/10 rounded-lg">
                  <span className="font-medium">{item.dia}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-red-600">{formatCurrency(item.valor)}</p>
                    <div className="flex gap-2 text-[10px] mt-0.5">
                      <span className="text-green-600">{formatPercent(item.percPago)} pago</span>
                      <span className="text-red-600 font-medium">{formatPercent(item.percAberto)} aberto</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-red-500/20 rounded-lg border-2 border-red-500/30 mt-2">
                <span className="font-bold">Total em Aberto</span>
                <div className="text-right">
                  <p className="font-bold">{stats.qtdeAbertos} boletos</p>
                  <p className="text-sm text-red-600 font-semibold">{formatCurrency(stats.totalAberto)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Inadimplência com duas linhas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Inadimplência
            </CardTitle>
            {/* Botão de configuração - oculto para parceiros */}
            {!isPortalAccess && corretoraId && mesReferencia && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigDialogOpen(true)}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Configurar Referência
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Scroll Indicator Left */}
            {showScrollIndicators.left && (
              <button
                onClick={() => handleScroll('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background border shadow-lg rounded-full p-2 transition-all"
                aria-label="Scroll para esquerda"
              >
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            
            {/* Scroll Indicator Right */}
            {showScrollIndicators.right && (
              <button
                onClick={() => handleScroll('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/90 hover:bg-background border shadow-lg rounded-full p-2 transition-all"
                aria-label="Scroll para direita"
              >
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            )}

            <div 
              className="overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent"
              ref={inadimplenciaScrollRef}
              onScroll={updateScrollIndicators}
            >
              <div style={{ minWidth: Math.max(800, stats.inadimplenciaPorDia.length * 30) + 'px' }}>
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={stats.inadimplenciaPorDia}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="diaLabel" 
                      tick={{ fontSize: 10 }} 
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={(v) => `${v.toFixed(0)}%`}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const dataPoint = stats.inadimplenciaPorDia.find(d => d.diaLabel === label);
                          return (
                            <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                              <p className="font-medium mb-1">Dia {label}</p>
                              {payload.map((entry: any, index: number) => (
                                <p key={index} style={{ color: entry.color }}>
                                  {entry.name}: {formatPercent(entry.value)}
                                </p>
                              ))}
                              {dataPoint && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {`${dataPoint.qtdeVencidos} abertos de ${dataPoint.qtdeEmitidos} emitidos`}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="inadimplenciaReal"
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="Inadimplência Real" 
                      dot={{ fill: '#3b82f6', r: 2 }}
                      connectNulls
                    />
                    <Line 
                      type="monotone" 
                      dataKey="inadimplenciaReferencia"
                      stroke="#10b981" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Inadimplência Referência" 
                      dot={false}
                      connectNulls
                    />
                    {inadimplenciaHistorico.size > 0 && (
                      <Line 
                        type="monotone" 
                        dataKey="inadimplenciaHistorico"
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        name="Histórico (dia anterior)" 
                        dot={{ fill: '#f59e0b', r: 1.5 }}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Scroll hint text */}
            <p className="text-[10px] text-muted-foreground text-center mt-2">
              ← Arraste para ver mais dias →
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Arrecadação Projetada x Recebida */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Arrecadação Projetada x Recebida no Dia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(800, stats.arrecadacaoData.length * 50) + 'px' }}>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={stats.arrecadacaoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="diaLabel" tick={{ fontSize: 11 }} />
                  <YAxis 
                    tick={{ fontSize: 11 }} 
                    tickFormatter={(v) => formatCompactCurrency(v)}
                  />
                  <Tooltip content={<CustomTooltip isCurrency />} />
                  <Legend />
                  <Bar 
                    dataKey="projetado" 
                    fill="#3b82f6" 
                    name="Vencimentos (Projetado)" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="recebido" 
                    fill="#10b981" 
                    name="Pagamentos (Recebido)" 
                    radius={[4, 4, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rankings de Inadimplência por Regional */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Menor Inadimplência (Regional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.regionaisMenorInadimplencia.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível
                </p>
              ) : (
                stats.regionaisMenorInadimplencia.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.abertos} de {item.total} boletos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">{item.percentual.toFixed(1)}%</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Maior Inadimplência (Regional)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.regionaisMaiorInadimplencia.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível
                </p>
              ) : (
                stats.regionaisMaiorInadimplencia.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.abertos} de {item.total} boletos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{item.percentual.toFixed(1)}%</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings de Inadimplência por Cooperativa */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Menor Inadimplência (Cooperativa)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.cooperativasMenorInadimplencia.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível
                </p>
              ) : (
                stats.cooperativasMenorInadimplencia.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.abertos} de {item.total} boletos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-green-600">{item.percentual.toFixed(1)}%</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Maior Inadimplência (Cooperativa)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.cooperativasMaiorInadimplencia.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum dado disponível
                </p>
              ) : (
                stats.cooperativasMaiorInadimplencia.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.abertos} de {item.total} boletos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{item.percentual.toFixed(1)}%</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-green-500" />
              Ranking Regionais - Boletos Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.regionaisPagosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-green-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-red-500" />
              Ranking Regionais - Boletos em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.regionaisAbertosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-red-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rankings de Cooperativas */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-green-500" />
              Ranking Cooperativas - Boletos Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.cooperativasPagosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-green-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-green-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-red-500" />
              Ranking Cooperativas - Boletos em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {stats.cooperativasAbertosData.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 p-2 bg-red-500/10 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm">{item.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{item.qtde} boletos</p>
                    <p className="text-xs text-red-600">{formatCurrency(item.valor)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de configuração de inadimplência */}
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
