import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { useMenuPermissions } from "@/hooks/useMenuPermissions";
import { useAuth } from "@/hooks/useAuth";
import { useBIAuditLog } from "@/hooks/useBIAuditLog";
import { Save, Car, Bike, Truck, Calendar } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface EstudoBaseData {
  id?: string;
  corretora_id: string;
  data_referencia: string;
  total_veiculos_geral: number;
  total_veiculos_ativos: number;
  qtd_passeio: number;
  qtd_motocicletas: number;
  qtd_utilitarios_suvs_vans: number;
  qtd_caminhoes: number;
  qtd_taxi_app: number;
  qtd_especiais_importados: number;
  qtd_carretas: number;
  tm_geral: number;
  tm_passeio: number;
  tm_motocicletas: number;
  tm_utilitarios_suvs_vans: number;
  tm_caminhoes: number;
  tm_taxi_app: number;
  tm_especiais_importados: number;
  tm_carretas: number;
  protegido_geral: number;
  protegido_passeio: number;
  protegido_motocicletas: number;
  protegido_utilitarios_suvs_vans: number;
  protegido_caminhoes: number;
  protegido_taxi_app: number;
  protegido_especiais_importados: number;
  protegido_carretas: number;
  valor_protegido_geral: number;
  valor_protegido_passeio: number;
  valor_protegido_motocicletas: number;
  valor_protegido_utilitarios_suvs_vans: number;
  valor_protegido_caminhoes: number;
  valor_protegido_taxi_app: number;
  valor_protegido_especiais_importados: number;
  valor_protegido_carretas: number;
}

const defaultData: Omit<EstudoBaseData, 'corretora_id' | 'data_referencia'> = {
  total_veiculos_geral: 0,
  total_veiculos_ativos: 0,
  qtd_passeio: 0,
  qtd_motocicletas: 0,
  qtd_utilitarios_suvs_vans: 0,
  qtd_caminhoes: 0,
  qtd_taxi_app: 0,
  qtd_especiais_importados: 0,
  qtd_carretas: 0,
  tm_geral: 0,
  tm_passeio: 0,
  tm_motocicletas: 0,
  tm_utilitarios_suvs_vans: 0,
  tm_caminhoes: 0,
  tm_taxi_app: 0,
  tm_especiais_importados: 0,
  tm_carretas: 0,
  protegido_geral: 0,
  protegido_passeio: 0,
  protegido_motocicletas: 0,
  protegido_utilitarios_suvs_vans: 0,
  protegido_caminhoes: 0,
  protegido_taxi_app: 0,
  protegido_especiais_importados: 0,
  protegido_carretas: 0,
  valor_protegido_geral: 0,
  valor_protegido_passeio: 0,
  valor_protegido_motocicletas: 0,
  valor_protegido_utilitarios_suvs_vans: 0,
  valor_protegido_caminhoes: 0,
  valor_protegido_taxi_app: 0,
  valor_protegido_especiais_importados: 0,
  valor_protegido_carretas: 0,
};

const COLORS = ["#2563eb", "#16a34a", "#eab308", "#dc2626", "#8b5cf6", "#ec4899", "#14b8a6"];

const categorias = [
  { key: "passeio", label: "Passeio", icon: Car },
  { key: "motocicletas", label: "Motocicletas", icon: Bike },
  { key: "utilitarios_suvs_vans", label: "Utilitários/SUVs/Vans", icon: Car },
  { key: "caminhoes", label: "Caminhões", icon: Truck },
  { key: "taxi_app", label: "Táxi/APP", icon: Car },
  { key: "especiais_importados", label: "Especiais/Importados", icon: Car },
  { key: "carretas", label: "Carretas", icon: Truck },
];

export default function PIDEstudoBase({ corretoraId }: { corretoraId?: string }) {
  const { user } = useAuth();
  const { registrarLog } = useBIAuditLog();
  const { canEditMenu } = useMenuPermissions(user?.id);
  const canEdit = canEditMenu("pid");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<EstudoBaseData | null>(null);
  const [originalData, setOriginalData] = useState<EstudoBaseData | null>(null);
  const [dataReferencia, setDataReferencia] = useState(new Date().toISOString().split("T")[0]);

  const fetchData = async () => {
    if (!corretoraId) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase
        .from("pid_estudo_base")
        .select("*")
        .eq("corretora_id", corretoraId)
        .eq("data_referencia", dataReferencia)
        .maybeSingle();

      if (error) throw error;

      if (result) {
        const fetchedData = result as unknown as EstudoBaseData;
        setData(fetchedData);
        setOriginalData(fetchedData);
      } else {
        const newData = {
          ...defaultData,
          corretora_id: corretoraId,
          data_referencia: dataReferencia,
        };
        setData(newData);
        setOriginalData(null);
      }
    } catch (error: any) {
      console.error("Error fetching estudo base:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchData();
    }
  }, [corretoraId, dataReferencia]);

  const handleSave = async () => {
    if (!data || !corretoraId || !user) return;
    setSaving(true);
    try {
      const saveData = {
        ...data,
        corretora_id: corretoraId,
        data_referencia: dataReferencia,
        updated_by: user.id,
      };

      if (data.id) {
        const { error } = await supabase
          .from("pid_estudo_base")
          .update(saveData)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pid_estudo_base")
          .insert({ ...saveData, created_by: user.id });
        if (error) throw error;
      }

      // Registrar log com valores anteriores e novos
      await registrarLog({
        modulo: "bi_indicadores",
        acao: data.id ? "alteracao" : "importacao",
        descricao: `Estudo de Base ${data.id ? "atualizado" : "criado"} - ${dataReferencia}`,
        corretoraId,
        dadosAnteriores: originalData ? {
          data_referencia: originalData.data_referencia,
          total_veiculos_geral: originalData.total_veiculos_geral,
          total_veiculos_ativos: originalData.total_veiculos_ativos,
          protegido_geral: originalData.protegido_geral,
          tm_geral: originalData.tm_geral,
        } : null,
        dadosNovos: {
          data_referencia: dataReferencia,
          total_veiculos_geral: data.total_veiculos_geral,
          total_veiculos_ativos: data.total_veiculos_ativos,
          protegido_geral: data.protegido_geral,
          tm_geral: data.tm_geral,
        },
      });

      // Atualizar originalData após salvar
      setOriginalData(data);

      toast.success("Dados salvos com sucesso!");
      fetchData();
    } catch (error: any) {
      console.error("Error saving estudo base:", error);
      toast.error("Erro ao salvar dados");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof EstudoBaseData, value: number) => {
    if (!data) return;
    setData({ ...data, [field]: value });
  };

  // Auto-calculate totals when category values change
  useEffect(() => {
    if (!data) return;

    // Total Veículos Geral = soma das quantidades
    const totalVeiculosGeral = categorias.reduce((sum, cat) => {
      return sum + (data[`qtd_${cat.key}` as keyof EstudoBaseData] as number || 0);
    }, 0);

    // Veículos Ativos = soma dos protegidos (quantidade)
    const totalVeiculosAtivos = categorias.reduce((sum, cat) => {
      return sum + (data[`protegido_${cat.key}` as keyof EstudoBaseData] as number || 0);
    }, 0);

    // Total Valor Protegido Geral = soma dos valores protegidos (monetário)
    const totalValorProtegidoGeral = categorias.reduce((sum, cat) => {
      return sum + (data[`valor_protegido_${cat.key}` as keyof EstudoBaseData] as number || 0);
    }, 0);

    // Calculate weighted average for ticket médio
    const totalTMPonderado = categorias.reduce((sum, cat) => {
      const qtd = data[`qtd_${cat.key}` as keyof EstudoBaseData] as number || 0;
      const tm = data[`tm_${cat.key}` as keyof EstudoBaseData] as number || 0;
      return sum + (qtd * tm);
    }, 0);
    const tmGeral = totalVeiculosGeral > 0 ? totalTMPonderado / totalVeiculosGeral : 0;

    // Only update if values changed to prevent infinite loop
    if (
      data.total_veiculos_geral !== totalVeiculosGeral ||
      data.total_veiculos_ativos !== totalVeiculosAtivos ||
      data.valor_protegido_geral !== totalValorProtegidoGeral ||
      Math.abs(data.tm_geral - tmGeral) > 0.01
    ) {
      setData(prev => prev ? {
        ...prev,
        total_veiculos_geral: totalVeiculosGeral,
        total_veiculos_ativos: totalVeiculosAtivos,
        valor_protegido_geral: totalValorProtegidoGeral,
        tm_geral: parseFloat(tmGeral.toFixed(2)),
      } : null);
    }
  }, [
    data?.qtd_passeio, data?.qtd_motocicletas, data?.qtd_utilitarios_suvs_vans,
    data?.qtd_caminhoes, data?.qtd_taxi_app, data?.qtd_especiais_importados, data?.qtd_carretas,
    data?.tm_passeio, data?.tm_motocicletas, data?.tm_utilitarios_suvs_vans,
    data?.tm_caminhoes, data?.tm_taxi_app, data?.tm_especiais_importados, data?.tm_carretas,
    data?.protegido_passeio, data?.protegido_motocicletas, data?.protegido_utilitarios_suvs_vans,
    data?.protegido_caminhoes, data?.protegido_taxi_app, data?.protegido_especiais_importados, data?.protegido_carretas,
    data?.valor_protegido_passeio, data?.valor_protegido_motocicletas, data?.valor_protegido_utilitarios_suvs_vans,
    data?.valor_protegido_caminhoes, data?.valor_protegido_taxi_app, data?.valor_protegido_especiais_importados, data?.valor_protegido_carretas,
  ]);

  // Prepare chart data with useMemo to ensure reactivity
  const distribuicaoFrotaData = useMemo(() => {
    if (!data) return [];
    return categorias.map((cat, index) => ({
      name: cat.label,
      value: data[`qtd_${cat.key}` as keyof EstudoBaseData] as number,
      fill: COLORS[index % COLORS.length],
    })).filter(d => d.value > 0);
  }, [data]);

  const ticketMedioData = useMemo(() => {
    if (!data) return [];
    return categorias.map((cat) => ({
      categoria: cat.label,
      valor: data[`tm_${cat.key}` as keyof EstudoBaseData] as number,
    })).filter(d => d.valor > 0);
  }, [data]);

  const valorProtegidoData = useMemo(() => {
    if (!data) return [];
    return categorias.map((cat, index) => ({
      name: cat.label,
      value: data[`valor_protegido_${cat.key}` as keyof EstudoBaseData] as number,
      fill: COLORS[index % COLORS.length],
    })).filter(d => d.value > 0);
  }, [data]);

  // Generate unique key for charts to force re-render
  const chartKey = useMemo(() => {
    if (!data) return 'empty';
    return JSON.stringify({
      qtd: categorias.map(c => data[`qtd_${c.key}` as keyof EstudoBaseData]),
      tm: categorias.map(c => data[`tm_${c.key}` as keyof EstudoBaseData]),
      vp: categorias.map(c => data[`valor_protegido_${c.key}` as keyof EstudoBaseData]),
    });
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Estudo de Base</h2>
          <p className="text-sm text-muted-foreground">Análise da frota por categoria de veículo</p>
        </div>

        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={dataReferencia}
              onChange={(e) => setDataReferencia(e.target.value)}
              className="w-40"
            />
          </div>

          {canEdit && (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          )}
        </div>
      </div>

      {/* Totais Gerais - Calculados automaticamente */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Veículos Geral</div>
            <div className="mt-1 text-2xl font-bold">{data.total_veiculos_geral.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Veículos Ativos</div>
            <div className="mt-1 text-2xl font-bold">{data.total_veiculos_ativos.toLocaleString("pt-BR")}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Ticket Médio Geral</div>
            <div className="mt-1 text-2xl font-bold">{formatCurrency(data.tm_geral)}</div>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Valor Protegido Geral</div>
            <div className="mt-1 text-2xl font-bold">{formatCurrency(data.valor_protegido_geral)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Categorias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalhamento por Categoria</CardTitle>
          <CardDescription>Quantidade, ticket médio e valores protegidos por tipo de veículo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-2 font-medium">Categoria</th>
                  <th className="text-right py-3 px-2 font-medium">Quantidade</th>
                  <th className="text-right py-3 px-2 font-medium">Ticket Médio</th>
                  <th className="text-right py-3 px-2 font-medium">Protegido</th>
                  <th className="text-right py-3 px-2 font-medium">Valor Protegido</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <tr key={cat.key} className="border-b hover:bg-muted/30">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {cat.label}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right">
                        {canEdit ? (
                          <Input
                            type="number"
                            value={data[`qtd_${cat.key}` as keyof EstudoBaseData] as number}
                            onChange={(e) => updateField(`qtd_${cat.key}` as keyof EstudoBaseData, parseInt(e.target.value) || 0)}
                            className="h-8 w-24 text-right ml-auto"
                          />
                        ) : (
                          (data[`qtd_${cat.key}` as keyof EstudoBaseData] as number).toLocaleString("pt-BR")
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {canEdit ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={data[`tm_${cat.key}` as keyof EstudoBaseData] as number}
                            onChange={(e) => updateField(`tm_${cat.key}` as keyof EstudoBaseData, parseFloat(e.target.value) || 0)}
                            className="h-8 w-28 text-right ml-auto"
                          />
                        ) : (
                          formatCurrency(data[`tm_${cat.key}` as keyof EstudoBaseData] as number)
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {canEdit ? (
                          <Input
                            type="number"
                            value={data[`protegido_${cat.key}` as keyof EstudoBaseData] as number}
                            onChange={(e) => updateField(`protegido_${cat.key}` as keyof EstudoBaseData, parseInt(e.target.value) || 0)}
                            className="h-8 w-24 text-right ml-auto"
                          />
                        ) : (
                          (data[`protegido_${cat.key}` as keyof EstudoBaseData] as number).toLocaleString("pt-BR")
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {canEdit ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={data[`valor_protegido_${cat.key}` as keyof EstudoBaseData] as number}
                            onChange={(e) => updateField(`valor_protegido_${cat.key}` as keyof EstudoBaseData, parseFloat(e.target.value) || 0)}
                            className="h-8 w-32 text-right ml-auto"
                          />
                        ) : (
                          formatCurrency(data[`valor_protegido_${cat.key}` as keyof EstudoBaseData] as number)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição da Frota</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {distribuicaoFrotaData.length > 0 ? (
              <ResponsiveContainer key={`frota-${chartKey}`} width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribuicaoFrotaData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {distribuicaoFrotaData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => value.toLocaleString("pt-BR")} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ticket Médio por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {ticketMedioData.length > 0 ? (
              <ResponsiveContainer key={`ticket-${chartKey}`} width="100%" height="100%">
                <BarChart data={ticketMedioData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="categoria" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                  <Bar dataKey="valor" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}