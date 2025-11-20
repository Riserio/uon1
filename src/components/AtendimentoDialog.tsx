import { useState, useEffect } from 'react';
import { Atendimento, PriorityType, StatusType } from '@/types/atendimento';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AndamentosList } from '@/components/AndamentosList';
import { AnexosUpload } from '@/components/AnexosUpload';
import { Check, ChevronsUpDown, FileText, MessageSquare, Paperclip, History, DollarSign, User, Link2, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { HistoricoList } from '@/components/HistoricoList';
import { useAuth } from '@/hooks/useAuth';
import { CurrencyInput } from '@/components/ui/currency-input';
import { validateCPF, validatePlaca } from '@/lib/validators';
import { MaskedInput } from '@/components/ui/masked-input';

interface AtendimentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atendimento?: Atendimento | null;
  onSave: (atendimento: Atendimento) => void;
  corretoras: string[];
  responsaveis: string[];
}

export function AtendimentoDialog({
  open,
  onOpenChange,
  atendimento,
  onSave,
  corretoras,
  responsaveis,
}: AtendimentoDialogProps) {
  const [formData, setFormData] = useState<Partial<Atendimento>>({
    corretora: '',
    contato: '',
    assunto: '',
    prioridade: 'Média',
    responsavel: '',
    tags: [],
    observacoes: '',
    dataRetorno: '',
  });

  const [tagInput, setTagInput] = useState('');
  const [primeiroAndamento, setPrimeiroAndamento] = useState('');
  const [anexos, setAnexos] = useState<any[]>([]);
  const [parecerFinal, setParecerFinal] = useState('');
  const [emailConclusao, setEmailConclusao] = useState('');
  const [enviandoEmailConclusao, setEnviandoEmailConclusao] = useState(false);
  const [corretoraSearchOpen, setCorretoraSearchOpen] = useState(false);
  const [corretoraSearch, setCorretoraSearch] = useState('');
  const [filteredCorretoras, setFilteredCorretoras] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('geral');
  const { userRole } = useAuth();
  
  // Estados para custos e dados do sinistro
  const [vistoriaId, setVistoriaId] = useState<string | null>(null);
  const [vistoriaData, setVistoriaData] = useState({
    tipo_atendimento: 'geral' as 'sinistro' | 'geral',
    tipo_sinistro: '',
    data_incidente: '',
    relato_incidente: '',
    veiculo_placa: '',
    veiculo_marca: '',
    veiculo_modelo: '',
    veiculo_ano: '',
    veiculo_cor: '',
    veiculo_chassi: '',
    cliente_nome: '',
    cliente_cpf: '',
    cliente_telefone: '',
    cliente_email: '',
    cof: '',
  });
  const [custos, setCustos] = useState({
    custo_oficina: 0,
    custo_reparo: 0,
    custo_acordo: 0,
    custo_terceiros: 0,
    custo_perda_total: 0,
    custo_perda_parcial: 0,
    valor_franquia: 0,
    valor_indenizacao: 0,
  });

  useEffect(() => {
    if (atendimento) {
      setFormData(atendimento);
      setPrimeiroAndamento('');
      setAnexos([]);
      loadVistoriaCustos(atendimento.id);
      
      // Carregar tipo_atendimento do atendimento
      const loadTipoAtendimento = async () => {
        const { data } = await supabase
          .from('atendimentos')
          .select('tipo_atendimento')
          .eq('id', atendimento.id)
          .single();
        
        if (data?.tipo_atendimento) {
          setVistoriaData(prev => ({
            ...prev,
            tipo_atendimento: data.tipo_atendimento as 'sinistro' | 'geral'
          }));
        }
      };
      
      loadTipoAtendimento();
    } else {
      setFormData({
        corretora: '',
        contato: '',
        assunto: '',
        prioridade: 'Média',
        responsavel: '',
        tags: [],
        observacoes: '',
        dataRetorno: '',
      });
      setPrimeiroAndamento('');
      setAnexos([]);
      setParecerFinal('');
      setEmailConclusao('');
      setVistoriaId(null);
      setVistoriaData({
        tipo_atendimento: 'geral',
        tipo_sinistro: '',
        data_incidente: '',
        relato_incidente: '',
        veiculo_placa: '',
        veiculo_marca: '',
        veiculo_modelo: '',
        veiculo_ano: '',
        veiculo_cor: '',
        veiculo_chassi: '',
        cliente_nome: '',
        cliente_cpf: '',
        cliente_telefone: '',
        cliente_email: '',
        cof: '',
      });
      setCustos({
        custo_oficina: 0,
        custo_reparo: 0,
        custo_acordo: 0,
        custo_terceiros: 0,
        custo_perda_total: 0,
        custo_perda_parcial: 0,
        valor_franquia: 0,
        valor_indenizacao: 0,
      });
    }
    setCorretoraSearch('');
    setFilteredCorretoras([]);
  }, [atendimento, open]);
  
  const loadVistoriaCustos = async (atendimentoId: string) => {
    try {
      const { data, error } = await supabase
        .from('vistorias')
        .select('*')
        .eq('atendimento_id', atendimentoId)
        .maybeSingle();
      
      if (error) {
        console.error('Erro ao carregar vistoria:', error);
        return;
      }
      
      if (data) {
        setVistoriaId(data.id);
        setVistoriaData({
          tipo_atendimento: 'sinistro',
          tipo_sinistro: data.tipo_sinistro || '',
          data_incidente: data.data_incidente || '',
          relato_incidente: data.relato_incidente || '',
          veiculo_placa: data.veiculo_placa || '',
          veiculo_marca: data.veiculo_marca || '',
          veiculo_modelo: data.veiculo_modelo || '',
          veiculo_ano: data.veiculo_ano || '',
          veiculo_cor: data.veiculo_cor || '',
          veiculo_chassi: data.veiculo_chassi || '',
          cliente_nome: data.cliente_nome || '',
          cliente_cpf: data.cliente_cpf || '',
          cliente_telefone: data.cliente_telefone || '',
          cliente_email: data.cliente_email || '',
          cof: data.cof || '',
        });
        setCustos({
          custo_oficina: data.custo_oficina || 0,
          custo_reparo: data.custo_reparo || 0,
          custo_acordo: data.custo_acordo || 0,
          custo_terceiros: data.custo_terceiros || 0,
          custo_perda_total: data.custo_perda_total || 0,
          custo_perda_parcial: data.custo_perda_parcial || 0,
          valor_franquia: data.valor_franquia || 0,
          valor_indenizacao: data.valor_indenizacao || 0,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar vistoria:', error);
    }
  };

  useEffect(() => {
    if (corretoraSearch.length >= 3) {
      const filtered = corretoras.filter(c => 
        c.toLowerCase().includes(corretoraSearch.toLowerCase())
      );
      setFilteredCorretoras(filtered);
    } else {
      setFilteredCorretoras([]);
    }
  }, [corretoraSearch, corretoras]);
  
  const handleSalvarCustos = async () => {
    if (!atendimento?.id) {
      toast.error('Atendimento não encontrado');
      return;
    }

    // Validar CPF se preenchido
    if (vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf)) {
      toast.error('CPF inválido');
      return;
    }

    // Validar placa se preenchida
    if (vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa)) {
      toast.error('Placa inválida (formato: ABC-1234 ou ABC1D23)');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      // Separar dados da vistoria (sem tipo_atendimento)
      const { tipo_atendimento, ...vistoriaDataOnly } = vistoriaData;
      
      // Converter strings vazias de timestamp para null
      const cleanedVistoriaData = Object.entries(vistoriaDataOnly).reduce((acc, [key, value]) => {
        if (key === 'data_incidente' && value === '') {
          acc[key] = null;
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as any);
      
      if (vistoriaId) {
        // Atualizar vistoria existente
        const { error: vistoriaError } = await supabase
          .from('vistorias')
          .update({
            ...cleanedVistoriaData,
            ...custos,
          })
          .eq('id', vistoriaId);

        if (vistoriaError) {
          console.error('Erro ao atualizar vistoria:', vistoriaError);
          throw vistoriaError;
        }
      } else {
        // Criar nova vistoria
        const { data: newVistoria, error: vistoriaError } = await supabase
          .from('vistorias')
          .insert({
            atendimento_id: atendimento.id,
            created_by: user.id,
            tipo_vistoria: 'sinistro',
            tipo_abertura: 'interno',
            status: 'rascunho',
            ...cleanedVistoriaData,
            ...custos,
          })
          .select('id')
          .single();

        if (vistoriaError) {
          console.error('Erro ao criar vistoria:', vistoriaError);
          throw vistoriaError;
        }
        if (newVistoria) setVistoriaId(newVistoria.id);
      }

      // Atualizar tipo_atendimento na tabela atendimentos
      const { error: atendError } = await supabase
        .from('atendimentos')
        .update({ tipo_atendimento: vistoriaData.tipo_atendimento })
        .eq('id', atendimento.id);

      if (atendError) {
        console.error('Erro ao atualizar tipo atendimento:', atendError);
        throw atendError;
      }

      toast.success('Dados salvos com sucesso');
      
      // Recarregar os dados para garantir sincronização
      await loadVistoriaCustos(atendimento.id);
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast.error(error?.message || 'Erro ao salvar dados');
    }
  };

  const handleGerarLinkVistoria = async () => {
    if (!atendimento?.id) {
      toast.error('Atendimento não encontrado');
      return;
    }

    try {
      // Validar dados obrigatórios
      if (!vistoriaData.veiculo_placa) {
        toast.error('Preencha a placa do veículo');
        return;
      }

      if (!validatePlaca(vistoriaData.veiculo_placa)) {
        toast.error('Placa inválida');
        return;
      }

      // Salvar dados primeiro
      await handleSalvarCustos();

      // Gerar token de acesso
      const linkToken = crypto.randomUUID();
      const diasValidade = 7;
      const linkExpiresAt = new Date();
      linkExpiresAt.setDate(linkExpiresAt.getDate() + diasValidade);

      // Atualizar vistoria com link
      const { error } = await supabase
        .from('vistorias')
        .update({
          link_token: linkToken,
          link_expires_at: linkExpiresAt.toISOString(),
          dias_validade: diasValidade,
          status: 'aguardando_fotos',
        })
        .eq('id', vistoriaId);

      if (error) throw error;

      // Copiar link para clipboard
      const link = `${window.location.origin}/vistoria/${linkToken}`;
      await navigator.clipboard.writeText(link);
      
      toast.success('Link gerado e copiado!', {
        description: 'O link é válido por 7 dias'
      });
    } catch (error) {
      console.error('Erro ao gerar link:', error);
      toast.error('Erro ao gerar link de vistoria');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const now = new Date().toISOString();
      
      // Se for edição, atualizar o atendimento existente
      if (atendimento?.id) {
        const { error: updateError } = await supabase
          .from('atendimentos')
          .update({
            assunto: formData.assunto || '',
            prioridade: formData.prioridade || 'Média',
            responsavel_id: formData.responsavel || null,
            tags: formData.tags || [],
            observacoes: formData.observacoes || '',
            data_retorno: formData.dataRetorno || null,
            updated_at: now,
          })
          .eq('id', atendimento.id);

        if (updateError) {
          console.error('Erro ao atualizar atendimento:', updateError);
          toast.error('Erro ao atualizar atendimento');
          return;
        }

        // Upload de novos anexos
        if (anexos.length > 0) {
          for (const file of anexos) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${atendimento.id}/${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
              .from('atendimento-anexos')
              .upload(fileName, file);

            if (uploadError) {
              console.error('Erro no upload:', uploadError);
              toast.error(`Erro ao fazer upload de ${file.name}`);
              continue;
            }

            const { error: dbError } = await supabase
              .from('atendimento_anexos')
              .insert({
                atendimento_id: atendimento.id,
                arquivo_nome: file.name,
                arquivo_url: fileName,
                arquivo_tamanho: file.size,
                tipo_arquivo: file.type,
                created_by: user.id,
              });

            if (dbError) {
              console.error('Erro ao salvar anexo no DB:', dbError);
              toast.error(`Erro ao salvar informações de ${file.name}`);
            }
          }
        }

        toast.success('Atendimento atualizado com sucesso');
      } else {
        // Criar novo atendimento
        const savedAtendimento: Atendimento = {
          id: `atd-${Date.now()}`,
          numero: 0,
          corretora: formData.corretora || '',
          contato: formData.contato || '',
          assunto: formData.assunto || '',
          prioridade: (formData.prioridade as PriorityType) || 'Média',
          responsavel: formData.responsavel || '',
          status: 'novo' as StatusType,
          tags: formData.tags || [],
          observacoes: formData.observacoes || '',
          dataRetorno: formData.dataRetorno || undefined,
          createdAt: now,
          updatedAt: now,
        };

        onSave(savedAtendimento);

        // Upload de anexos para novo atendimento
        if (anexos.length > 0) {
          for (const file of anexos) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${savedAtendimento.id}/${Date.now()}.${fileExt}`;
            
            const { error: uploadError } = await supabase.storage
              .from('atendimento-anexos')
              .upload(fileName, file);

            if (uploadError) {
              toast.error(`Erro ao fazer upload de ${file.name}`);
              continue;
            }

            const { error: dbError } = await supabase
              .from('atendimento_anexos')
              .insert({
                atendimento_id: savedAtendimento.id,
                arquivo_nome: file.name,
                arquivo_url: fileName,
                arquivo_tamanho: file.size,
                tipo_arquivo: file.type,
                created_by: user.id,
              });

            if (dbError) {
              toast.error(`Erro ao salvar informações de ${file.name}`);
            }
          }
        }

        // Adicionar primeiro andamento se houver
        if (primeiroAndamento.trim()) {
          await supabase.from('andamentos').insert({
            atendimento_id: savedAtendimento.id,
            descricao: primeiroAndamento,
            created_by: user.id,
          });
        }
      }
      
      onOpenChange(false);
    } catch (error: any) {
      console.error('Erro no handleSubmit:', error);
      toast.error(error?.message || 'Erro ao salvar atendimento');
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) || [] });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="text-2xl">{atendimento ? 'Editar Atendimento' : 'Novo Atendimento'}</DialogTitle>
            <DialogDescription>
              {atendimento ? 'Gerencie todas as informações do atendimento' : 'Preencha as informações do atendimento'}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className={cn("grid w-full", atendimento ? (vistoriaData.tipo_atendimento === 'sinistro' ? "grid-cols-6" : "grid-cols-5") : "grid-cols-1")}>
              <TabsTrigger value="geral" className="gap-2">
                <FileText className="h-4 w-4" />
                Geral
              </TabsTrigger>
              {atendimento && (
                <>
                  {vistoriaData.tipo_atendimento === 'sinistro' && (
                    <TabsTrigger value="dados_pessoais" className="gap-2" onClick={() => loadVistoriaCustos(atendimento.id)}>
                      <User className="h-4 w-4" />
                      Dados Pessoais
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="andamentos" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Andamentos
                  </TabsTrigger>
                  <TabsTrigger value="anexos" className="gap-2">
                    <Paperclip className="h-4 w-4" />
                    Anexos
                  </TabsTrigger>
                  <TabsTrigger value="custos" className="gap-2" onClick={() => loadVistoriaCustos(atendimento.id)}>
                    <DollarSign className="h-4 w-4" />
                    Custos
                  </TabsTrigger>
                  {(userRole === 'admin' || userRole === 'superintendente') && (
                    <TabsTrigger value="historico" className="gap-2">
                      <History className="h-4 w-4" />
                      Histórico
                    </TabsTrigger>
                  )}
                </>
              )}
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-4">
              <TabsContent value="geral" className="mt-0">
                <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="corretora">Corretora *</Label>
              <Popover open={corretoraSearchOpen} onOpenChange={setCorretoraSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={corretoraSearchOpen}
                    className="w-full justify-between"
                  >
                    {formData.corretora || "Selecione uma corretora..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0">
                  <Command>
                    <CommandInput 
                      placeholder="Digite pelo menos 3 caracteres..." 
                      value={corretoraSearch}
                      onValueChange={setCorretoraSearch}
                    />
                    <CommandEmpty>
                      {corretoraSearch.length < 3 
                        ? "Digite pelo menos 3 caracteres para buscar" 
                        : "Nenhuma corretora encontrada"}
                    </CommandEmpty>
                    {filteredCorretoras.length > 0 && (
                      <CommandGroup>
                        {filteredCorretoras.map((c) => (
                          <CommandItem
                            key={c}
                            value={c}
                            onSelect={(currentValue) => {
                              setFormData({ ...formData, corretora: currentValue });
                              setCorretoraSearchOpen(false);
                              setCorretoraSearch('');
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.corretora === c ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {c}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contato">Contato</Label>
              <Input
                id="contato"
                value={formData.contato}
                onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assunto">Assunto *</Label>
            <Input
              id="assunto"
              value={formData.assunto}
              onChange={(e) => setFormData({ ...formData, assunto: e.target.value })}
              required
            />
          </div>

          {/* Tipo de Atendimento e Tipo de Sinistro */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_atendimento">Tipo de Atendimento *</Label>
              <Select
                value={vistoriaData.tipo_atendimento}
                onValueChange={(value: 'sinistro' | 'geral') => 
                  setVistoriaData({ ...vistoriaData, tipo_atendimento: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sinistro">Sinistro</SelectItem>
                  <SelectItem value="geral">Geral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {vistoriaData.tipo_atendimento === 'sinistro' && (
              <div className="space-y-2">
                <Label htmlFor="tipo_sinistro">Tipo de Sinistro *</Label>
                <Select
                  value={vistoriaData.tipo_sinistro}
                  onValueChange={(value) => 
                    setVistoriaData({ ...vistoriaData, tipo_sinistro: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de sinistro" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colisão">Colisão</SelectItem>
                    <SelectItem value="Roubo/Furto">Roubo/Furto</SelectItem>
                    <SelectItem value="Incêndio">Incêndio</SelectItem>
                    <SelectItem value="Danos a Terceiros">Danos a Terceiros</SelectItem>
                    <SelectItem value="Fenômenos Naturais">Fenômenos Naturais</SelectItem>
                    <SelectItem value="Vidros">Vidros</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prioridade">Prioridade</Label>
              <Select
                value={formData.prioridade}
                onValueChange={(value) => setFormData({ ...formData, prioridade: value as PriorityType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável</Label>
              <Input
                id="responsavel"
                list="responsaveis-list"
                value={formData.responsavel}
                onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
              />
              <datalist id="responsaveis-list">
                {responsaveis.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Adicionar tag..."
              />
              <Button type="button" onClick={addTag} variant="outline">
                +
              </Button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-destructive"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {!atendimento && (
            <div className="space-y-2">
              <Label htmlFor="primeiroAndamento">Primeiro Andamento</Label>
              <Textarea
                id="primeiroAndamento"
                value={primeiroAndamento}
                onChange={(e) => setPrimeiroAndamento(e.target.value)}
                placeholder="Descreva o primeiro andamento deste atendimento..."
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataRetorno">Data de Retorno (Follow-up)</Label>
            <Input
              id="dataRetorno"
              type="datetime-local"
              value={formData.dataRetorno || ''}
              onChange={(e) => setFormData({ ...formData, dataRetorno: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </div>
                </form>
              </TabsContent>

              {atendimento && (
                <>
                  {/* Nova Aba: Dados Pessoais */}
                  {vistoriaData.tipo_atendimento === 'sinistro' && (
                    <TabsContent value="dados_pessoais" className="mt-0 space-y-6 p-4">
                      {/* Dados do Sinistro */}
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                        <h4 className="font-medium">Dados do Sinistro</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="dp_data_incidente">Data do Incidente</Label>
                            <Input
                              id="dp_data_incidente"
                              type="date"
                              value={vistoriaData.data_incidente}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, data_incidente: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_cof">COF</Label>
                            <Input
                              id="dp_cof"
                              value={vistoriaData.cof}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, cof: e.target.value })}
                              placeholder="Código de Ocorrência"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="dp_relato_incidente">Relato do Incidente</Label>
                          <Textarea
                            id="dp_relato_incidente"
                            value={vistoriaData.relato_incidente}
                            onChange={(e) => setVistoriaData({ ...vistoriaData, relato_incidente: e.target.value })}
                            rows={4}
                            placeholder="Descreva o que aconteceu..."
                          />
                        </div>
                      </div>

                      {/* Dados do Veículo */}
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                        <h4 className="font-medium">Dados do Veículo</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="dp_veiculo_placa">Placa *</Label>
                            <Input
                              id="dp_veiculo_placa"
                              value={vistoriaData.veiculo_placa}
                              onChange={(e) => {
                                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                                const formatted = value.length > 3 && !value.includes('-') 
                                  ? value.slice(0, 3) + '-' + value.slice(3, 7)
                                  : value;
                                setVistoriaData({ ...vistoriaData, veiculo_placa: formatted });
                              }}
                              placeholder="ABC-1234"
                              maxLength={8}
                              className={vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa) ? 'border-destructive' : ''}
                            />
                            {vistoriaData.veiculo_placa && !validatePlaca(vistoriaData.veiculo_placa) && (
                              <p className="text-xs text-destructive">Placa inválida</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_veiculo_marca">Marca</Label>
                            <Input
                              id="dp_veiculo_marca"
                              value={vistoriaData.veiculo_marca}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_marca: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_veiculo_modelo">Modelo</Label>
                            <Input
                              id="dp_veiculo_modelo"
                              value={vistoriaData.veiculo_modelo}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_modelo: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_veiculo_ano">Ano</Label>
                            <Input
                              id="dp_veiculo_ano"
                              value={vistoriaData.veiculo_ano}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_ano: e.target.value })}
                              placeholder="2020/2021"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_veiculo_cor">Cor</Label>
                            <Input
                              id="dp_veiculo_cor"
                              value={vistoriaData.veiculo_cor}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_cor: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_veiculo_chassi">Chassi</Label>
                            <Input
                              id="dp_veiculo_chassi"
                              value={vistoriaData.veiculo_chassi}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, veiculo_chassi: e.target.value.toUpperCase() })}
                              maxLength={17}
                              placeholder="17 caracteres"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Dados do Cliente */}
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
                        <h4 className="font-medium">Dados do Cliente</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="dp_cliente_nome">Nome Completo</Label>
                            <Input
                              id="dp_cliente_nome"
                              value={vistoriaData.cliente_nome}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, cliente_nome: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_cliente_cpf">CPF</Label>
                            <MaskedInput
                              id="dp_cliente_cpf"
                              format="###.###.###-##"
                              mask="_"
                              value={vistoriaData.cliente_cpf}
                              onValueChange={(values) => setVistoriaData({ ...vistoriaData, cliente_cpf: values.value })}
                              placeholder="000.000.000-00"
                              className={vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf) ? 'border-destructive' : ''}
                            />
                            {vistoriaData.cliente_cpf && !validateCPF(vistoriaData.cliente_cpf) && (
                              <p className="text-xs text-destructive">CPF inválido</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_cliente_telefone">Telefone</Label>
                            <MaskedInput
                              id="dp_cliente_telefone"
                              format="(##) #####-####"
                              mask="_"
                              value={vistoriaData.cliente_telefone}
                              onValueChange={(values) => setVistoriaData({ ...vistoriaData, cliente_telefone: values.value })}
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="dp_cliente_email">Email</Label>
                            <Input
                              id="dp_cliente_email"
                              type="email"
                              value={vistoriaData.cliente_email}
                              onChange={(e) => setVistoriaData({ ...vistoriaData, cliente_email: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex gap-2 justify-end pt-4 border-t">
                        <Button 
                          type="button" 
                          onClick={handleGerarLinkVistoria}
                          variant="outline"
                          className="gap-2"
                          disabled={!vistoriaData.veiculo_placa || !validatePlaca(vistoriaData.veiculo_placa)}
                        >
                          <Link2 className="h-4 w-4" />
                          Gerar Link de Vistoria
                        </Button>
                        <Button 
                          type="button" 
                          onClick={handleSalvarCustos}
                        >
                          Salvar Dados
                        </Button>
                      </div>
                    </TabsContent>
                  )}

                  <TabsContent value="andamentos" className="mt-0">
                    <AndamentosList atendimentoId={atendimento.id} />
                  </TabsContent>

                  <TabsContent value="anexos" className="mt-0">
                    <div className="p-4">
                      <AnexosUpload
                        atendimentoId={atendimento.id}
                        anexos={anexos}
                        onAnexosChange={setAnexos}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="custos" className="mt-0">
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="custo_oficina">Custo Oficina</Label>
                          <CurrencyInput
                            id="custo_oficina"
                            value={custos.custo_oficina}
                            onValueChange={(values) => 
                              setCustos({ ...custos, custo_oficina: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_reparo">Custo Reparo</Label>
                          <CurrencyInput
                            id="custo_reparo"
                            value={custos.custo_reparo}
                            onValueChange={(values) => 
                              setCustos({ ...custos, custo_reparo: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_acordo">Custo Acordo</Label>
                          <CurrencyInput
                            id="custo_acordo"
                            value={custos.custo_acordo}
                            onValueChange={(values) => 
                              setCustos({ ...custos, custo_acordo: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_terceiros">Custo Terceiros</Label>
                          <CurrencyInput
                            id="custo_terceiros"
                            value={custos.custo_terceiros}
                            onValueChange={(values) => 
                              setCustos({ ...custos, custo_terceiros: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_perda_total">Custo Perda Total</Label>
                          <CurrencyInput
                            id="custo_perda_total"
                            value={custos.custo_perda_total}
                            onValueChange={(values) => 
                              setCustos({ ...custos, custo_perda_total: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_perda_parcial">Custo Perda Parcial</Label>
                          <CurrencyInput
                            id="custo_perda_parcial"
                            value={custos.custo_perda_parcial}
                            onValueChange={(values) => 
                              setCustos({ ...custos, custo_perda_parcial: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="valor_franquia">Valor Franquia</Label>
                          <CurrencyInput
                            id="valor_franquia"
                            value={custos.valor_franquia}
                            onValueChange={(values) => 
                              setCustos({ ...custos, valor_franquia: values.floatValue || 0 })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="valor_indenizacao">Valor Indenização</Label>
                          <CurrencyInput
                            id="valor_indenizacao"
                            value={custos.valor_indenizacao}
                            onValueChange={(values) => 
                              setCustos({ ...custos, valor_indenizacao: values.floatValue || 0 })
                            }
                          />
                        </div>
                      </div>
                      
                      <div className="flex justify-end pt-4 border-t">
                        <Button onClick={handleSalvarCustos}>
                          Salvar Custos
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  {(userRole === 'admin' || userRole === 'superintendente') && (
                    <TabsContent value="historico" className="mt-0">
                      <HistoricoList atendimentoId={atendimento.id} />
                    </TabsContent>
                  )}
                </>
              )}
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
