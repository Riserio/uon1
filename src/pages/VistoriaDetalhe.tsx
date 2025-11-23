import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Check, X, Clock, Brain, Camera, FileText, Car, Shield } from "lucide-react";
import { cn, getFileTypeFromUrl, getPosicaoNome } from "@/lib/utils";

export default function VistoriaDetalhes({ vistoria, fotos, termosAceitos }: any) {
  // Estados de controle
  const [fotoDialogOpen, setFotoDialogOpen] = useState(false);
  const [observacaoReprovacao, setObservacaoReprovacao] = useState("");
  const [analiseDialogOpen, setAnaliseDialogOpen] = useState(false);
  const [decisaoAnalise, setDecisaoAnalise] = useState<"aprovar" | "pendenciar">("aprovar");
  const [observacaoAnalise, setObservacaoAnalise] = useState("");
  const [solicitarFotosOpen, setSolicitarFotosOpen] = useState(false);
  const [motivoFotos, setMotivoFotos] = useState("");
  const [novaFotoInput, setNovaFotoInput] = useState("");
  const [fotosNecessarias, setFotosNecessarias] = useState<string[]>([]);

  // Funções utilitárias
  const handleAprovarFoto = (id: number) => { /* lógica */ };
  const handleReprovarFoto = (foto: any) => { /* lógica */ };
  const confirmarReprovacao = () => { /* lógica */ };
  const confirmarAnalise = () => { /* lógica */ };
  const handleSolicitarMaisFotos = () => { /* lógica */ };
  const adicionarFotoNecessaria = () => { /* lógica */ };
  const removerFotoNecessaria = (index: number) => { /* lógica */ };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="fotos" className="space-y-6">

        {/* Tab Fotos */}
        <TabsContent value="fotos" className="space-y-6">
          <Card>
            <CardContent className="p-6">
              {fotos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>
                    {vistoria.status === "aguardando_fotos"
                      ? "As fotos aparecerão aqui assim que forem enviadas pelo cliente."
                      : "Esta vistoria não possui fotos registradas."}
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {fotos.map((foto) => {
                    const fileType = getFileTypeFromUrl(foto.arquivo_url || "");
                    return (
                      <Card
                        key={foto.id}
                        className="overflow-hidden border-2 hover:border-primary/50 transition-all duration-200"
                      >
                        <div className="relative group aspect-[4/3] bg-muted flex items-center justify-center">
                          {/* Badges topo */}
                          <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2 z-10">
                            <Badge variant="secondary" className="bg-black/60 text-white backdrop-blur-sm">
                              {getPosicaoNome(foto.posicao)}
                            </Badge>
                            <Badge
                              className={cn(
                                "backdrop-blur-sm",
                                foto.status_aprovacao === "aprovada"
                                  ? "bg-green-500 hover:bg-green-600"
                                  : foto.status_aprovacao === "reprovada"
                                    ? "bg-red-500 hover:bg-red-600"
                                    : "bg-yellow-500 hover:bg-yellow-600",
                              )}
                            >
                              {foto.status_aprovacao === "aprovada" ? (
                                <>
                                  <Check className="h-3 w-3 mr-1" /> Aprovada
                                </>
                              ) : foto.status_aprovacao === "reprovada" ? (
                                <>
                                  <X className="h-3 w-3 mr-1" /> Reprovada
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3 w-3 mr-1" /> Pendente
                                </>
                              )}
                            </Badge>
                          </div>

                          {/* Conteúdo principal */}
                          {fileType === "image" && (
                            <a href={foto.arquivo_url} target="_blank" rel="noopener noreferrer" className="w-full h-full">
                              <img
                                src={foto.arquivo_url}
                                alt={getPosicaoNome(foto.posicao)}
                                className="w-full h-full object-cover"
                                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                                loading="lazy"
                              />
                            </a>
                          )}

                          {fileType === "video" && (
                            <video src={foto.arquivo_url} controls className="w-full h-full object-cover rounded-none" />
                          )}

                          {fileType === "pdf" && (
                            <div className="flex flex-col items-center justify-center text-center px-4">
                              <FileText className="h-10 w-10 text-primary mb-2" />
                              <p className="text-sm font-medium mb-1">Documento PDF</p>
                              <p className="text-xs text-muted-foreground mb-3">{foto.arquivo_nome}</p>
                              <Button size="sm" variant="outline" asChild>
                                <a href={foto.arquivo_url} target="_blank" rel="noopener noreferrer">
                                  Abrir PDF
                                </a>
                              </Button>
                            </div>
                          )}

                          {fileType === "other" && (
                            <div className="flex flex-col items-center justify-center text-center px-4">
                              <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">Imagem não disponível</p>
                            </div>
                          )}

                          {/* Overlay de ações */}
                          {vistoria.tipo_abertura === "manual" && foto.status_aprovacao === "pendente" && (
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end">
                              <div className="w-full p-3 space-y-2">
                                <p className="text-white text-xs font-medium mb-2">Ações da Foto:</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => handleAprovarFoto(foto.id)}
                                  >
                                    <Check className="h-4 w-4 mr-1" />
                                    Aprovar
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleReprovarFoto(foto)}>
                                    <X className="h-4 w-4 mr-1" />
                                    Reprovar
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <CardContent className="p-4 space-y-3">
                          {foto.aprovada_em && (
                            <div className="text-xs text-muted-foreground">
                              <Clock className="h-3 w-3 inline mr-1" />
                              {format(new Date(foto.aprovada_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          )}

                          {foto.observacao_reprovacao && (
                            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-1">
                              <p className="text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                                <X className="h-3 w-3" /> Motivo da reprovação:
                              </p>
                              <p className="text-xs text-red-700 dark:text-red-300">{foto.observacao_reprovacao}</p>
                            </div>
                          )}

                          {foto.analise_ia && (
                            <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-1">
                              <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
                                <Brain className="h-3 w-3" /> Análise IA:
                              </p>
                              <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                                {typeof foto.analise_ia === "string"
                                  ? foto.analise_ia
                                  : foto.analise_ia.analise || "Análise não disponível"}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
                  {/* Tab: Análise IA */}
          <TabsContent value="ia" className="space-y-6">
            {vistoria.analise_ia || vistoria.observacoes_ia || vistoria.danos_detectados?.length > 0 ? (
              <div className="space-y-6">
                {/* Veículo Detectado */}
                {(vistoria.veiculo_placa || vistoria.veiculo_marca || vistoria.veiculo_modelo) && (
                  <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                    <CardHeader className="bg-blue-100/50 dark:bg-blue-900/20">
                      <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                        <Car className="h-5 w-5" />
                        Veículo Identificado pela IA
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid md:grid-cols-3 gap-4">
                        {vistoria.veiculo_placa && (
                          <div className="bg-white dark:bg-background rounded-lg p-4 border border-blue-200">
                            <span className="text-xs text-muted-foreground block mb-1">Placa</span>
                            <p className="font-bold text-xl tracking-wider">{vistoria.veiculo_placa}</p>
                          </div>
                        )}
                        {vistoria.veiculo_marca && (
                          <div className="bg-white dark:bg-background rounded-lg p-4 border border-blue-200">
                            <span className="text-xs text-muted-foreground block mb-1">Marca</span>
                            <p className="font-semibold text-lg">{vistoria.veiculo_marca}</p>
                          </div>
                        )}
                        {vistoria.veiculo_modelo && (
                          <div className="bg-white dark:bg-background rounded-lg p-4 border border-blue-200">
                            <span className="text-xs text-muted-foreground block mb-1">Modelo</span>
                            <p className="font-semibold text-lg">{vistoria.veiculo_modelo}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Danos Detectados */}
                {vistoria.danos_detectados && vistoria.danos_detectados.length > 0 && (
                  <Card className="border-2 border-red-200 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
                    <CardHeader className="bg-red-100/50 dark:bg-red-900/20">
                      <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <Shield className="h-5 w-5" />
                        Danos Detectados ({vistoria.danos_detectados.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="flex gap-2 flex-wrap">
                        {vistoria.danos_detectados.map((dano: string, index: number) => (
                          <Badge key={index} variant="destructive" className="text-sm px-3 py-1">
                            <X className="h-3 w-3 mr-1" />
                            {dano}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Resumo da Análise */}
                <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                  <CardHeader className="bg-purple-100/50 dark:bg-purple-900/20">
                    <CardTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                      <Brain className="h-6 w-6" />
                      Análise por Inteligência Artificial
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    {vistoria.observacoes_ia && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                          <h4 className="font-semibold text-purple-900 dark:text-purple-300">Resumo Executivo</h4>
                        </div>
                        <div className="bg-white dark:bg-background rounded-lg border-2 border-purple-200 dark:border-purple-800 p-5">
                          <p className="whitespace-pre-wrap text-foreground/80 leading-relaxed">
                            {vistoria.observacoes_ia}
                          </p>
                        </div>
                      </div>
                    )}

                    {vistoria.analise_ia && vistoria.analise_ia.analises && vistoria.analise_ia.analises.length > 0 && (
                      <>
                        {vistoria.observacoes_ia && <Separator className="my-6" />}
                        <div>
                          <div className="flex items-center gap-2 mb-4">
                            <div className="h-1 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                            <h4 className="font-semibold text-purple-900 dark:text-purple-300">
                              Análise Detalhada por Foto
                            </h4>
                          </div>
                          <div className="space-y-4">
                            {vistoria.analise_ia.analises.map((analise: any, index: number) => (
                              <Card
                                key={index}
                                className="bg-white dark:bg-background border-2 border-purple-200/50 hover:border-purple-300 transition-colors"
                              >
                                <CardContent className="p-5">
                                  <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                      <Badge
                                        variant="outline"
                                        className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300"
                                      >
                                        <Camera className="h-3 w-3 mr-1" />
                                        {getPosicaoNome(analise.posicao)}
                                      </Badge>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                      <p className="text-sm text-foreground/70 leading-relaxed">{analise.analise}</p>
                                      {analise.danos_encontrados && analise.danos_encontrados.length > 0 && (
                                        <div className="flex gap-1 flex-wrap mt-2">
                                          {analise.danos_encontrados.map((dano: string, idx: number) => (
                                            <Badge key={idx} variant="secondary" className="text-xs">
                                              {dano}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Metadados da Análise */}
                    {vistoria.analise_ia && (
                      <div className="bg-purple-100/50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 text-xs text-purple-700 dark:text-purple-400">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            Análise gerada automaticamente por IA em{" "}
                            {format(new Date(vistoria.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-2 border-dashed border-muted">
                <CardContent className="p-12 text-center">
                  <div className="rounded-full bg-muted/50 p-6 w-fit mx-auto mb-4">
                    <Brain className="h-12 w-12 text-muted-foreground/50" />
                  </div>
                  <p className="text-lg font-semibold mb-2">Análise de IA não disponível</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    {vistoria.tipo_abertura === "manual"
                      ? "Vistorias manuais não possuem análise automatizada. A análise deve ser feita manualmente pelo time técnico."
                      : "A análise será gerada automaticamente assim que as fotos forem enviadas e processadas pelo sistema."}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Localização */}
          <TabsContent value="localizacao" className="space-y-6">
            {vistoria.latitude && vistoria.longitude ? (
              <Card>
                <CardHeader className="bg-muted/50">
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Geolocalização
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-muted-foreground">Latitude</span>
                      <p className="font-mono">{vistoria.latitude.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Longitude</span>
                      <p className="font-mono">{vistoria.longitude.toFixed(6)}</p>
                    </div>
                  </div>

                  {vistoria.endereco && (
                    <div>
                      <span className="text-sm text-muted-foreground">Endereço</span>
                      <p>{vistoria.endereco}</p>
                    </div>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <iframe
                      src={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}&hl=pt-BR&z=15&output=embed`}
                      className="w-full h-96 rounded-lg border"
                      loading="lazy"
                    />
                    <Button variant="outline" asChild className="w-full">
                      <a
                        href={`https://www.google.com/maps?q=${vistoria.latitude},${vistoria.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Abrir no Google Maps
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Geolocalização não disponível</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Termos */}
          <TabsContent value="termos" className="space-y-6">
            {termosAceitos.length > 0 ? (
              <div className="space-y-4">
                {termosAceitos.map((termo) => (
                  <Card key={termo.id} className="border-2 border-green-200 hover:border-green-300 transition-colors">
                    <CardHeader className="bg-green-50/50">
                      <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-lg">
                          <FileCheck className="h-5 w-5 text-green-600" />
                          {termo.termos.titulo}
                        </div>
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                          <Check className="h-3 w-3 mr-1" />
                          Aceito
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      {termo.termos.descricao && <p className="text-muted-foreground">{termo.termos.descricao}</p>}

                      <Separator />

                      <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold text-sm">Dados do Aceite</h4>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground block mb-1">Data e Hora:</span>
                            <p className="font-medium">
                              {format(new Date(termo.aceito_em), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground block mb-1">Endereço IP:</span>
                            <p className="font-mono text-xs bg-background px-2 py-1 rounded border">
                              {termo.ip_address || "Não disponível"}
                            </p>
                          </div>
                          {termo.user_agent && (
                            <div className="md:col-span-3">
                              <span className="text-muted-foreground block mb-1">Dispositivo:</span>
                              <p className="font-mono text-xs bg-background px-2 py-1 rounded border break-all">
                                {termo.user_agent}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        {termo.termos.arquivo_url && (
                          <Button variant="outline" asChild className="flex-1 gap-2">
                            <a href={termo.termos.arquivo_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4" />
                              Ver Documento
                            </a>
                          </Button>
                        )}
                        {vistoria.assinatura_url && (
                          <Button
                            variant="outline"
                            asChild
                            className="flex-1 gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300"
                          >
                            <a href={vistoria.assinatura_url} target="_blank" rel="noopener noreferrer">
                              <FileCheck className="h-4 w-4" />
                              Ver Assinatura
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                  <p className="text-lg font-medium mb-2">Nenhum termo assinado</p>
                  <p className="text-sm text-muted-foreground">Os termos aceitos aparecerão aqui quando disponíveis</p>

                  {vistoria.assinatura_url && (
                    <div className="mt-6">
                      <Separator className="mb-6" />
                      <Button variant="outline" asChild className="gap-2">
                        <a href={vistoria.assinatura_url} target="_blank" rel="noopener noreferrer">
                          <FileCheck className="h-4 w-4" />
                          Visualizar Assinatura Digital
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab: Questionário */}
          <TabsContent value="questionario" className="space-y-6">
            <Card>
              <CardHeader className="bg-muted/50">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Respostas do Questionário
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {/* Dados do Evento */}
                  {(vistoria.data_evento || vistoria.hora_evento) && (
                    <div>
                      <h4 className="font-semibold mb-2">Data e Hora do Evento</h4>
                      <p className="text-muted-foreground">
                        {vistoria.data_evento && format(new Date(vistoria.data_evento), "dd/MM/yyyy", { locale: ptBR })}
                        {vistoria.hora_evento && ` às ${vistoria.hora_evento}`}
                      </p>
                    </div>
                  )}

                  {vistoria.condutor_veiculo && (
                    <div>
                      <h4 className="font-semibold mb-2">Condutor do Veículo</h4>
                      <p className="text-muted-foreground">{vistoria.condutor_veiculo}</p>
                    </div>
                  )}

                  {vistoria.narrar_fatos && (
                    <div>
                      <h4 className="font-semibold mb-2">Narração dos Fatos</h4>
                      <p className="text-muted-foreground whitespace-pre-wrap">{vistoria.narrar_fatos}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Respostas Sim/Não */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Vítima ou Causador?</h4>
                      <Badge variant={vistoria.vitima_ou_causador === "vitima" ? "destructive" : "secondary"}>
                        {vistoria.vitima_ou_causador === "vitima"
                          ? "Vítima"
                          : vistoria.vitima_ou_causador === "causador"
                            ? "Causador"
                            : "Não informado"}
                      </Badge>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Houve terceiros envolvidos?</h4>
                      <Badge variant={vistoria.tem_terceiros ? "default" : "secondary"}>
                        {vistoria.tem_terceiros ? "Sim" : "Não"}
                      </Badge>
                      {vistoria.tem_terceiros && vistoria.placa_terceiro && (
                        <p className="text-sm text-muted-foreground mt-1">Placa do terceiro: {vistoria.placa_terceiro}</p>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Dialogs */}
          <DialogReprovacao />
          <DialogAnalise />
          <DialogSolicitarFotos />
        </Tabs>
      </div>

