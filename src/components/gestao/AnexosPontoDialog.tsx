import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Upload, Trash2, Download, Calendar, FileCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AnexosPontoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionarioId: string;
  funcionarioNome: string;
}

const tiposAnexo = [
  { value: "folha_ponto", label: "Folha de Ponto", icon: FileText },
  { value: "atestado", label: "Atestado Médico", icon: FileCheck },
  { value: "documento", label: "Outro Documento", icon: FileText },
];

export default function AnexosPontoDialog({
  open,
  onOpenChange,
  funcionarioId,
  funcionarioNome,
}: AnexosPontoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [tipo, setTipo] = useState("atestado");
  const [dataReferencia, setDataReferencia] = useState(format(new Date(), "yyyy-MM-dd"));
  const [tipoAbono, setTipoAbono] = useState<"dia" | "hora">("dia");
  const [diasAbonados, setDiasAbonados] = useState("0");
  const [horasAbonadas, setHorasAbonadas] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Fetch anexos do funcionário
  const { data: anexos, isLoading } = useQuery({
    queryKey: ["anexos_ponto", funcionarioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("anexos_ponto")
        .select("*")
        .eq("funcionario_id", funcionarioId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!funcionarioId,
  });

  const uploadAnexo = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo");

      setUploading(true);

      // Upload do arquivo
      const fileExt = file.name.split(".").pop();
      const filePath = `${funcionarioId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("ponto-documentos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from("ponto-documentos")
        .getPublicUrl(filePath);

      // Inserir registro no banco
      const { error: insertError } = await (supabase as any)
        .from("anexos_ponto")
        .insert({
          funcionario_id: funcionarioId,
          tipo,
          arquivo_url: urlData.publicUrl,
          arquivo_nome: file.name,
          data_referencia: dataReferencia,
          dias_abonados: tipo === "atestado" && tipoAbono === "dia" ? parseInt(diasAbonados) || 0 : 0,
          horas_abonadas: tipo === "atestado" && tipoAbono === "hora" ? parseFloat(horasAbonadas) || 0 : 0,
          observacao,
          uploaded_by: user?.id,
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anexos_ponto"] });
      queryClient.invalidateQueries({ queryKey: ["abonados"] });
      queryClient.invalidateQueries({ queryKey: ["analise_registros"] });
      toast.success("Anexo enviado com sucesso!");
      // Reset form
      setFile(null);
      setObservacao("");
      setDiasAbonados("0");
      setHorasAbonadas("0");
    },
    onError: (error) => {
      toast.error("Erro ao enviar anexo: " + error.message);
    },
    onSettled: () => {
      setUploading(false);
    },
  });

  const deleteAnexo = useMutation({
    mutationFn: async (anexoId: string) => {
      const { error } = await supabase
        .from("anexos_ponto")
        .delete()
        .eq("id", anexoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anexos_ponto"] });
      toast.success("Anexo removido!");
    },
    onError: (error) => {
      toast.error("Erro ao remover: " + error.message);
    },
  });

  const getTipoConfig = (tipoValue: string) => {
    return tiposAnexo.find((t) => t.value === tipoValue) || tiposAnexo[2];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Anexos de Ponto - {funcionarioNome}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Enviar Anexo</TabsTrigger>
            <TabsTrigger value="historico">Histórico ({anexos?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Tipo de Documento</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiposAnexo.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de Referência</Label>
                <Input
                  type="date"
                  value={dataReferencia}
                  onChange={(e) => setDataReferencia(e.target.value)}
                />
              </div>
              {tipo === "atestado" && (
                <div className="space-y-2">
                  <Label>{tipoAbono === "dia" ? "Dias Abonados" : "Horas Abonadas"}</Label>
                  {tipoAbono === "dia" ? (
                    <Input
                      type="number"
                      min="0"
                      value={diasAbonados}
                      onChange={(e) => setDiasAbonados(e.target.value)}
                    />
                  ) : (
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={horasAbonadas}
                      onChange={(e) => setHorasAbonadas(e.target.value)}
                      placeholder="Ex.: 1.5"
                    />
                  )}
                </div>
              )}
            </div>

            {tipo === "atestado" && (
              <RadioGroup
                value={tipoAbono}
                onValueChange={(v) => setTipoAbono(v as "dia" | "hora")}
                className="grid grid-cols-2 gap-2"
              >
                <Label
                  htmlFor="anexo-abono-dia"
                  className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                    tipoAbono === "dia" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <RadioGroupItem value="dia" id="anexo-abono-dia" />
                  <span className="text-sm">Abonar dias</span>
                </Label>
                <Label
                  htmlFor="anexo-abono-hora"
                  className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition ${
                    tipoAbono === "hora" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <RadioGroupItem value="hora" id="anexo-abono-hora" />
                  <span className="text-sm">Abonar horas</span>
                </Label>
              </RadioGroup>
            )}

            <div className="space-y-2">
              <Label>Arquivo</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="flex-1"
                />
              </div>
              {file && (
                <p className="text-sm text-muted-foreground">
                  Arquivo selecionado: {file.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observações adicionais..."
                rows={2}
              />
            </div>

            <Button
              onClick={() => uploadAnexo.mutate()}
              disabled={!file || uploading}
              className="w-full"
            >
              {uploading ? (
                "Enviando..."
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar Anexo
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : !anexos?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum anexo encontrado
              </div>
            ) : (
              <div className="space-y-3">
                {anexos.map((anexo: any) => {
                  const tipoConfig = getTipoConfig(anexo.tipo);
                  const Icon = tipoConfig.icon;
                  return (
                    <div
                      key={anexo.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{anexo.arquivo_nome}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                              {tipoConfig.label}
                            </Badge>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {anexo.data_referencia
                                ? format(new Date(anexo.data_referencia), "dd/MM/yyyy")
                                : "Sem data"}
                            </span>
                            {anexo.tipo === "atestado" && anexo.dias_abonados > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {anexo.dias_abonados} dia(s) abonados
                              </Badge>
                            )}
                            {anexo.tipo === "atestado" && anexo.horas_abonadas > 0 && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Clock className="h-3 w-3" />
                                {anexo.horas_abonadas}h abonadas
                              </Badge>
                            )}
                          </div>
                          {anexo.observacao && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {anexo.observacao}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(anexo.arquivo_url, "_blank")}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Remover este anexo?")) {
                              deleteAnexo.mutate(anexo.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
