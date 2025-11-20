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
import { Check, ChevronsUpDown, FileText, MessageSquare, Paperclip, History, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { HistoricoList } from '@/components/HistoricoList';
import { useAuth } from '@/hooks/useAuth';

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
  
  // Estados para custos
  const [vistoriaId, setVistoriaId] = useState<string | null>(null);
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
      const { data } = await supabase
        .from('vistorias')
        .select('id, custo_oficina, custo_reparo, custo_acordo, custo_terceiros, custo_perda_total, custo_perda_parcial, valor_franquia, valor_indenizacao')
        .eq('atendimento_id', atendimentoId)
        .single();
      
      if (data) {
        setVistoriaId(data.id);
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
      console.error('Erro ao carregar custos:', error);
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

    try {
      if (vistoriaId) {
        // Atualizar vistoria existente
        const { error } = await supabase
          .from('vistorias')
          .update(custos)
          .eq('id', vistoriaId);

        if (error) throw error;
      } else {
        // Criar nova vistoria
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Usuário não autenticado');
          return;
        }

        const { data, error } = await supabase
          .from('vistorias')
          .insert({
            atendimento_id: atendimento.id,
            created_by: user.id,
            tipo_vistoria: 'digital',
            tipo_abertura: 'interno',
            status: 'rascunho',
            ...custos,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (data) setVistoriaId(data.id);
      }

      toast.success('Custos salvos com sucesso');
    } catch (error) {
      console.error('Erro ao salvar custos:', error);
      toast.error('Erro ao salvar custos');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const now = new Date().toISOString();
    const savedAtendimento: Atendimento = {
      id: atendimento?.id || `atd-${Date.now()}`,
      numero: atendimento?.numero || 0,
      corretora: formData.corretora || '',
      contato: formData.contato || '',
      assunto: formData.assunto || '',
      prioridade: (formData.prioridade as PriorityType) || 'Média',
      responsavel: formData.responsavel || '',
      status: (formData.status as StatusType) || 'novo',
      tags: formData.tags || [],
      observacoes: formData.observacoes || '',
      dataRetorno: formData.dataRetorno || undefined,
      createdAt: atendimento?.createdAt || now,
      updatedAt: now,
    };

    onSave(savedAtendimento);
    
    // Upload de anexos e criação do primeiro andamento
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fazer upload dos anexos
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

    // Se for novo atendimento e tiver primeiro andamento, adicionar
    if (!atendimento && primeiroAndamento.trim()) {
      await supabase.from('andamentos').insert({
        atendimento_id: savedAtendimento.id,
        descricao: primeiroAndamento,
        created_by: user.id,
      });
    }
    
    onOpenChange(false);
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
            <TabsList className={cn("grid w-full", atendimento ? "grid-cols-4" : "grid-cols-1")}>
              <TabsTrigger value="geral" className="gap-2">
                <FileText className="h-4 w-4" />
                Informações Gerais
              </TabsTrigger>
              {atendimento && (
                <>
                  <TabsTrigger value="andamentos" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Andamentos
                  </TabsTrigger>
                  <TabsTrigger value="anexos" className="gap-2">
                    <Paperclip className="h-4 w-4" />
                    Anexos
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
                          <Input
                            id="custo_oficina"
                            type="number"
                            step="0.01"
                            value={custos.custo_oficina}
                            onChange={(e) => setCustos({ ...custos, custo_oficina: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_reparo">Custo Reparo</Label>
                          <Input
                            id="custo_reparo"
                            type="number"
                            step="0.01"
                            value={custos.custo_reparo}
                            onChange={(e) => setCustos({ ...custos, custo_reparo: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_acordo">Custo Acordo</Label>
                          <Input
                            id="custo_acordo"
                            type="number"
                            step="0.01"
                            value={custos.custo_acordo}
                            onChange={(e) => setCustos({ ...custos, custo_acordo: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_terceiros">Custo Terceiros</Label>
                          <Input
                            id="custo_terceiros"
                            type="number"
                            step="0.01"
                            value={custos.custo_terceiros}
                            onChange={(e) => setCustos({ ...custos, custo_terceiros: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_perda_total">Custo Perda Total</Label>
                          <Input
                            id="custo_perda_total"
                            type="number"
                            step="0.01"
                            value={custos.custo_perda_total}
                            onChange={(e) => setCustos({ ...custos, custo_perda_total: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="custo_perda_parcial">Custo Perda Parcial</Label>
                          <Input
                            id="custo_perda_parcial"
                            type="number"
                            step="0.01"
                            value={custos.custo_perda_parcial}
                            onChange={(e) => setCustos({ ...custos, custo_perda_parcial: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="valor_franquia">Valor Franquia</Label>
                          <Input
                            id="valor_franquia"
                            type="number"
                            step="0.01"
                            value={custos.valor_franquia}
                            onChange={(e) => setCustos({ ...custos, valor_franquia: Number(e.target.value) })}
                            placeholder="R$ 0,00"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="valor_indenizacao">Valor Indenização</Label>
                          <Input
                            id="valor_indenizacao"
                            type="number"
                            step="0.01"
                            value={custos.valor_indenizacao}
                            onChange={(e) => setCustos({ ...custos, valor_indenizacao: Number(e.target.value) })}
                            placeholder="R$ 0,00"
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
