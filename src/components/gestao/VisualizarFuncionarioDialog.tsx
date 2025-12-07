import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  Clock,
  CreditCard,
} from "lucide-react";

interface VisualizarFuncionarioDialogProps {
  funcionario: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VisualizarFuncionarioDialog({
  funcionario,
  open,
  onOpenChange,
}: VisualizarFuncionarioDialogProps) {
  const endereco = funcionario.endereco || {};
  const dadosBancarios = funcionario.dados_bancarios || {};

  // Fetch registros de ponto do mês atual
  const { data: registrosPonto } = useQuery({
    queryKey: ["registros_ponto", funcionario.id],
    queryFn: async () => {
      const inicio = startOfMonth(new Date()).toISOString();
      const fim = endOfMonth(new Date()).toISOString();

      const { data, error } = await supabase
        .from("registros_ponto")
        .select("*")
        .eq("funcionario_id", funcionario.id)
        .gte("data_hora", inicio)
        .lte("data_hora", fim)
        .order("data_hora", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={funcionario.foto_url} />
              <AvatarFallback className="text-xl">
                {funcionario.nome?.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-xl">{funcionario.nome}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                {funcionario.cargo && <span>{funcionario.cargo}</span>}
                {funcionario.departamento && (
                  <>
                    <span>•</span>
                    <span>{funcionario.departamento}</span>
                  </>
                )}
              </DialogDescription>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline">{funcionario.tipo_contrato}</Badge>
                {funcionario.data_admissao && (
                  <Badge variant="secondary">
                    Desde {format(new Date(funcionario.data_admissao), "MMM/yyyy", { locale: ptBR })}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="jornada">Jornada</TabsTrigger>
            <TabsTrigger value="ponto">Registros de Ponto</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-4 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {/* Contato */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Contato
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {funcionario.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{funcionario.email}</span>
                    </div>
                  )}
                  {funcionario.telefone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{funcionario.telefone}</span>
                    </div>
                  )}
                  {funcionario.cpf && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>CPF: {funcionario.cpf}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Endereço */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Endereço
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {endereco.rua ? (
                    <p>
                      {endereco.rua}, {endereco.numero}
                      <br />
                      {endereco.bairro} - {endereco.cidade}/{endereco.estado}
                      <br />
                      CEP: {endereco.cep}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Não informado</p>
                  )}
                </CardContent>
              </Card>

              {/* Dados Profissionais */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Profissional
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Tipo de Contrato:</span>
                    <span className="ml-2">{funcionario.tipo_contrato}</span>
                  </div>
                  {funcionario.data_admissao && (
                    <div>
                      <span className="text-muted-foreground">Admissão:</span>
                      <span className="ml-2">
                        {format(new Date(funcionario.data_admissao), "dd/MM/yyyy")}
                      </span>
                    </div>
                  )}
                  {funcionario.salario && (
                    <div>
                      <span className="text-muted-foreground">Salário:</span>
                      <span className="ml-2">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(funcionario.salario)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Dados Bancários */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Dados Bancários
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  {dadosBancarios.banco ? (
                    <div className="space-y-1">
                      <p>Banco: {dadosBancarios.banco}</p>
                      <p>Agência: {dadosBancarios.agencia}</p>
                      <p>Conta: {dadosBancarios.conta}</p>
                      {dadosBancarios.pix && <p>PIX: {dadosBancarios.pix}</p>}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Não informado</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="jornada" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Configuração de Jornada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Carga Horária</span>
                    <p className="font-medium">{funcionario.carga_horaria_semanal}h/semana</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Entrada</span>
                    <p className="font-medium">{funcionario.horario_entrada}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Saída</span>
                    <p className="font-medium">{funcionario.horario_saida}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Almoço</span>
                    <p className="font-medium">
                      {funcionario.horario_almoco_inicio} - {funcionario.horario_almoco_fim}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ponto" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Registros de Ponto - {format(new Date(), "MMMM yyyy", { locale: ptBR })}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {registrosPonto?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum registro de ponto neste mês
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {registrosPonto?.map((registro: any) => (
                      <div
                        key={registro.id}
                        className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {registro.tipo.replace("_", " ")}
                          </Badge>
                          <span>
                            {format(new Date(registro.data_hora), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {registro.endereco_aproximado && (
                          <span className="text-muted-foreground text-xs">
                            {registro.endereco_aproximado}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
