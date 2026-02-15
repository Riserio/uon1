import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Car, Calendar, MapPin, DollarSign, FileText, User, Building2, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  corretora_nome: string | null;
  categoria_veiculo: string | null;
  participacao: number | null;
  valor_mao_de_obra: number | null;
  previsao_valor_reparo: number | null;
  analista_responsavel: string | null;
  ultima_descricao_interna: string | null;
  data_ultima_descricao_interna: string | null;
  numero_bo: string | null;
  ultima_descricao_bo: string | null;
  envolvimento: string | null;
  usuario_alteracao: string | null;
}

interface EventoDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evento: EventoCard | null;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try { return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return dateStr; }
};

const formatCurrency = (value: number | null) => {
  if (value == null) return "-";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export function EventoDetailDialog({ open, onOpenChange, evento }: EventoDetailDialogProps) {
  if (!evento) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Detalhes do Evento - {evento.protocolo || "S/N"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identificação */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Identificação</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Protocolo:</span>
                <span className="ml-2 font-medium">{evento.protocolo || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Situação:</span>
                <Badge variant="outline" className="ml-2">{evento.situacao_evento || "-"}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Assunto (Placa):</span>
                <Badge className="ml-2 font-mono">{evento.placa || "-"}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Tipo Sinistro:</span>
                <span className="ml-2 font-medium">{evento.motivo_evento || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Envolvimento:</span>
                <span className="ml-2 font-medium">{evento.envolvimento || evento.tipo_evento || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Classificação:</span>
                <span className="ml-2 font-medium">{evento.classificacao || "-"}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Responsável e Descrição */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Acompanhamento</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Responsável:</span>
                <span className="font-medium">{evento.analista_responsavel || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Observações (Última descrição interna):</span>
                <p className="mt-1 text-foreground bg-muted/50 rounded p-2 text-xs">
                  {evento.ultima_descricao_interna || "Sem descrição"}
                </p>
                {evento.data_ultima_descricao_interna && (
                  <span className="text-xs text-muted-foreground">
                    Atualizado em: {formatDate(evento.data_ultima_descricao_interna)}
                    {evento.usuario_alteracao && ` por ${evento.usuario_alteracao}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Datas e Local */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Evento</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Data Incidente:</span>
                <span className="font-medium">{formatDate(evento.data_evento)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Data Cadastro:</span>
                <span className="font-medium">{formatDate(evento.data_cadastro_evento)}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Local:</span>
                <span className="font-medium">{[evento.evento_cidade, evento.evento_estado].filter(Boolean).join(" - ") || "-"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Cooperativa:</span>
                <span className="font-medium">{evento.cooperativa || "-"}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* COF e Relato BO */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Boletim de Ocorrência</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">COF (Nº BO):</span>
                <span className="ml-2 font-medium">{evento.numero_bo || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Relato do Incidente:</span>
                <p className="mt-1 text-foreground bg-muted/50 rounded p-2 text-xs">
                  {evento.ultima_descricao_bo || "Sem relato"}
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Veículo */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Veículo</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Placa:</span>
                <Badge variant="outline" className="font-mono">{evento.placa || "-"}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Modelo:</span>
                <span className="ml-2 font-medium">{evento.modelo_veiculo || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Tipo Veículo:</span>
                <span className="ml-2 font-medium">{evento.categoria_veiculo || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Valor Protegido:</span>
                <span className="ml-2 font-medium">{formatCurrency(evento.valor_protegido_veiculo)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Financeiro */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Financeiro
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-muted/30 rounded">
                <span className="text-muted-foreground text-xs">Previsão Valor Reparo</span>
                <p className="font-semibold">{formatCurrency(evento.previsao_valor_reparo)}</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <span className="text-muted-foreground text-xs">Valor Mão de Obra</span>
                <p className="font-semibold">{formatCurrency(evento.valor_mao_de_obra)}</p>
              </div>
              <div className="p-2 bg-muted/30 rounded">
                <span className="text-muted-foreground text-xs">Participação</span>
                <p className="font-semibold">{formatCurrency(evento.participacao)}</p>
              </div>
              <div className="p-2 bg-primary/10 rounded">
                <span className="text-muted-foreground text-xs">Valor Reparo</span>
                <p className="font-semibold text-primary">{formatCurrency(evento.valor_reparo)}</p>
              </div>
              <div className="p-2 bg-destructive/10 rounded">
                <span className="text-muted-foreground text-xs">Custo Evento</span>
                <p className="font-semibold text-destructive">{formatCurrency(evento.custo_evento)}</p>
              </div>
            </div>
          </div>

          {/* Associação */}
          {evento.corretora_nome && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Associação</h4>
                <div className="text-sm">
                  <span className="text-muted-foreground">Associação:</span>
                  <span className="ml-2 font-medium">{evento.corretora_nome}</span>
                </div>
                <div className="text-sm mt-1">
                  <span className="text-muted-foreground">Regional:</span>
                  <span className="ml-2 font-medium">{evento.regional || "-"}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
