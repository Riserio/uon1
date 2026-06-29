import { useMemo, useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Shield } from "lucide-react";
import { INITIAL_FORM, FormDataFluxos } from "./fluxos/types";
import { classificar, RED_FLAGS, SECOES_POR_TIPO, getClassificacaoStyle } from "./fluxos/motor";
import {
  S01_Identificacao,
  S02_Associado,
  S03_Condutor,
  S04_Veiculo,
  S05_Evento,
  S06_BO,
  S07_Fotos,
  S08_Terceiro,
  S09_Entrevista,
  S10_RedFlags,
  S11_Nexo,
  S12_Parecer,
} from "./fluxos/sections";

export default function FormularioFluxos({ form }: { form: any }) {
  const cor = form?.cor_tema || "#1c1917";
  const storageKey = `fluxos_${form?.id}_rascunho`;

  const [data, setData] = useState<FormDataFluxos>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...INITIAL_FORM, ...JSON.parse(saved) };
    } catch {}
    return INITIAL_FORM;
  });
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {}
  }, [data, storageKey]);

  const update = (patch: Partial<FormDataFluxos>) => setData((d) => ({ ...d, ...patch }));

  const resultado = useMemo(() => classificar(data), [data]);

  const scoreAntifraude = useMemo(() => {
    return RED_FLAGS.reduce((s, f) => s + (data.redFlags?.[f.id] ? f.peso : 0), 0);
  }, [data.redFlags]);

  const visivel = (sec: string) => data.tipoSinistro && SECOES_POR_TIPO[data.tipoSinistro]?.includes(sec);

  const progresso = useMemo(() => {
    const campos = [
      data.nomeAssociacao,
      data.analista,
      data.dataAbertura,
      data.dataPrimeiroContato,
      data.tipoSinistro,
      data.dataEvento,
      data.dinamica,
      data.endereco,
      data.relatoBO,
      data.obsEntrevista,
      data.fundamentacao,
      data.conclusaoComite,
    ];
    const ok = campos.filter((c) => c).length;
    return Math.round((ok / campos.length) * 100);
  }, [data]);

  const enviar = useMutation({
    mutationFn: async () => {
      const obrig = [
        ["nomeAssociacao", "Nome da associação"],
        ["analista", "Analista"],
        ["dataAbertura", "Data de abertura"],
        ["dataPrimeiroContato", "Data do 1º contato"],
        ["tipoSinistro", "Tipo de sinistro"],
        ["dataEvento", "Data do evento"],
        ["dinamica", "Descrição da dinâmica"],
        ["endereco", "Endereço"],
        ["relatoBO", "Relato do BO"],
        ["obsEntrevista", "Observações da entrevista"],
        ["fundamentacao", "Fundamentação"],
        ["conclusaoComite", "Conclusão do comitê"],
      ] as const;
      for (const [k, label] of obrig) {
        if (!(data as any)[k]) throw new Error(`Preencha: ${label}`);
      }
      const { error } = await supabase.from("formulario_respostas").insert({
        formulario_id: form.id,
        user_agent: navigator.userAgent,
        dados: { ...data, _classificacao: resultado, _scoreAntifraude: scoreAntifraude } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEnviado(true);
      try { localStorage.removeItem(storageKey); } catch {}
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const vangardLogo = "/images/vangard-logo.png";
  const parceiroLogo: string | null = form?.logo_url || null;
  const s = getClassificacaoStyle(resultado.classificacao);

  if (enviado) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 p-10 text-center space-y-4 shadow-sm">
          <CheckCircle2 className="h-14 w-14 mx-auto" style={{ color: cor }} />
          <h1 className="text-2xl font-bold">Caso enviado ao comitê</h1>
          <p className="text-sm text-stone-600">Classificação: <strong className={s.text}>{s.label}</strong> · Score {resultado.scoreNormalizado > 0 ? "+" : ""}{resultado.scoreNormalizado}</p>
          <Button onClick={() => { setData(INITIAL_FORM); setEnviado(false); }} className="rounded-md text-white hover:opacity-90" style={{ backgroundColor: cor }}>
            Novo caso
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-[14px] text-stone-800">
      <header className="sticky top-0 z-50 bg-white border-b border-stone-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img src={vangardLogo} alt="Vangard" className="h-9 object-contain" />
            {parceiroLogo && (
              <>
                <span className="h-9 w-px bg-stone-300" aria-hidden />
                <img src={parceiroLogo} alt="Parceiro" className="h-9 object-contain" />
              </>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-stone-500 flex items-center gap-1 justify-end">
                <Shield className="h-3 w-3" /> Progresso
              </div>
              <div className="text-lg font-bold tabular-nums" style={{ color: cor }}>{progresso}%</div>
            </div>
          </div>
        </div>
        <Progress value={progresso} className="h-[3px] rounded-none bg-stone-100 [&>div]:bg-current" style={{ color: cor }} />
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-stone-900">{form?.titulo || "Análise de Sinistro"}</h1>
          {form?.descricao && <p className="text-sm text-stone-600 mt-1">{form.descricao}</p>}
        </div>
        <div className="grid grid-cols-1 gap-6 items-start">
          <form
            onSubmit={(e) => { e.preventDefault(); enviar.mutate(); }}
            className="space-y-4"
          >
            <S01_Identificacao form={data} update={update} />
            {data.tipoSinistro && (
              <>
                {visivel("associado") && <S02_Associado form={data} update={update} />}
                {visivel("condutor") && <S03_Condutor form={data} update={update} />}
                {visivel("veiculo") && <S04_Veiculo form={data} update={update} />}
                {visivel("evento") && <S05_Evento form={data} update={update} />}
                {visivel("bo") && <S06_BO form={data} update={update} />}
                {visivel("fotos") && <S07_Fotos form={data} update={update} />}
                {visivel("terceiro") && <S08_Terceiro form={data} update={update} />}
                {visivel("entrevista") && <S09_Entrevista form={data} update={update} />}
                {visivel("flags") && <S10_RedFlags form={data} update={update} scoreAntifraude={scoreAntifraude} />}
                {visivel("nexo") && <S11_Nexo form={data} update={update} />}
                {visivel("parecer") && <S12_Parecer form={data} update={update} classificacaoAuto={resultado.classificacao} />}
              </>
            )}
            {!data.tipoSinistro && (
              <div className="bg-white border-2 border-dashed border-stone-300 rounded-xl p-8 text-center text-sm text-stone-500">
                Selecione um tipo de sinistro acima para liberar as seções de análise.
              </div>
            )}
            {data.tipoSinistro && (
              <div className="flex justify-end pt-2 pb-8">
                <Button type="submit" disabled={enviar.isPending} className="text-white rounded-xl px-8 py-4 text-base font-semibold hover:opacity-90" style={{ backgroundColor: cor }}>
                  {enviar.isPending ? "Enviando..." : "Enviar caso ao comitê"}
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}