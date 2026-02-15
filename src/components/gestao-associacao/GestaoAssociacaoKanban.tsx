import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, Calendar, MapPin, Car, DollarSign, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KanbanColumn } from '@/components/KanbanColumn';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { GestaoAssociacaoFluxoSelector } from './GestaoAssociacaoFluxoSelector';

interface StatusConfig {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
  corretora_id: string | null;
  fluxo_id: string | null;
}

interface EventoCard {
  id: string;
  protocolo: string | null;
  placa: string | null;
  modelo_veiculo: string | null;
  motivo_evento: string | null;
  situacao_evento: string | null;
  data_evento: string | null;
  data_cadastro_evento: string | null;
  evento_cidade: string | null;
  evento_estado: string | null;
  cooperativa: string | null;
  regional: string | null;
  custo_evento: number | null;
  valor_reparo: number | null;
  valor_protegido_veiculo: number | null;
  classificacao: string | null;
  tipo_evento: string | null;
  corretora_id: string | null;
  corretora_nome: string | null;
}

interface GestaoAssociacaoKanbanProps {
  readOnly?: boolean;
  corretoraId?: string | null;
  selectedCorretoraId?: string | null;
  onConfigureFluxos?: () => void;
}

export function GestaoAssociacaoKanban({ readOnly = false, corretoraId, selectedCorretoraId, onConfigureFluxos }: GestaoAssociacaoKanbanProps) {
  const [allStatusConfigs, setAllStatusConfigs] = useState<StatusConfig[]>([]);
  const [eventos, setEventos] = useState<EventoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCorretora, setFilterCorretora] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [corretoras, setCorretoras] = useState<{ id: string; nome: string }[]>([]);
  const [selectedFluxoId, setSelectedFluxoId] = useState<string | null>(null);
  const [fluxoRefreshKey, setFluxoRefreshKey] = useState(0);

  const effectiveCorretoraId = corretoraId || selectedCorretoraId || null;

  useEffect(() => {
    loadData();
  }, [effectiveCorretoraId]);

  const fetchAllBatched = async (activeStatusNames: string[]): Promise<EventoCard[]> => {
    const BATCH_SIZE = 1000;
    const MAX_ROWS = 100000;
    const allData: EventoCard[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < MAX_ROWS) {
      let query = supabase
        .from('sga_eventos')
        .select(`
          id, protocolo, placa, modelo_veiculo, motivo_evento, situacao_evento,
          data_evento, data_cadastro_evento, evento_cidade, evento_estado,
          cooperativa, regional, custo_evento, valor_reparo, valor_protegido_veiculo,
          classificacao, tipo_evento,
          sga_importacoes!inner(corretora_id, corretoras(id, nome))
        `)
        .in('situacao_evento', activeStatusNames)
        .order('data_cadastro_evento', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (effectiveCorretoraId) {
        query = query.eq('sga_importacoes.corretora_id', effectiveCorretoraId);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const mapped = data.map((e: any) => ({
          id: e.id, protocolo: e.protocolo, placa: e.placa,
          modelo_veiculo: e.modelo_veiculo, motivo_evento: e.motivo_evento,
          situacao_evento: e.situacao_evento, data_evento: e.data_evento,
          data_cadastro_evento: e.data_cadastro_evento, evento_cidade: e.evento_cidade,
          evento_estado: e.evento_estado, cooperativa: e.cooperativa,
          regional: e.regional, custo_evento: e.custo_evento,
          valor_reparo: e.valor_reparo, valor_protegido_veiculo: e.valor_protegido_veiculo,
          classificacao: e.classificacao, tipo_evento: e.tipo_evento,
          corretora_id: e.sga_importacoes?.corretora_id || null,
          corretora_nome: e.sga_importacoes?.corretoras?.nome || null,
        }));
        allData.push(...mapped);
        offset += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }
    return allData;
  };

  const loadData = async () => {
    try {
      setLoading(true);

      let configQuery = supabase
        .from('gestao_associacao_status_config')
        .select('*')
        .eq('ativo', true)
        .order('ordem');

      if (effectiveCorretoraId) {
        configQuery = configQuery.eq('corretora_id', effectiveCorretoraId);
      }

      const { data: configs, error: configError } = await configQuery;
      if (configError) throw configError;
      setAllStatusConfigs((configs || []) as StatusConfig[]);

      if (!configs || configs.length === 0) {
        setEventos([]);
        setLoading(false);
        return;
      }

      const activeStatusNames = configs.map(c => c.nome);
      const mapped = await fetchAllBatched(activeStatusNames);
      setEventos(mapped);

      if (!effectiveCorretoraId) {
        const uniqueCorretoras = new Map<string, string>();
        mapped.forEach(e => {
          if (e.corretora_id && e.corretora_nome) uniqueCorretoras.set(e.corretora_id, e.corretora_nome);
        });
        setCorretoras(Array.from(uniqueCorretoras.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)));
      }
    } catch (error) {
      console.error('Erro ao carregar dados da Gestão Associação:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter status configs by selected fluxo
  const statusConfigs = useMemo(() => {
    if (!selectedFluxoId) return allStatusConfigs;
    return allStatusConfigs.filter(s => s.fluxo_id === selectedFluxoId);
  }, [allStatusConfigs, selectedFluxoId]);

  // Compute card counts per fluxo
  const fluxoCardCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allStatusConfigs.forEach(config => {
      if (config.fluxo_id) {
        const count = eventos.filter(e => e.situacao_evento === config.nome).length;
        counts[config.fluxo_id] = (counts[config.fluxo_id] || 0) + count;
      }
    });
    return counts;
  }, [allStatusConfigs, eventos]);

  const filteredEventos = useMemo(() => {
    return eventos.filter(e => {
      const matchCorretora = filterCorretora === 'all' || e.corretora_id === filterCorretora;
      const matchSearch = !searchTerm ||
        e.protocolo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.placa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.modelo_veiculo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.motivo_evento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.cooperativa?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCorretora && matchSearch;
    });
  }, [eventos, filterCorretora, searchTerm]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try { return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR }); }
    catch { return dateStr; }
  };

  const formatCurrency = (value: number | null) => {
    if (value == null) return '-';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const needsScroll = statusConfigs.length > 4;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando gestão de associações...</p>
        </div>
      </div>
    );
  }

  if (allStatusConfigs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">Nenhum status configurado</p>
        <p className="text-sm mt-1">
          {effectiveCorretoraId
            ? 'Configure os status para esta associação nas configurações.'
            : 'Selecione uma associação e configure os status nas configurações.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Fluxo Selector */}
      {effectiveCorretoraId && (
        <div className="bg-card border-b border-border/50 rounded-lg">
          <GestaoAssociacaoFluxoSelector
            corretoraId={effectiveCorretoraId}
            selectedFluxoId={selectedFluxoId}
            onFluxoSelect={setSelectedFluxoId}
            onConfigureFluxos={onConfigureFluxos}
            cardCounts={fluxoCardCounts}
            refreshKey={fluxoRefreshKey}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar protocolo, placa, modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        {!effectiveCorretoraId && corretoras.length > 1 && (
          <Select value={filterCorretora} onValueChange={setFilterCorretora}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Todas as associações" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as associações</SelectItem>
              {corretoras.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Badge variant="secondary" className="text-xs">
          {filteredEventos.length} evento{filteredEventos.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Kanban Board */}
      {statusConfigs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum status vinculado a este fluxo.</p>
          <p className="text-sm mt-1">Configure os status nas configurações e vincule-os a um fluxo.</p>
        </div>
      ) : (
        <div className="w-full">
          <ScrollArea className={needsScroll ? "w-full" : ""}>
            <div
              className={cn(
                "flex gap-4",
                needsScroll ? 'min-w-max pb-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              )}
              style={needsScroll ? { minWidth: `${statusConfigs.length * 320}px` } : {}}
            >
              {statusConfigs.map((config) => {
                const columnEventos = filteredEventos.filter(e => e.situacao_evento === config.nome);
                return (
                  <div key={config.id} className={cn(needsScroll ? 'w-80 flex-shrink-0' : 'min-w-0')}>
                    <KanbanColumn title={config.nome} count={columnEventos.length} color={config.cor} onDrop={() => {}}>
                      {columnEventos.map((evento) => (
                        <Card key={evento.id} className="shadow-sm hover:shadow-md transition-shadow cursor-default">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-mono font-medium text-primary">{evento.protocolo || 'S/N'}</span>
                              </div>
                              {evento.classificacao && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{evento.classificacao}</Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium truncate">{evento.motivo_evento || 'Sem motivo'}</p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Car className="h-3 w-3" />
                              <span className="truncate">{evento.placa || '-'} {evento.modelo_veiculo ? `• ${evento.modelo_veiculo}` : ''}</span>
                            </div>
                            {(evento.evento_cidade || evento.evento_estado) && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate">{[evento.evento_cidade, evento.evento_estado].filter(Boolean).join(' - ')}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{formatDate(evento.data_cadastro_evento || evento.data_evento)}</span>
                            </div>
                            {(evento.custo_evento || evento.valor_reparo) && (
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <DollarSign className="h-3 w-3" />
                                <span>
                                  {evento.custo_evento ? `Custo: ${formatCurrency(evento.custo_evento)}` : ''}
                                  {evento.custo_evento && evento.valor_reparo ? ' | ' : ''}
                                  {evento.valor_reparo ? `Reparo: ${formatCurrency(evento.valor_reparo)}` : ''}
                                </span>
                              </div>
                            )}
                            {!effectiveCorretoraId && evento.corretora_nome && (
                              <Badge variant="secondary" className="text-[10px]">{evento.corretora_nome}</Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </KanbanColumn>
                  </div>
                );
              })}
            </div>
            {needsScroll && <ScrollBar orientation="horizontal" />}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
