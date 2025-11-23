import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PortalIndicadores() {
  const [loading, setLoading] = useState(true);
  const [indicadores, setIndicadores] = useState<any>(null);

  const fetchIndicadores = async () => {
    setLoading(true);
    try {
      // Buscar dados dos últimos 12 meses
      const hoje = new Date();
      const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
      
      const { data: producao, error } = await supabase
        .from('producao_financeira')
        .select('*')
        .gte('competencia', dataInicio.toISOString().split('T')[0])
        .order('competencia', { ascending: true });

      if (error) throw error;

      // Processar dados para gráficos
      const porMes: any = {};
      const porProduto: any = {};
      const porSeguradora: any = {};

      producao?.forEach(p => {
        const mes = p.competencia?.substring(0, 7) || '';
        porMes[mes] = (porMes[mes] || 0) + (p.premio_total || 0);
        porProduto[p.produto || 'Outros'] = (porProduto[p.produto || 'Outros'] || 0) + (p.premio_total || 0);
        porSeguradora[p.seguradora || 'Outros'] = (porSeguradora[p.seguradora || 'Outros'] || 0) + (p.premio_total || 0);
      });

      setIndicadores({
        producaoPorMes: Object.entries(porMes).map(([mes, valor]) => ({ mes, valor })),
        producaoPorProduto: Object.entries(porProduto).map(([produto, valor]) => ({ produto, valor })),
        producaoPorSeguradora: Object.entries(porSeguradora).map(([seguradora, valor]) => ({ seguradora, valor })),
      });
    } catch (error: any) {
      console.error('Error fetching indicadores:', error);
      toast.error('Erro ao carregar indicadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndicadores();
  }, []);

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  if (loading) {
    return <div className="text-center py-12">Carregando...</div>;
  }

  if (!indicadores) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Produção por Mês (Últimos 12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={indicadores.producaoPorMes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip formatter={(value) => `R$ ${parseFloat(value as string).toFixed(2)}`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="valor"
                stroke="hsl(var(--primary))"
                name="Produção"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por Produto</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={indicadores.producaoPorProduto}
                dataKey="valor"
                nameKey="produto"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {indicadores.producaoPorProduto.map((_: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `R$ ${parseFloat(value as string).toFixed(2)}`} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produção por Seguradora</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={indicadores.producaoPorSeguradora}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="seguradora" />
              <YAxis />
              <Tooltip formatter={(value) => `R$ ${parseFloat(value as string).toFixed(2)}`} />
              <Bar dataKey="valor" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
