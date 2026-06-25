import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Search, BookUser, Bookmark, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface SignatarioSalvo {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  tipo_pessoa: "pf" | "pj";
  papel: string | null;
  endereco: string | null;
  representante_legal: string | null;
}

interface PickerProps {
  /** Called with selected saved signatário. */
  onSelect: (s: SignatarioSalvo) => void;
  /** Current form values used to "salvar" this signatário in the address book. */
  currentData: {
    nome: string;
    email?: string;
    telefone?: string;
    documento?: string;
    tipo_pessoa: "pf" | "pj";
    papel?: string;
    endereco?: string;
    representante_legal?: string;
  };
}

export default function SignatariosSalvosPicker({ onSelect, currentData }: PickerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: salvos, isLoading } = useQuery({
    queryKey: ["signatarios-salvos", search],
    queryFn: async () => {
      let q = supabase
        .from("contrato_signatarios_salvos")
        .select("*")
        .order("ultimo_uso_em", { ascending: false, nullsFirst: false })
        .order("nome", { ascending: true })
        .limit(50);
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`nome.ilike.${s},email.ilike.${s},documento.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as SignatarioSalvo[];
    },
    enabled: open,
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!currentData.nome?.trim()) {
        throw new Error("Preencha pelo menos o nome para salvar.");
      }
      const corretora_id = (user as any)?.user_metadata?.corretora_id || null;
      const payload = {
        corretora_id,
        criado_por: user?.id || null,
        nome: currentData.nome.trim(),
        email: currentData.email || null,
        telefone: currentData.telefone || null,
        documento: currentData.documento || null,
        tipo_pessoa: currentData.tipo_pessoa,
        papel: currentData.papel || null,
        endereco: currentData.endereco || null,
        representante_legal: currentData.representante_legal || null,
        ultimo_uso_em: new Date().toISOString(),
      };
      const { error } = await supabase.from("contrato_signatarios_salvos").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Signatário salvo na agenda!");
      queryClient.invalidateQueries({ queryKey: ["signatarios-salvos"] });
    },
    onError: (e: any) => toast.error("Erro ao salvar: " + e.message),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contrato_signatarios_salvos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido da agenda.");
      queryClient.invalidateQueries({ queryKey: ["signatarios-salvos"] });
    },
    onError: (e: any) => toast.error("Erro: " + e.message),
  });

  const escolher = async (s: SignatarioSalvo) => {
    onSelect(s);
    setOpen(false);
    // marca uso para subir no topo
    await supabase
      .from("contrato_signatarios_salvos")
      .update({ ultimo_uso_em: new Date().toISOString() })
      .eq("id", s.id);
    queryClient.invalidateQueries({ queryKey: ["signatarios-salvos"] });
  };

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <BookUser className="h-3.5 w-3.5" />
            Buscar da agenda
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0" align="end">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, e-mail ou documento..."
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : !salvos || salvos.length === 0 ? (
              <div className="text-center py-6 px-4 text-xs text-muted-foreground">
                Nenhum signatário salvo ainda. Preencha os dados e clique em "Salvar na agenda".
              </div>
            ) : (
              <ul className="divide-y">
                {salvos.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 p-3 hover:bg-muted/40 group">
                    <button
                      type="button"
                      onClick={() => escolher(s)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate">{s.nome}</span>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {s.tipo_pessoa.toUpperCase()}
                        </Badge>
                        {s.papel && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {s.papel}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.email || s.documento || s.telefone || "—"}
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        if (confirm(`Remover "${s.nome}" da agenda?`)) {
                          remover.mutate(s.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending || !currentData.nome?.trim()}
        title="Salvar este signatário na agenda para reutilizar depois"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Salvar na agenda
      </Button>
    </div>
  );
}