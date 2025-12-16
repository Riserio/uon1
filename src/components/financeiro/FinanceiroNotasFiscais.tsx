import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Search,
  FileText,
  Eye,
  Pencil,
  Trash2,
  Download,
  Upload,
  Building2,
  User,
  Calculator,
  AlertCircle,
  CheckCircle,
  XCircle,
  Send,
  Loader2,
  FileUp
} from "lucide-react";
import { CurrencyInput } from "@/components/ui/currency-input";

interface NotaFiscal {
  id: string;
  numero: string;
  serie: string;
  tipo: string;
  natureza_operacao: string;
  data_emissao: string;
  data_competencia: string | null;
  prestador_cnpj: string | null;
  prestador_razao_social: string | null;
  prestador_nome_fantasia: string | null;
  prestador_endereco: string | null;
  prestador_cidade: string;
  prestador_uf: string;
  prestador_cep: string | null;
  prestador_inscricao_municipal: string | null;
  tomador_cpf_cnpj: string | null;
  tomador_razao_social: string | null;
  tomador_nome_fantasia: string | null;
  tomador_email: string | null;
  tomador_telefone: string | null;
  tomador_endereco: string | null;
  tomador_cidade: string | null;
  tomador_uf: string | null;
  tomador_cep: string | null;
  valor_servicos: number;
  valor_deducoes: number;
  valor_pis: number;
  valor_cofins: number;
  valor_inss: number;
  valor_ir: number;
  valor_csll: number;
  valor_iss: number;
  aliquota_iss: number;
  valor_liquido: number;
  codigo_servico: string | null;
  discriminacao: string | null;
  status: string;
  codigo_verificacao: string | null;
  arquivo_url: string | null;
  created_at: string;
}

interface Props {
  corretoraId: string;
}

const statusColors: Record<string, string> = {
  rascunho: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  emitida: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelada: "bg-red-500/10 text-red-600 border-red-500/20",
  enviada_prefeitura: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  emitida: "Emitida",
  cancelada: "Cancelada",
  enviada_prefeitura: "Enviada à Prefeitura",
};

export default function FinanceiroNotasFiscais({ corretoraId }: Props) {
  const { user } = useAuth();
  const [notas, setNotas] = useState<NotaFiscal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedNota, setSelectedNota] = useState<NotaFiscal | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("prestador");
  const [uploadingFile, setUploadingFile] = useState(false);

  const [formData, setFormData] = useState({
    numero: "",
    serie: "1",
    tipo: "servico",
    natureza_operacao: "Prestação de Serviços",
    data_emissao: format(new Date(), "yyyy-MM-dd"),
    data_competencia: format(new Date(), "yyyy-MM-dd"),
    prestador_cnpj: "",
    prestador_razao_social: "",
    prestador_nome_fantasia: "",
    prestador_endereco: "",
    prestador_cidade: "Belo Horizonte",
    prestador_uf: "MG",
    prestador_cep: "",
    prestador_inscricao_municipal: "",
    tomador_cpf_cnpj: "",
    tomador_razao_social: "",
    tomador_nome_fantasia: "",
    tomador_email: "",
    tomador_telefone: "",
    tomador_endereco: "",
    tomador_cidade: "",
    tomador_uf: "",
    tomador_cep: "",
    valor_servicos: 0,
    valor_deducoes: 0,
    valor_pis: 0,
    valor_cofins: 0,
    valor_inss: 0,
    valor_ir: 0,
    valor_csll: 0,
    aliquota_iss: 5,
    codigo_servico: "",
    discriminacao: "",
    status: "emitida",
    arquivo_url: "",
  });

  useEffect(() => {
    fetchNotas();
  }, [corretoraId]);

  const fetchNotas = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("notas_fiscais")
        .select("*")
        .order("data_emissao", { ascending: false });

      if (corretoraId === "administradora") {
        query = query.is("corretora_id", null);
      } else {
        query = query.eq("corretora_id", corretoraId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setNotas((data as NotaFiscal[]) || []);
    } catch (error) {
      console.error("Erro ao buscar notas:", error);
      toast.error("Erro ao carregar notas fiscais");
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    const valorServicos = formData.valor_servicos || 0;
    const valorDeducoes = formData.valor_deducoes || 0;
    const baseCalculo = valorServicos - valorDeducoes;
    
    const valorIss = baseCalculo * (formData.aliquota_iss / 100);
    const totalDeducoes = 
      (formData.valor_pis || 0) +
      (formData.valor_cofins || 0) +
      (formData.valor_inss || 0) +
      (formData.valor_ir || 0) +
      (formData.valor_csll || 0) +
      valorIss;
    
    const valorLiquido = valorServicos - totalDeducoes;
    
    return { valorIss, valorLiquido };
  };

  const handleSubmit = async () => {
    if (!formData.numero || !formData.valor_servicos) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    setSaving(true);
    try {
      const { valorIss, valorLiquido } = calculateTotals();
      
      const notaData = {
        ...formData,
        valor_iss: valorIss,
        valor_liquido: valorLiquido,
        corretora_id: corretoraId === "administradora" ? null : corretoraId,
        created_by: user?.id,
      };

      if (selectedNota) {
        const { error } = await supabase
          .from("notas_fiscais")
          .update(notaData)
          .eq("id", selectedNota.id);

        if (error) throw error;
        toast.success("Nota fiscal atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("notas_fiscais")
          .insert([notaData]);

        if (error) throw error;
        toast.success("Nota fiscal criada com sucesso!");
      }

      setDialogOpen(false);
      resetForm();
      fetchNotas();
    } catch (error: any) {
      console.error("Erro ao salvar nota:", error);
      toast.error(error.message || "Erro ao salvar nota fiscal");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (nota: NotaFiscal) => {
    if (!confirm("Tem certeza que deseja excluir esta nota fiscal?")) return;

    try {
      const { error } = await supabase
        .from("notas_fiscais")
        .delete()
        .eq("id", nota.id);

      if (error) throw error;
      toast.success("Nota fiscal excluída!");
      fetchNotas();
    } catch (error) {
      console.error("Erro ao excluir nota:", error);
      toast.error("Erro ao excluir nota fiscal");
    }
  };

  const handleCancel = async (nota: NotaFiscal) => {
    const motivo = prompt("Informe o motivo do cancelamento:");
    if (!motivo) return;

    try {
      const { error } = await supabase
        .from("notas_fiscais")
        .update({
          status: "cancelada",
          cancelada_em: new Date().toISOString(),
          cancelada_por: user?.id,
          motivo_cancelamento: motivo,
        })
        .eq("id", nota.id);

      if (error) throw error;
      toast.success("Nota fiscal cancelada!");
      fetchNotas();
    } catch (error) {
      console.error("Erro ao cancelar nota:", error);
      toast.error("Erro ao cancelar nota fiscal");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
      const filePath = `notas-fiscais/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("documentos")
        .getPublicUrl(filePath);

      setFormData({ ...formData, arquivo_url: urlData.publicUrl });
      toast.success("Arquivo enviado com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar arquivo:", error);
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploadingFile(false);
    }
  };

  const resetForm = () => {
    setFormData({
      numero: "",
      serie: "1",
      tipo: "servico",
      natureza_operacao: "Prestação de Serviços",
      data_emissao: format(new Date(), "yyyy-MM-dd"),
      data_competencia: format(new Date(), "yyyy-MM-dd"),
      prestador_cnpj: "",
      prestador_razao_social: "",
      prestador_nome_fantasia: "",
      prestador_endereco: "",
      prestador_cidade: "Belo Horizonte",
      prestador_uf: "MG",
      prestador_cep: "",
      prestador_inscricao_municipal: "",
      tomador_cpf_cnpj: "",
      tomador_razao_social: "",
      tomador_nome_fantasia: "",
      tomador_email: "",
      tomador_telefone: "",
      tomador_endereco: "",
      tomador_cidade: "",
      tomador_uf: "",
      tomador_cep: "",
      valor_servicos: 0,
      valor_deducoes: 0,
      valor_pis: 0,
      valor_cofins: 0,
      valor_inss: 0,
      valor_ir: 0,
      valor_csll: 0,
      aliquota_iss: 5,
      codigo_servico: "",
      discriminacao: "",
      status: "emitida",
      arquivo_url: "",
    });
    setSelectedNota(null);
    setActiveTab("prestador");
  };

  const openEditDialog = (nota: NotaFiscal) => {
    setSelectedNota(nota);
    setFormData({
      numero: nota.numero,
      serie: nota.serie,
      tipo: nota.tipo,
      natureza_operacao: nota.natureza_operacao,
      data_emissao: nota.data_emissao,
      data_competencia: nota.data_competencia || "",
      prestador_cnpj: nota.prestador_cnpj || "",
      prestador_razao_social: nota.prestador_razao_social || "",
      prestador_nome_fantasia: nota.prestador_nome_fantasia || "",
      prestador_endereco: nota.prestador_endereco || "",
      prestador_cidade: nota.prestador_cidade,
      prestador_uf: nota.prestador_uf,
      prestador_cep: nota.prestador_cep || "",
      prestador_inscricao_municipal: nota.prestador_inscricao_municipal || "",
      tomador_cpf_cnpj: nota.tomador_cpf_cnpj || "",
      tomador_razao_social: nota.tomador_razao_social || "",
      tomador_nome_fantasia: nota.tomador_nome_fantasia || "",
      tomador_email: nota.tomador_email || "",
      tomador_telefone: nota.tomador_telefone || "",
      tomador_endereco: nota.tomador_endereco || "",
      tomador_cidade: nota.tomador_cidade || "",
      tomador_uf: nota.tomador_uf || "",
      tomador_cep: nota.tomador_cep || "",
      valor_servicos: nota.valor_servicos,
      valor_deducoes: nota.valor_deducoes,
      valor_pis: nota.valor_pis,
      valor_cofins: nota.valor_cofins,
      valor_inss: nota.valor_inss,
      valor_ir: nota.valor_ir,
      valor_csll: nota.valor_csll,
      aliquota_iss: nota.aliquota_iss,
      codigo_servico: nota.codigo_servico || "",
      discriminacao: nota.discriminacao || "",
      status: nota.status,
      arquivo_url: nota.arquivo_url || "",
    });
    setDialogOpen(true);
  };

  const filteredNotas = notas.filter((nota) => {
    const matchesSearch =
      nota.numero.toLowerCase().includes(search.toLowerCase()) ||
      nota.tomador_razao_social?.toLowerCase().includes(search.toLowerCase()) ||
      nota.tomador_cpf_cnpj?.includes(search);

    const matchesStatus = statusFilter === "todos" || nota.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const { valorIss, valorLiquido } = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-600" />
                Notas Fiscais de Serviço
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Gerencie suas notas fiscais. Integração com a prefeitura de Belo Horizonte em breve.
              </p>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setDialogOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Nova Nota Fiscal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, cliente ou CPF/CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="rascunho">Rascunho</SelectItem>
            <SelectItem value="emitida">Emitida</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="enviada_prefeitura">Enviada à Prefeitura</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNotas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma nota fiscal encontrada</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar primeira nota
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Data Emissão</TableHead>
                  <TableHead>Tomador</TableHead>
                  <TableHead>Valor Serviços</TableHead>
                  <TableHead>Valor Líquido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotas.map((nota) => (
                  <TableRow key={nota.id}>
                    <TableCell className="font-medium">{nota.numero}</TableCell>
                    <TableCell>
                      {format(parseISO(nota.data_emissao), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{nota.tomador_razao_social || "-"}</p>
                        <p className="text-xs text-muted-foreground">{nota.tomador_cpf_cnpj}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(nota.valor_servicos)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(nota.valor_liquido)}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[nota.status]}>
                        {statusLabels[nota.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedNota(nota);
                            setViewDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {nota.status !== "cancelada" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(nota)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCancel(nota)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(nota)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedNota ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="prestador" className="gap-2">
                <Building2 className="h-4 w-4" />
                Prestador
              </TabsTrigger>
              <TabsTrigger value="tomador" className="gap-2">
                <User className="h-4 w-4" />
                Tomador
              </TabsTrigger>
              <TabsTrigger value="servico" className="gap-2">
                <FileText className="h-4 w-4" />
                Serviço
              </TabsTrigger>
              <TabsTrigger value="valores" className="gap-2">
                <Calculator className="h-4 w-4" />
                Valores
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prestador" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Número da NF *</Label>
                  <Input
                    value={formData.numero}
                    onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    placeholder="Ex: 000001"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Série</Label>
                  <Input
                    value={formData.serie}
                    onChange={(e) => setFormData({ ...formData, serie: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Emissão</Label>
                  <Input
                    type="date"
                    value={formData.data_emissao}
                    onChange={(e) => setFormData({ ...formData, data_emissao: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Data de Competência</Label>
                  <Input
                    type="date"
                    value={formData.data_competencia}
                    onChange={(e) => setFormData({ ...formData, data_competencia: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>CNPJ do Prestador</Label>
                <Input
                  value={formData.prestador_cnpj}
                  onChange={(e) => setFormData({ ...formData, prestador_cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Razão Social</Label>
                  <Input
                    value={formData.prestador_razao_social}
                    onChange={(e) => setFormData({ ...formData, prestador_razao_social: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome Fantasia</Label>
                  <Input
                    value={formData.prestador_nome_fantasia}
                    onChange={(e) => setFormData({ ...formData, prestador_nome_fantasia: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Inscrição Municipal</Label>
                <Input
                  value={formData.prestador_inscricao_municipal}
                  onChange={(e) => setFormData({ ...formData, prestador_inscricao_municipal: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input
                  value={formData.prestador_endereco}
                  onChange={(e) => setFormData({ ...formData, prestador_endereco: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={formData.prestador_cidade}
                    onChange={(e) => setFormData({ ...formData, prestador_cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input
                    value={formData.prestador_uf}
                    onChange={(e) => setFormData({ ...formData, prestador_uf: e.target.value })}
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={formData.prestador_cep}
                    onChange={(e) => setFormData({ ...formData, prestador_cep: e.target.value })}
                    placeholder="00000-000"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tomador" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>CPF/CNPJ do Tomador</Label>
                <Input
                  value={formData.tomador_cpf_cnpj}
                  onChange={(e) => setFormData({ ...formData, tomador_cpf_cnpj: e.target.value })}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Razão Social / Nome</Label>
                  <Input
                    value={formData.tomador_razao_social}
                    onChange={(e) => setFormData({ ...formData, tomador_razao_social: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome Fantasia</Label>
                  <Input
                    value={formData.tomador_nome_fantasia}
                    onChange={(e) => setFormData({ ...formData, tomador_nome_fantasia: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={formData.tomador_email}
                    onChange={(e) => setFormData({ ...formData, tomador_email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={formData.tomador_telefone}
                    onChange={(e) => setFormData({ ...formData, tomador_telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input
                  value={formData.tomador_endereco}
                  onChange={(e) => setFormData({ ...formData, tomador_endereco: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={formData.tomador_cidade}
                    onChange={(e) => setFormData({ ...formData, tomador_cidade: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input
                    value={formData.tomador_uf}
                    onChange={(e) => setFormData({ ...formData, tomador_uf: e.target.value })}
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={formData.tomador_cep}
                    onChange={(e) => setFormData({ ...formData, tomador_cep: e.target.value })}
                    placeholder="00000-000"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="servico" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Natureza da Operação</Label>
                <Input
                  value={formData.natureza_operacao}
                  onChange={(e) => setFormData({ ...formData, natureza_operacao: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Código do Serviço (LC 116)</Label>
                <Input
                  value={formData.codigo_servico}
                  onChange={(e) => setFormData({ ...formData, codigo_servico: e.target.value })}
                  placeholder="Ex: 17.01"
                />
              </div>

              <div className="space-y-2">
                <Label>Discriminação dos Serviços</Label>
                <Textarea
                  value={formData.discriminacao}
                  onChange={(e) => setFormData({ ...formData, discriminacao: e.target.value })}
                  rows={6}
                  placeholder="Descreva detalhadamente os serviços prestados..."
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="emitida">Emitida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Anexar PDF/XML da Nota</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.xml"
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="flex-1"
                  />
                  {uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                {formData.arquivo_url && (
                  <a
                    href={formData.arquivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <FileUp className="h-4 w-4" />
                    Ver arquivo anexado
                  </a>
                )}
              </div>
            </TabsContent>

            <TabsContent value="valores" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor dos Serviços *</Label>
                  <CurrencyInput
                    value={formData.valor_servicos}
                    onValueChange={(values) => setFormData({ ...formData, valor_servicos: values.floatValue || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deduções</Label>
                  <CurrencyInput
                    value={formData.valor_deducoes}
                    onValueChange={(values) => setFormData({ ...formData, valor_deducoes: values.floatValue || 0 })}
                  />
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3">Retenções</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>PIS</Label>
                    <CurrencyInput
                      value={formData.valor_pis}
                      onValueChange={(values) => setFormData({ ...formData, valor_pis: values.floatValue || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>COFINS</Label>
                    <CurrencyInput
                      value={formData.valor_cofins}
                      onValueChange={(values) => setFormData({ ...formData, valor_cofins: values.floatValue || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>INSS</Label>
                    <CurrencyInput
                      value={formData.valor_inss}
                      onValueChange={(values) => setFormData({ ...formData, valor_inss: values.floatValue || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>IR</Label>
                    <CurrencyInput
                      value={formData.valor_ir}
                      onValueChange={(values) => setFormData({ ...formData, valor_ir: values.floatValue || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CSLL</Label>
                    <CurrencyInput
                      value={formData.valor_csll}
                      onValueChange={(values) => setFormData({ ...formData, valor_csll: values.floatValue || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Alíquota ISS (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.aliquota_iss}
                      onChange={(e) => setFormData({ ...formData, aliquota_iss: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Base de Cálculo</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(formData.valor_servicos - formData.valor_deducoes)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ISS ({formData.aliquota_iss}%)</p>
                      <p className="text-lg font-semibold text-orange-600">
                        {formatCurrency(valorIss)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Valor Líquido</p>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(valorLiquido)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedNota ? "Salvar Alterações" : "Criar Nota Fiscal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Nota Fiscal #{selectedNota?.numero}
            </DialogTitle>
          </DialogHeader>

          {selectedNota && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Badge className={statusColors[selectedNota.status]}>
                  {statusLabels[selectedNota.status]}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Emitida em {format(parseISO(selectedNota.data_emissao), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Prestador
                  </h4>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{selectedNota.prestador_razao_social || "-"}</p>
                    <p className="text-muted-foreground">{selectedNota.prestador_cnpj}</p>
                    <p className="text-muted-foreground">
                      {selectedNota.prestador_cidade}/{selectedNota.prestador_uf}
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Tomador
                  </h4>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{selectedNota.tomador_razao_social || "-"}</p>
                    <p className="text-muted-foreground">{selectedNota.tomador_cpf_cnpj}</p>
                    <p className="text-muted-foreground">{selectedNota.tomador_email}</p>
                  </div>
                </div>
              </div>

              {selectedNota.discriminacao && (
                <div>
                  <h4 className="font-medium mb-2">Discriminação dos Serviços</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedNota.discriminacao}
                  </p>
                </div>
              )}

              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Serviços</p>
                      <p className="text-lg font-semibold">{formatCurrency(selectedNota.valor_servicos)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">ISS ({selectedNota.aliquota_iss}%)</p>
                      <p className="text-lg font-semibold text-orange-600">{formatCurrency(selectedNota.valor_iss)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Líquido</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(selectedNota.valor_liquido)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {selectedNota.arquivo_url && (
                <Button variant="outline" asChild className="w-full">
                  <a href={selectedNota.arquivo_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Baixar PDF/XML
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
