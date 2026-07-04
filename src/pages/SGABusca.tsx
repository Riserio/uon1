import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, Building2, User, Car, IdCard, Phone, Mail, MapPin, Hash, CircleAlert } from "lucide-react";
import { toast } from "sonner";

type Tipo = "placa" | "chassi" | "cpf" | "nome";

interface Resultado {
  associacao: string;
  corretora_id: string;
  nome: string | null;
  cpf: string | null;
  placa: string | null;
  chassi: string | null;
  modelo: string | null;
  marca: string | null;
  ano: string | number | null;
  situacao: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  estado: string | null;
}

function maskPlaca(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}
function maskChassi(v: string) {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}
function maskCpfCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
function aplicarMascara(tipo: Tipo, v: string) {
  if (tipo === "placa") return maskPlaca(v);
  if (tipo === "chassi") return maskChassi(v);
  if (tipo === "cpf") return maskCpfCnpj(v);
  return v; // nome: livre
}

const TIPOS: { id: Tipo; label: string; icon: typeof Car; placeholder: string }[] = [
  { id: "placa", label: "Placa", icon: Car, placeholder: "Ex.: ABC1D23" },
  { id: "chassi", label: "Chassi", icon: Hash, placeholder: "Ex.: 9BWZZZ..." },
  { id: "cpf", label: "CPF/CNPJ", icon: IdCard, placeholder: "Ex.: 123.456.789-00" },
  { id: "nome", label: "Nome", icon: User, placeholder: "Ex.: João da Silva" },
];

export default function SGABusca() {
  const [tipo, setTipo] = useState<Tipo>("placa");
  const [termo, setTermo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscadas, setBuscadas] = useState<string[]>([]);

  const tipoAtual = TIPOS.find((t) => t.id === tipo)!;

  const buscar = async () => {
    const t = termo.trim();
    if (t.length < 3) {
      toast.info("Digite ao menos 3 caracteres.");
      return;
    }
    setLoading(true);
    setResultados(null);
    try {
      const { data, error } = await supabase.functions.invoke("buscar-sga", { body: { tipo, termo: t } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "Falha na busca");
      setResultados(data.resultados || []);
      setBuscadas(data.associacoes_buscadas || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao buscar no SGA");
      setResultados([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Search className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">SGA — Busca de Clientes</h1>
          <p className="text-sm text-muted-foreground">Procure por placa, chassi, CPF/CNPJ ou nome em todas as associações com API.</p>
        </div>
      </div>

      {/* Buscador */}
      <Card className="rounded-2xl border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {TIPOS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTipo(t.id); setTermo(""); setResultados(null); }}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    tipo === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={termo}
                onChange={(e) => setTermo(aplicarMascara(tipo, e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                placeholder={tipoAtual.placeholder}
                className={`pl-9 h-10 rounded-xl ${tipo === "placa" || tipo === "chassi" ? "uppercase tracking-wide" : ""}`}
                inputMode={tipo === "cpf" ? "numeric" : "text"}
              />
            </div>
            <Button onClick={buscar} disabled={loading} className="h-10 rounded-xl gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {loading && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="h-7 w-7 mx-auto animate-spin mb-2" />
          Consultando o SGA nas associações...
        </div>
      )}

      {!loading && resultados && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {resultados.length} resultado(s){buscadas.length ? ` · buscado em: ${buscadas.join(", ")}` : ""}
          </p>

          {resultados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-14 text-center">
              <CircleAlert className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para "{termo}".</p>
            </div>
          ) : (
            resultados.map((r, i) => (
              <Card key={i} className="rounded-2xl border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="inline-flex items-center gap-1.5 text-primary font-semibold text-sm">
                      <Building2 className="h-4 w-4" />
                      {r.associacao}
                    </div>
                    {r.situacao && (
                      <Badge variant="outline" className="text-[11px]">{r.situacao}</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <Campo icon={User} label="Nome" valor={r.nome} />
                    <Campo icon={IdCard} label="CPF/CNPJ" valor={r.cpf} />
                    <Campo icon={Car} label="Placa" valor={r.placa} />
                    <Campo icon={Car} label="Veículo" valor={[r.marca, r.modelo, r.ano].filter(Boolean).join(" ") || null} />
                    <Campo icon={Hash} label="Chassi" valor={r.chassi} />
                    <Campo icon={Phone} label="Telefone" valor={r.telefone} />
                    <Campo icon={Mail} label="E-mail" valor={r.email} />
                    <Campo icon={MapPin} label="Cidade/UF" valor={[r.cidade, r.estado].filter(Boolean).join("/") || null} />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ icon: Icon, label, valor }: { icon: typeof User; label: string; valor: string | number | null }) {
  if (!valor) return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="font-medium truncate">{valor}</p>
    </div>
  );
}
