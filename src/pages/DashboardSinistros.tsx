import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Clock, TrendingUp, DollarSign, Building2, Wrench, FileText, Users, Car, ArrowLeft } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function DashboardSinistros() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [tipoData, setTipoData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [corretoras, setCorretoras] = useState<any[]>([]);
  const [selectedCorretora, setSelectedCorretora] = useState('all');
  const [corretoraStats, setCorretoraStats] = useState<any[]>([]);

  useEffect(() => {
    loadCorretoras();
    loadDashboardData();
  }, [selectedCorretora]);

  const loadCorretoras = async () => {
    const { data } = await supabase.from('corretoras').select('id, nome').order('nome');
    setCorretoras(data || []);
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      let query = supabase.from('vistorias').select('*').order('created_at', { ascending: false });
      if (selectedCorretora !== 'all') query = query.eq('corretora_id', selectedCorretora);
      
      const { data: vistorias } = await query;
      if (!vistorias) return;

      const now = new Date();
      const custoTotal = vistorias.reduce((sum, v) => sum + (Number(v.custo_oficina) || 0) + (Number(v.custo_reparo) || 0) + (Number(v.custo_acordo) || 0) + (Number(v.custo_terceiros) || 0) + (Number(v.custo_perda_total) || 0) + (Number(v.custo_perda_parcial) || 0), 0);

      setStats({
        total: vistorias.length,
        aguardando: vistorias.filter(v => v.status === 'aguardando_fotos').length,
        analise: vistorias.filter(v => v.status === 'em_analise').length,
        concluidas: vistorias.filter(v => v.status === 'concluida').length,
        custoTotal,
        custoMedio: vistorias.length > 0 ? custoTotal / vistorias.length : 0,
        custoOficina: vistorias.reduce((sum, v) => sum + (Number(v.custo_oficina) || 0), 0),
        custoReparo: vistorias.reduce((sum, v) => sum + (Number(v.custo_reparo) || 0), 0),
        custoAcordo: vistorias.reduce((sum, v) => sum + (Number(v.custo_acordo) || 0), 0),
        custoTerceiros: vistorias.reduce((sum, v) => sum + (Number(v.custo_terceiros) || 0), 0),
        custoPerdaTotal: vistorias.reduce((sum, v) => sum + (Number(v.custo_perda_total) || 0), 0),
        custoPerdaParcial: vistorias.reduce((sum, v) => sum + (Number(v.custo_perda_parcial) || 0), 0),
      });

      setStatusData([
        { name: 'Aguardando', value: vistorias.filter(v => v.status === 'aguardando_fotos').length },
        { name: 'Em Análise', value: vistorias.filter(v => v.status === 'em_analise').length },
        { name: 'Concluídas', value: vistorias.filter(v => v.status === 'concluida').length },
      ]);

      const tipos: any = {};
      vistorias.forEach(v => {
        const tipo = v.tipo_sinistro || 'Não especificado';
        if (!tipos[tipo]) tipos[tipo] = { count: 0, custo: 0 };
        tipos[tipo].count++;
        tipos[tipo].custo += (Number(v.custo_oficina) || 0) + (Number(v.custo_reparo) || 0);
      });
      setTipoData(Object.entries(tipos).map(([name, data]: any) => ({ name, value: data.count, custo: data.custo })));
    } catch (error) {
      toast.error('Erro ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2"><TrendingUp className="h-8 w-8 text-primary" />Dashboard de Sinistros</h1>
            <p className="text-muted-foreground">Visão completa de custos e métricas</p>
          </div>
          <div className="flex gap-3">
            <Select value={selectedCorretora} onValueChange={setSelectedCorretora}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {corretoras.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => navigate('/sinistros/novo')} variant="outline"><ArrowLeft className="h-5 w-5" />Voltar</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Car className="h-4 w-4" />Total</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Aguardando</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-yellow-600">{stats.aguardando}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Em Análise</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-purple-600">{stats.analise}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Concluídos</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold text-green-600">{stats.concluidas}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" />Custo Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{formatCurrency(stats.custoTotal)}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" />Custo Médio</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{formatCurrency(stats.custoMedio)}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" />Oficinas</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-indigo-600">{formatCurrency(stats.custoOficina)}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-pink-500/10 to-pink-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" />Reparos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-pink-600">{formatCurrency(stats.custoReparo)}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-teal-500/10 to-teal-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Acordos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-teal-600">{formatCurrency(stats.custoAcordo)}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Terceiros</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-cyan-600">{formatCurrency(stats.custoTerceiros)}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Perda Total</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-rose-600">{formatCurrency(stats.custoPerdaTotal)}</div></CardContent></Card>
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5"><CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" />Perda Parcial</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-amber-600">{formatCurrency(stats.custoPerdaParcial)}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card><CardHeader><CardTitle>Status</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={statusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label>{statusData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></CardContent></Card>
          <Card><CardHeader><CardTitle>Por Tipo</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={300}><BarChart data={tipoData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" angle={-45} textAnchor="end" height={100} /><YAxis /><Tooltip /><Bar dataKey="value" fill="#3b82f6" /></BarChart></ResponsiveContainer></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
