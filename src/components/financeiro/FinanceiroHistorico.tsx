import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  History, 
  Search,
  Plus,
  Pencil,
  CheckCircle,
  XCircle,
  CreditCard,
  Link2,
  Trash2,
  User,
  Calendar
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  corretoraId: string;
}

const acaoConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  criacao: { label: "Criação", icon: <Plus className="h-4 w-4" />, color: "bg-green-500" },
  edicao: { label: "Edição", icon: <Pencil className="h-4 w-4" />, color: "bg-blue-500" },
  aprovacao: { label: "Aprovação", icon: <CheckCircle className="h-4 w-4" />, color: "bg-emerald-500" },
  rejeicao: { label: "Rejeição", icon: <XCircle className="h-4 w-4" />, color: "bg-red-500" },
  pagamento: { label: "Pagamento", icon: <CreditCard className="h-4 w-4" />, color: "bg-purple-500" },
  conciliacao: { label: "Conciliação", icon: <Link2 className="h-4 w-4" />, color: "bg-cyan-500" },
  exclusao: { label: "Exclusão", icon: <Trash2 className="h-4 w-4" />, color: "bg-gray-500" },
};

export default function FinanceiroHistorico({ corretoraId }: Props) {
  const [historico, setHistorico] = useState<any[]>([]);
  const [filteredHistorico, setFilteredHistorico] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [acaoFilter, setAcaoFilter] = useState("todas");

  useEffect(() => {
    fetchHistorico();
  }, [corretoraId]);

  useEffect(() => {
    filterHistorico();
  }, [historico, searchTerm, acaoFilter]);

  const fetchHistorico = async () => {
    setLoading(true);
    
    // Buscar histórico com dados do lançamento
    let query = supabase
      .from("lancamentos_financeiros_historico")
      .select(`
        *,
        lancamentos_financeiros!lancamentos_financeiros_historico_lancamento_id_fkey (
          numero_lancamento,
          descricao,
          corretora_id
        )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    const { data, error } = await query;

    if (!error && data) {
      // Filtrar por corretora
      const filtered = data.filter(h => {
        if (corretoraId === "administradora") {
          return !h.lancamentos_financeiros?.corretora_id;
        }
        return h.lancamentos_financeiros?.corretora_id === corretoraId;
      });
      setHistorico(filtered);
    }
    setLoading(false);
  };

  const filterHistorico = () => {
    let filtered = historico;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(h => 
        h.user_nome?.toLowerCase().includes(term) ||
        h.lancamentos_financeiros?.descricao?.toLowerCase().includes(term) ||
        h.lancamentos_financeiros?.numero_lancamento?.toLowerCase().includes(term) ||
        h.campo_alterado?.toLowerCase().includes(term)
      );
    }

    if (acaoFilter !== "todas") {
      filtered = filtered.filter(h => h.acao === acaoFilter);
    }

    setFilteredHistorico(filtered);
  };

  const getAcaoDisplay = (acao: string) => {
    const config = acaoConfig[acao] || { 
      label: acao, 
      icon: <History className="h-4 w-4" />, 
      color: "bg-gray-500" 
    };
    return config;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <History className="h-8 w-8 animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuário, lançamento, descrição..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={acaoFilter} onValueChange={setAcaoFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as ações</SelectItem>
                  <SelectItem value="criacao">Criação</SelectItem>
                  <SelectItem value="edicao">Edição</SelectItem>
                  <SelectItem value="aprovacao">Aprovação</SelectItem>
                  <SelectItem value="rejeicao">Rejeição</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                  <SelectItem value="conciliacao">Conciliação</SelectItem>
                  <SelectItem value="exclusao">Exclusão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-primary" />
            Histórico de Alterações
            <Badge variant="secondary" className="ml-2">
              {filteredHistorico.length} registros
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] pr-4">
            {filteredHistorico.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum registro de histórico encontrado</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                
                <div className="space-y-4">
                  {filteredHistorico.map((item, index) => {
                    const acaoDisplay = getAcaoDisplay(item.acao);
                    
                    return (
                      <div key={item.id} className="relative pl-10">
                        {/* Timeline dot */}
                        <div className={`absolute left-2 top-2 w-5 h-5 rounded-full ${acaoDisplay.color} flex items-center justify-center text-white`}>
                          {acaoDisplay.icon}
                        </div>
                        
                        <div className="bg-muted/50 rounded-lg p-4 hover:bg-muted transition-colors">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-medium">
                                {acaoDisplay.label}
                              </Badge>
                              {item.lancamentos_financeiros?.numero_lancamento && (
                                <span className="text-sm font-mono text-muted-foreground">
                                  {item.lancamentos_financeiros.numero_lancamento}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(item.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{item.user_nome}</span>
                          </div>

                          {item.lancamentos_financeiros?.descricao && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {item.lancamentos_financeiros.descricao}
                            </p>
                          )}

                          {item.campo_alterado && (
                            <div className="bg-background rounded p-2 text-sm">
                              <span className="font-medium">{item.campo_alterado}: </span>
                              {item.valor_anterior && (
                                <span className="text-red-500 line-through mr-2">
                                  {item.valor_anterior}
                                </span>
                              )}
                              {item.valor_novo && (
                                <span className="text-green-600">
                                  {item.valor_novo}
                                </span>
                              )}
                            </div>
                          )}

                          {item.dados_completos && (
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                Ver dados completos
                              </summary>
                              <pre className="mt-2 text-xs bg-background p-2 rounded overflow-auto max-h-32">
                                {JSON.stringify(item.dados_completos, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
