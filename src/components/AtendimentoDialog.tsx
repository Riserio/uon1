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
import { Check, ChevronsUpDown, FileText, MessageSquare, Paperclip, History } from 'lucide-react';
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

  useEffect(() => {
    if (atendimento) {
      setFormData(atendimento);
      setPrimeiroAndamento('');
      setAnexos([]);
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
    }
    setCorretoraSearch('');
    setFilteredCorretoras([]);
  }, [atendimento, open]);

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
