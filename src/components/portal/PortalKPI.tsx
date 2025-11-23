import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PortalKPI() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>(null);
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));

  const fetchKPIs = async () => {
    setLoading(true);
    try {
      const lastDayOfMonth = new Date(parseInt(ano), parseInt(mes), 0).getDate();
      
      // Buscar dados diretamente do banco
      const { data: producao, error } = await supabase
        .from('producao_financeira')
        .select('*')
        .gte('competencia', `${ano}-${mes}-01`)
        .lte('competencia', `${ano}-${mes}-${lastDayOfMonth}`);

      if (error) throw error;

      const faturamento = producao?.reduce((sum, p) => sum + (p.premio_total || 0), 0) || 0;
      const comissoes = producao?.reduce((sum, p) => sum + (p.valor_comissao || 0), 0) || 0;
      const repassePrevisto = producao?.reduce((sum, p) => sum + (p.repasse_previsto || 0), 0) || 0;
      const repassePago = producao?.reduce((sum, p) => sum + (p.repasse_pago || 0), 0) || 0;
      const repassePendente = repassePrevisto - repassePago;

      setKpis({
        faturamento: faturamento.toFixed(2),
        comissoes: comissoes.toFixed(2),
        repassePrevisto: repassePrevisto.toFixed(2),
        repassePago: repassePago.toFixed(2),
        repassePendente: repassePendente.toFixed(2),
      });
    } catch (error: any) {
      console.error('Error fetching KPIs:', error);
      toast.error('Erro ao carregar KPIs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKPIs();
  }, [ano, mes]);

  const anos = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString());
  const meses = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {anos.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {meses.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : kpis ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {kpis.faturamento}</div>
              <p className="text-xs text-muted-foreground">Prêmio total do período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comissões</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {kpis.comissoes}</div>
              <p className="text-xs text-muted-foreground">Total de comissões</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Repasse Previsto</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {kpis.repassePrevisto}</div>
              <p className="text-xs text-muted-foreground">A receber</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Repasse Pago</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">R$ {kpis.repassePago}</div>
              <p className="text-xs text-muted-foreground">
                Pendente: R$ {kpis.repassePendente}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
