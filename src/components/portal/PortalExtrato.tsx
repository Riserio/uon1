import { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PortalExtrato({ corretoraId }: { corretoraId?: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    ano: new Date().getFullYear().toString(),
    mes: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    produto: '',
    seguradora: '',
    status: 'todos',
  });

  const fetchExtrato = async () => {
    if (!corretoraId) return; // Aguardar seleção de corretora
    
    setLoading(true);
    try {
      const lastDayOfMonth = new Date(parseInt(filters.ano), parseInt(filters.mes), 0).getDate();
      
      let query = supabase
        .from('producao_financeira')
        .select('*')
        .eq('corretora_id', corretoraId)
        .gte('competencia', `${filters.ano}-${filters.mes}-01`)
        .lte('competencia', `${filters.ano}-${filters.mes}-${lastDayOfMonth}`)
        .order('competencia', { ascending: false });

      if (filters.produto) {
        query = query.eq('produto', filters.produto);
      }
      if (filters.seguradora) {
        query = query.eq('seguradora', filters.seguradora);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data: result, error } = await query;
      if (error) throw error;
      setData(result || []);
    } catch (error: any) {
      console.error('Error fetching extrato:', error);
      toast.error('Erro ao carregar extrato');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (corretoraId) {
      fetchExtrato();
    }
  }, [filters.ano, filters.mes, filters.produto, filters.seguradora, filters.status, corretoraId]);

  // Anos: próximo ano + atuais (inclui 2026)
  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => (currentYear + 1 - i).toString());
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
    <div className="space-y-4">
      <div className="flex gap-4 flex-wrap">
        <Select
          value={filters.ano}
          onValueChange={(value) => setFilters({ ...filters, ano: value })}
        >
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

        <Select
          value={filters.mes}
          onValueChange={(value) => setFilters({ ...filters, mes: value })}
        >
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

        <Input
          placeholder="Produto"
          value={filters.produto}
          onChange={(e) => setFilters({ ...filters, produto: e.target.value })}
          className="w-40"
        />

        <Input
          placeholder="Associação"
          value={filters.seguradora}
          onChange={(e) => setFilters({ ...filters, seguradora: e.target.value })}
          className="w-40"
        />

        <Select
          value={filters.status}
          onValueChange={(value) => setFilters({ ...filters, status: value === 'todos' ? '' : value })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
            <SelectItem value="estornado">Estornado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12">Carregando...</div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Segurado</TableHead>
                  <TableHead>Associação</TableHead>
                  <TableHead className="text-right">Prêmio</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Repasse</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {new Date(item.competencia).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>{item.produto}</TableCell>
                      <TableCell>{item.segurado_nome}</TableCell>
                      <TableCell>{item.seguradora}</TableCell>
                      <TableCell className="text-right">
                        R$ {parseFloat(item.premio_total || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseFloat(item.percentual_comissao || 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {parseFloat(item.valor_comissao || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {parseFloat(item.repasse_pago || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            item.status === 'ativo'
                              ? 'bg-green-100 text-green-800'
                              : item.status === 'cancelado'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
