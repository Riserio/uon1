import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { MaskedInput } from "@/components/ui/masked-input";

interface NovoFuncionarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funcionario?: any;
}

export default function NovoFuncionarioDialog({ open, onOpenChange, funcionario }: NovoFuncionarioDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!funcionario;

  // Form state
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cargo, setCargo] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [tipoContrato, setTipoContrato] = useState("CLT");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [salario, setSalario] = useState("");
  const [cargaHoraria, setCargaHoraria] = useState("44");
  const [horarioEntrada, setHorarioEntrada] = useState("08:00");
  const [horarioSaida, setHorarioSaida] = useState("18:00");
  const [horarioAlmocoInicio, setHorarioAlmocoInicio] = useState("12:00");
  const [horarioAlmocoFim, setHorarioAlmocoFim] = useState("13:00");
  const [corretoraId, setCorretoraId] = useState("");

  // Endereço
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");

  // Dados bancários
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [pix, setPix] = useState("");

  // Fetch corretoras
  const { data: corretoras } = useQuery({
    queryKey: ["corretoras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corretoras")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Preencher form quando editando
  useEffect(() => {
    if (funcionario) {
      setNome(funcionario.nome || "");
      setEmail(funcionario.email || "");
      setCpf(funcionario.cpf || "");
      setTelefone(funcionario.telefone || "");
      setCargo(funcionario.cargo || "");
      setDepartamento(funcionario.departamento || "");
      setTipoContrato(funcionario.tipo_contrato || "CLT");
      setDataAdmissao(funcionario.data_admissao || "");
      setSalario(funcionario.salario?.toString() || "");
      setCargaHoraria(funcionario.carga_horaria_semanal?.toString() || "44");
      setHorarioEntrada(funcionario.horario_entrada || "08:00");
      setHorarioSaida(funcionario.horario_saida || "18:00");
      setHorarioAlmocoInicio(funcionario.horario_almoco_inicio || "12:00");
      setHorarioAlmocoFim(funcionario.horario_almoco_fim || "13:00");
      setCorretoraId(funcionario.corretora_id || "");

      const endereco = funcionario.endereco || {};
      setCep(endereco.cep || "");
      setRua(endereco.rua || "");
      setNumero(endereco.numero || "");
      setBairro(endereco.bairro || "");
      setCidade(endereco.cidade || "");
      setEstado(endereco.estado || "");

      const dadosBancarios = funcionario.dados_bancarios || {};
      setBanco(dadosBancarios.banco || "");
      setAgencia(dadosBancarios.agencia || "");
      setConta(dadosBancarios.conta || "");
      setPix(dadosBancarios.pix || "");
    }
  }, [funcionario]);

  const resetForm = () => {
    setNome("");
    setEmail("");
    setCpf("");
    setTelefone("");
    setCargo("");
    setDepartamento("");
    setTipoContrato("CLT");
    setDataAdmissao("");
    setSalario("");
    setCargaHoraria("44");
    setHorarioEntrada("08:00");
    setHorarioSaida("18:00");
    setHorarioAlmocoInicio("12:00");
    setHorarioAlmocoFim("13:00");
    setCorretoraId("");
    setCep("");
    setRua("");
    setNumero("");
    setBairro("");
    setCidade("");
    setEstado("");
    setBanco("");
    setAgencia("");
    setConta("");
    setPix("");
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      if (!nome) throw new Error("Nome é obrigatório");

      const dados = {
        nome,
        email,
        cpf,
        telefone,
        cargo,
        departamento,
        tipo_contrato: tipoContrato,
        data_admissao: dataAdmissao || null,
        salario: salario ? parseFloat(salario) : null,
        carga_horaria_semanal: parseInt(cargaHoraria),
        horario_entrada: horarioEntrada,
        horario_saida: horarioSaida,
        horario_almoco_inicio: horarioAlmocoInicio,
        horario_almoco_fim: horarioAlmocoFim,
        corretora_id: corretoraId || null,
        endereco: { cep, rua, numero, bairro, cidade, estado },
        dados_bancarios: { banco, agencia, conta, pix },
        updated_at: new Date().toISOString(),
      };

      if (isEditing) {
        const { error } = await supabase
          .from("funcionarios")
          .update(dados)
          .eq("id", funcionario.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("funcionarios").insert({
          ...dados,
          created_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funcionarios"] });
      toast.success(isEditing ? "Funcionário atualizado!" : "Funcionário cadastrado!");
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Erro: " + error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Atualize os dados do funcionário" : "Cadastre um novo colaborador"}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="jornada">Jornada</TabsTrigger>
            <TabsTrigger value="endereco">Endereço</TabsTrigger>
            <TabsTrigger value="bancario">Bancário</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>CPF</Label>
                <MaskedInput
                  format="###.###.###-##"
                  value={cpf}
                  onValueChange={(values) => setCpf(values.value)}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <MaskedInput
                  format="(##) #####-####"
                  value={telefone}
                  onValueChange={(values) => setTelefone(values.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Input
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  placeholder="Ex: Analista"
                />
              </div>
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Input
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                  placeholder="Ex: Comercial"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Contrato</Label>
                <Select value={tipoContrato} onValueChange={setTipoContrato}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLT">CLT</SelectItem>
                    <SelectItem value="PJ">PJ</SelectItem>
                    <SelectItem value="Estagiário">Estagiário</SelectItem>
                    <SelectItem value="Temporário">Temporário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data de Admissão</Label>
                <Input
                  type="date"
                  value={dataAdmissao}
                  onChange={(e) => setDataAdmissao(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Salário</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Associação</Label>
                <Select value={corretoraId} onValueChange={setCorretoraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {corretoras?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="jornada" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Carga Horária Semanal (horas)</Label>
                <Input
                  type="number"
                  value={cargaHoraria}
                  onChange={(e) => setCargaHoraria(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horário de Entrada</Label>
                <Input
                  type="time"
                  value={horarioEntrada}
                  onChange={(e) => setHorarioEntrada(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário de Saída</Label>
                <Input
                  type="time"
                  value={horarioSaida}
                  onChange={(e) => setHorarioSaida(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Início do Almoço</Label>
                <Input
                  type="time"
                  value={horarioAlmocoInicio}
                  onChange={(e) => setHorarioAlmocoInicio(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim do Almoço</Label>
                <Input
                  type="time"
                  value={horarioAlmocoFim}
                  onChange={(e) => setHorarioAlmocoFim(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="endereco" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CEP</Label>
                <MaskedInput
                  format="#####-###"
                  value={cep}
                  onValueChange={(values) => setCep(values.value)}
                  placeholder="00000-000"
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Rua</Label>
                <Input
                  value={rua}
                  onChange={(e) => setRua(e.target.value)}
                  placeholder="Rua, Av, etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Número</Label>
                <Input
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bancario" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Banco</Label>
                <Input
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                  placeholder="Nome do banco"
                />
              </div>
              <div className="space-y-2">
                <Label>Agência</Label>
                <Input
                  value={agencia}
                  onChange={(e) => setAgencia(e.target.value)}
                  placeholder="0000"
                />
              </div>
              <div className="space-y-2">
                <Label>Conta</Label>
                <Input
                  value={conta}
                  onChange={(e) => setConta(e.target.value)}
                  placeholder="00000-0"
                />
              </div>
              <div className="space-y-2">
                <Label>Chave PIX</Label>
                <Input
                  value={pix}
                  onChange={(e) => setPix(e.target.value)}
                  placeholder="CPF, email, telefone ou aleatória"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEditing ? "Atualizar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
