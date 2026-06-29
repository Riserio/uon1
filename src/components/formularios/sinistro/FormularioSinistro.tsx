import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ChevronDown,
  AlertTriangle,
  Shield,
  CheckCircle2,
  Flag,
} from "lucide-react";
import {
  TIPOS,
  SECOES,
  SECOES_POR_TIPO,
  RED_FLAGS,
  NEXO_STEPS,
  nivelScore,
  type TipoSinistro,
  type Campo,
  type SecaoId,
} from "./config";
import { maskCNPJ, maskCPF, maskPlaca } from "../masks";

const corMap: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-green-50 text-green-700",
  gray: "bg-stone-100 text-stone-700",
  purple: "bg-purple-50 text-purple-700",
};

const badgeMap: Record<string, string> = {
  novo: "bg-green-50 text-green-700 border border-green-200",
  revisado: "bg-amber-50 text-amber-700 border border-amber-200",
  red: "bg-red-50 text-red-700 border border-red-200",
};

export default function FormularioSinistro({ form }: { form: any }) {
  const [tipo, setTipo] = useState<TipoSinistro | null>(null);
  const [valores, setValores] = useState<Record<string, any>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [abertas, setAbertas] = useState<Record<string, boolean>>({
    identificacao: true,
  });
  const [enviado, setEnviado] = useState(false);

  // Branding via og_titulo / og_imagem_url salvos em corretora? Aqui usamos defaults Vangard.
  const headerLogo = "/images/vangard-logo.png";
  const headerTitulo = form?.titulo || "Formulário de Análise";

  const set = (id: string, v: any) => setValores((p) => ({ ...p, [id]: v }));
  const toggleSec = (id: string) => setAbertas((p) => ({ ...p, [id]: !p[id] }));

  const score = useMemo(() => {
    let s = 0;
    for (const f of RED_FLAGS) {
      if (flags[f.id] && (!f.visivelSe || (tipo && f.visivelSe(tipo)))) s += f.peso;
    }
    return s;
  }, [flags, tipo]);

  const nivel = nivelScore(score);

  const secoesVisiveis = useMemo<SecaoId[]>(
    () => (tipo ? SECOES_POR_TIPO[tipo] : []),
    [tipo],
  );

  const secoesAtivas = SECOES.filter((s) => secoesVisiveis.includes(s.id));

  const totalSec = secoesAtivas.length + 2; // identificação + sec + flags + nexo
  const respSec = useMemo(() => {
    let n = 0;
    if (valores.id_nome_associacao) n++;
    for (const s of secoesAtivas) {
      if (s.campos.some((c) => valores[c.id])) n++;
    }
    return n;
  }, [valores, secoesAtivas]);
  const progresso = totalSec > 0 ? Math.round((respSec / totalSec) * 100) : 0;

  const enviar = useMutation({
    mutationFn: async () => {
      if (!tipo) throw new Error("Selecione o tipo de sinistro");
      if (!valores.id_nome_associacao) throw new Error("Informe o nome da associação");
      if (!valores.id_protocolo) throw new Error("Informe o protocolo");
      if (!valores.par_parecer) throw new Error("Informe o parecer do analista");
      if (!valores.par_fundamentacao) throw new Error("Informe a fundamentação");
      if (!valores.par_comite) throw new Error("Informe a conclusão do comitê");

      const dados = {
        _tipo_sinistro: tipo,
        _score_risco: score,
        _nivel_risco: nivel.label,
        _red_flags_marcadas: Object.keys(flags).filter((k) => flags[k]),
        ...valores,
      };

      const { error } = await supabase.from("formulario_respostas").insert({
        formulario_id: form.id,
        user_agent: navigator.userAgent,
        dados,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEnviado(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.success("Formulário enviado com sucesso para o comitê.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (enviado) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 p-10 text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 mx-auto text-green-600" />
          <h1 className="text-2xl font-bold">Análise enviada ao comitê</h1>
          <p className="text-sm text-stone-600">
            Score final: <span className="font-semibold" style={{ color: nivel.cor }}>{score} · {nivel.label}</span>
          </p>
          <Button onClick={() => window.location.reload()} className="rounded-md bg-stone-900 hover:bg-stone-700">
            Nova análise
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-[14px] text-stone-800">
      {/* Header fixo Vangard */}
      <header className="sticky top-0 z-50 bg-stone-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img src={headerLogo} alt="Vangard" className="h-8 object-contain bg-white/95 rounded-md px-2 py-1" />
            <div className="min-w-0">
              <div className="font-semibold text-base truncate">{headerTitulo}</div>
              <div className="text-[11px] text-stone-300 truncate">
                Antifraude · Nexo Causal · Comitê de Eventos
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-stone-400">Score de risco</div>
            <div className="text-xl font-bold tabular-nums" style={{ color: nivel.cor }}>
              {score} <span className="text-xs font-medium">· {nivel.label}</span>
            </div>
          </div>
        </div>
        <div className="h-[3px] bg-stone-800">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${progresso}%` }} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Seção 1 — Identificação */}
        <Secao id="identificacao" titulo="Identificação do caso" cor="gray" icone={<Shield className="h-4 w-4" />} aberta={!!abertas.identificacao} onToggle={() => toggleSec("identificacao")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Nome da associação" req>
              <Input value={valores.id_nome_associacao || ""} onChange={(e) => set("id_nome_associacao", e.target.value)} />
            </Campo>
            <Campo label="Protocolo do evento" req>
              <Input value={valores.id_protocolo || ""} onChange={(e) => set("id_protocolo", e.target.value)} placeholder="SIN-2024-00123" />
            </Campo>
            <Campo label="Analista responsável" req>
              <Input value={valores.id_analista || ""} onChange={(e) => set("id_analista", e.target.value)} />
            </Campo>
            <Campo label="Regional">
              <Input value={valores.id_regional || ""} onChange={(e) => set("id_regional", e.target.value)} />
            </Campo>
            <Campo label="Data de abertura da análise">
              <Input type="date" value={valores.id_data_abertura || ""} onChange={(e) => set("id_data_abertura", e.target.value)} />
            </Campo>
            <Campo label="Data do 1º contato do associado">
              <Input type="date" value={valores.id_data_1contato || ""} onChange={(e) => set("id_data_1contato", e.target.value)} />
            </Campo>
            <Campo label="Tipo de acionamento">
              <RadioInline name="id_acionamento" value={valores.id_acionamento || ""} onChange={(v) => set("id_acionamento", v)} opcoes={["Associado", "Terceiro", "Associado e terceiro"]} />
            </Campo>
            <Campo label="Nome do acionante">
              <Input value={valores.id_acionante || ""} onChange={(e) => set("id_acionante", e.target.value)} />
            </Campo>
          </div>

          <div className="pt-4 space-y-3 border-t border-stone-200">
            <div className="text-sm font-semibold">Tipo de sinistro</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIPOS.map((t) => {
                const sel = tipo === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    className={`text-left p-3 rounded-lg transition-all ${sel ? "border-2 border-stone-900 bg-white shadow-sm" : "border border-stone-200 bg-stone-50 hover:border-stone-400"}`}
                  >
                    <div className="text-2xl">{t.icone}</div>
                    <div className="font-semibold text-sm mt-1">{t.nome}</div>
                    <div className="text-[11px] text-stone-500 leading-tight">{t.descricao}</div>
                  </button>
                );
              })}
            </div>
            {tipo && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs">
                Formulário configurado para: <strong className="uppercase">{TIPOS.find((t) => t.value === tipo)?.nome}</strong>
              </div>
            )}
          </div>
        </Secao>

        {/* Seções dinâmicas */}
        {tipo &&
          secoesAtivas
            .filter((s) => s.id !== "flags" && s.id !== "nexo" && s.id !== "parecer")
            .map((s) => (
              <Secao key={s.id} id={s.id} titulo={s.titulo} cor={s.cor} aberta={abertas[s.id] !== false} onToggle={() => toggleSec(s.id)}>
                <div className="grid sm:grid-cols-2 gap-4">
                  {s.campos.filter((c) => !c.visivelSe || c.visivelSe(tipo)).map((c) => (
                    <CampoRender key={c.id} campo={c} valor={valores[c.id]} onChange={(v) => set(c.id, v)} />
                  ))}
                </div>
              </Secao>
            ))}

        {/* Seção Red Flags */}
        {tipo && secoesVisiveis.includes("flags") && (
          <Secao id="flags" titulo="Checklist de red flags" cor="red" icone={<Flag className="h-4 w-4" />} aberta={abertas.flags !== false} onToggle={() => toggleSec("flags")}>
            {Object.entries(
              RED_FLAGS.filter((f) => !f.visivelSe || f.visivelSe(tipo)).reduce<Record<string, typeof RED_FLAGS>>((acc, f) => {
                (acc[f.grupo] ||= []).push(f);
                return acc;
              }, {}),
            ).map(([grupo, lista]) => (
              <div key={grupo} className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">{grupo}</div>
                <div className="space-y-1.5">
                  {lista.map((f) => (
                    <label key={f.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-red-50/50 cursor-pointer transition-colors">
                      <Checkbox checked={!!flags[f.id]} onCheckedChange={(c) => setFlags((p) => ({ ...p, [f.id]: !!c }))} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                          {f.label}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">+{f.peso}</span>
                        </div>
                        <div className="text-xs text-stone-500">{f.descricao}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <ScoreAntifraude score={score} />
          </Secao>
        )}

        {/* Seção Nexo Causal */}
        {tipo && secoesVisiveis.includes("nexo") && (
          <Secao id="nexo" titulo="Protocolo de nexo causal" cor="blue" aberta={abertas.nexo !== false} onToggle={() => toggleSec("nexo")}>
            <div className="space-y-3">
              {NEXO_STEPS.map((n, idx) => (
                <div key={n.id} className="flex items-start gap-3 p-3 rounded-lg border border-stone-200 bg-stone-50/60">
                  <div className="h-7 w-7 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{n.titulo}</div>
                    <div className="text-xs text-stone-500 mb-2">{n.descricao}</div>
                    <Select value={valores[n.id] || ""} onValueChange={(v) => set(n.id, v)}>
                      <SelectTrigger className="bg-white"><SelectValue placeholder="Avaliar..." /></SelectTrigger>
                      <SelectContent>
                        {n.opcoes.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </Secao>
        )}

        {/* Seção Parecer */}
        {tipo && secoesVisiveis.includes("parecer") && (
          <Secao id="parecer" titulo="Parecer final" cor="red" aberta={abertas.parecer !== false} onToggle={() => toggleSec("parecer")}>
            <div className="grid sm:grid-cols-2 gap-4">
              {SECOES.find((x) => x.id === "parecer")!.campos.map((c) => (
                <CampoRender key={c.id} campo={c} valor={valores[c.id]} onChange={(v) => set(c.id, v)} fullSe={c.tipo === "textarea"} />
              ))}
            </div>

            <div className="pt-4 border-t border-stone-200 flex justify-end">
              <Button disabled={enviar.isPending} onClick={() => enviar.mutate()} className="bg-stone-900 hover:bg-stone-700 text-white rounded-md px-6">
                {enviar.isPending ? "Enviando..." : "Enviar para o comitê"}
              </Button>
            </div>
          </Secao>
        )}

        {!tipo && (
          <div className="text-center text-sm text-stone-500 py-8">
            Selecione o tipo de sinistro acima para liberar as demais seções.
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] text-stone-500 py-6">
        Processado pela plataforma <span className="font-medium">Uon1</span> · Vangard
      </footer>
    </div>
  );
}

/* ─────────── átomos ─────────── */

function Secao({
  id,
  titulo,
  cor,
  icone,
  children,
  aberta,
  onToggle,
}: {
  id: string;
  titulo: string;
  cor: string;
  icone?: React.ReactNode;
  children: React.ReactNode;
  aberta: boolean;
  onToggle: () => void;
}) {
  return (
    <section id={id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-stone-50 transition-colors text-left">
        <span className={`h-8 w-8 rounded-md flex items-center justify-center ${corMap[cor] || corMap.gray}`}>
          {icone || <span className="text-xs font-bold">{titulo.charAt(0)}</span>}
        </span>
        <span className="flex-1 font-semibold text-sm">{titulo}</span>
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      {aberta && <div className="px-5 pb-5 pt-2 border-t border-stone-100">{children}</div>}
    </section>
  );
}

function Campo({ label, req, hint, badge, children, full }: { label: string; req?: boolean; hint?: string; badge?: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs font-medium text-stone-700 flex items-center gap-2">
        {label}
        {req && <span className="text-red-600">*</span>}
        {badge && <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeMap[badge]}`}>{badge.toUpperCase()}</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-stone-500">{hint}</p>}
    </div>
  );
}

function RadioInline({ name, value, onChange, opcoes }: { name: string; value: string; onChange: (v: string) => void; opcoes: string[] }) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-lg p-2.5 flex flex-wrap gap-3">
      {opcoes.map((o) => (
        <label key={o} className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="accent-stone-900" />
          {o}
        </label>
      ))}
    </div>
  );
}

function CampoRender({ campo, valor, onChange, fullSe }: { campo: Campo; valor: any; onChange: (v: any) => void; fullSe?: boolean }) {
  const full = fullSe || campo.tipo === "textarea";
  const inner = (() => {
    switch (campo.tipo) {
      case "text":
        return <Input value={valor || ""} onChange={(e) => onChange(e.target.value)} />;
      case "textarea":
        return <Textarea value={valor || ""} onChange={(e) => onChange(e.target.value)} rows={3} />;
      case "date":
        return <Input type="date" value={valor || ""} onChange={(e) => onChange(e.target.value)} />;
      case "time":
        return <Input type="time" value={valor || ""} onChange={(e) => onChange(e.target.value)} />;
      case "number":
        return <Input type="number" value={valor || ""} onChange={(e) => onChange(e.target.value)} />;
      case "placa":
        return <Input value={valor || ""} onChange={(e) => onChange(maskPlaca(e.target.value))} maxLength={8} placeholder="ABC-1D23" className="uppercase tracking-widest" />;
      case "cpfcnpj":
        return <Input value={valor || ""} onChange={(e) => onChange((e.target.value.replace(/\D/g, "").length > 11 ? maskCNPJ : maskCPF)(e.target.value))} placeholder="000.000.000-00 ou 00.000.000/0000-00" />;
      case "select":
        return (
          <Select value={valor || ""} onValueChange={onChange}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {(campo.opcoes || []).map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
            </SelectContent>
          </Select>
        );
      case "radio":
        return <RadioInline name={campo.id} value={valor || ""} onChange={onChange} opcoes={campo.opcoes || []} />;
      case "check": {
        const arr: string[] = Array.isArray(valor) ? valor : [];
        return (
          <div className="space-y-1">
            {(campo.opcoes || []).map((o) => {
              const sel = arr.includes(o);
              return (
                <label key={o} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={sel} onCheckedChange={(c) => onChange(c ? [...arr, o] : arr.filter((x) => x !== o))} />
                  {o}
                </label>
              );
            })}
          </div>
        );
      }
    }
  })();

  return (
    <Campo label={campo.label} req={campo.obrigatorio} hint={campo.hint} badge={campo.badge} full={full}>
      {inner}
    </Campo>
  );
}

function ScoreAntifraude({ score }: { score: number }) {
  const nivel = nivelScore(score);
  const pct = Math.min(100, (score / 20) * 100);
  return (
    <div className="mt-4 p-4 rounded-lg border border-stone-200 bg-stone-50">
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-stone-500">Score antifraude</div>
          <div className="text-3xl font-bold tabular-nums" style={{ color: nivel.cor }}>
            {score}
          </div>
        </div>
        <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: `${nivel.cor}22`, color: nivel.cor }}>
          {nivel.label}
        </span>
      </div>
      <Progress value={pct} className="h-2" />
      {score > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-stone-700">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <span>Foram identificados indicadores que pedem atenção. Reveja a checklist antes do envio.</span>
        </div>
      )}
    </div>
  );
}