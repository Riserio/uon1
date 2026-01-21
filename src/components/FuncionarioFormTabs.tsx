import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MaskedInput } from "@/components/ui/masked-input";
import { CurrencyInput } from "@/components/ui/currency-input";

export interface FuncionarioFormData {
  // Dados contratuais
  departamento: string;
  tipoContrato: string;
  dataAdmissao: string;
  salario: string;
  corretoraId: string;
  
  // Jornada
  cargaHoraria: string;
  horarioEntrada: string;
  horarioSaida: string;
  horarioAlmocoInicio: string;
  horarioAlmocoFim: string;
  
  // Endereço
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  
  // Dados bancários
  banco: string;
  agencia: string;
  conta: string;
  pix: string;
}

export const defaultFuncionarioFormData: FuncionarioFormData = {
  departamento: "",
  tipoContrato: "CLT",
  dataAdmissao: "",
  salario: "",
  corretoraId: "",
  cargaHoraria: "44",
  horarioEntrada: "08:00",
  horarioSaida: "18:00",
  horarioAlmocoInicio: "12:00",
  horarioAlmocoFim: "13:00",
  cep: "",
  rua: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
  banco: "",
  agencia: "",
  conta: "",
  pix: "",
};

interface FuncionarioFormTabsProps {
  data: FuncionarioFormData;
  onChange: (data: FuncionarioFormData) => void;
  isEditing?: boolean;
}

export default function FuncionarioFormTabs({ data, onChange, isEditing }: FuncionarioFormTabsProps) {
  // Fetch corretoras
  const { data: corretoras } = useQuery({
    queryKey: ["corretoras-funcionario"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corretoras")
        .select("id, nome")
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const updateField = <K extends keyof FuncionarioFormData>(field: K, value: FuncionarioFormData[K]) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        Dados do Funcionário
      </h3>
      
      <Tabs defaultValue="contratual" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="contratual">Contratual</TabsTrigger>
          <TabsTrigger value="jornada">Jornada</TabsTrigger>
          <TabsTrigger value="endereco">Endereço</TabsTrigger>
          <TabsTrigger value="bancario">Bancário</TabsTrigger>
        </TabsList>

        {/* ABA CONTRATUAL */}
        <TabsContent value="contratual" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Input
                value={data.departamento}
                onChange={(e) => updateField("departamento", e.target.value)}
                placeholder="Ex: Comercial"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Contrato</Label>
              <Select value={data.tipoContrato} onValueChange={(v) => updateField("tipoContrato", v)}>
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
                value={data.dataAdmissao}
                onChange={(e) => updateField("dataAdmissao", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Salário</Label>
              <CurrencyInput
                value={data.salario}
                onValueChange={(values) => updateField("salario", values.value)}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Associação</Label>
              <Select value={data.corretoraId} onValueChange={(v) => updateField("corretoraId", v)}>
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

        {/* ABA JORNADA */}
        <TabsContent value="jornada" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Carga Horária Semanal (horas)</Label>
              <Input
                type="number"
                value={data.cargaHoraria}
                onChange={(e) => updateField("cargaHoraria", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Horário de Entrada</Label>
              <Input
                type="time"
                value={data.horarioEntrada}
                onChange={(e) => updateField("horarioEntrada", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Horário de Saída</Label>
              <Input
                type="time"
                value={data.horarioSaida}
                onChange={(e) => updateField("horarioSaida", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Início do Almoço</Label>
              <Input
                type="time"
                value={data.horarioAlmocoInicio}
                onChange={(e) => updateField("horarioAlmocoInicio", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fim do Almoço</Label>
              <Input
                type="time"
                value={data.horarioAlmocoFim}
                onChange={(e) => updateField("horarioAlmocoFim", e.target.value)}
              />
            </div>
          </div>
          
          {isEditing && (
            <div className="border-t pt-4 mt-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <Label className="text-base font-medium">Alertas de Lembrete de Ponto</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Use o botão "Configurar Alertas" na tela de Jornada para gerenciar os lembretes de ponto.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ABA ENDEREÇO */}
        <TabsContent value="endereco" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CEP</Label>
              <MaskedInput
                format="#####-###"
                value={data.cep}
                onValueChange={(values) => updateField("cep", values.value)}
                placeholder="00000-000"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Rua</Label>
              <Input
                value={data.rua}
                onChange={(e) => updateField("rua", e.target.value)}
                placeholder="Rua, Av, etc."
              />
            </div>
            <div className="space-y-2">
              <Label>Número</Label>
              <Input
                value={data.numero}
                onChange={(e) => updateField("numero", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input
                value={data.bairro}
                onChange={(e) => updateField("bairro", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input
                value={data.cidade}
                onChange={(e) => updateField("cidade", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Input
                value={data.estado}
                onChange={(e) => updateField("estado", e.target.value)}
                placeholder="UF"
                maxLength={2}
              />
            </div>
          </div>
        </TabsContent>

        {/* ABA BANCÁRIO */}
        <TabsContent value="bancario" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Banco</Label>
              <Input
                value={data.banco}
                onChange={(e) => updateField("banco", e.target.value)}
                placeholder="Nome do banco"
              />
            </div>
            <div className="space-y-2">
              <Label>Agência</Label>
              <Input
                value={data.agencia}
                onChange={(e) => updateField("agencia", e.target.value)}
                placeholder="0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Conta</Label>
              <Input
                value={data.conta}
                onChange={(e) => updateField("conta", e.target.value)}
                placeholder="00000-0"
              />
            </div>
            <div className="space-y-2">
              <Label>Chave PIX</Label>
              <Input
                value={data.pix}
                onChange={(e) => updateField("pix", e.target.value)}
                placeholder="CPF, email, telefone ou aleatória"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
