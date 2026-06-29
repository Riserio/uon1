import type { ResultadoClassificacao } from "./types";
import { getClassificacaoStyle } from "./motor";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export default function PainelClassificacao({
  resultado,
  scoreAntifraude,
}: {
  resultado: ResultadoClassificacao;
  scoreAntifraude: number;
}) {
  const s = getClassificacaoStyle(resultado.classificacao);
  const score = resultado.scoreNormalizado;
  const scorePct = Math.round(((score + 100) / 200) * 100);
  const antifNivel =
    scoreAntifraude <= 5
      ? { cor: "bg-green-500", text: "Baixo", textCor: "text-green-700" }
      : scoreAntifraude <= 12
      ? { cor: "bg-amber-500", text: "Alto", textCor: "text-amber-700" }
      : { cor: "bg-red-600", text: "Crítico", textCor: "text-red-700" };

  return (
    <div className={`${s.bg} ${s.border} border-2 rounded-2xl p-5 space-y-4 transition-all duration-300 shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{s.icon}</span>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Classificação</div>
          <div className={`text-lg font-bold ${s.text}`}>{s.label}</div>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-stone-500">Score</span>
          <span className={`text-3xl font-bold tabular-nums ${s.text}`}>
            {score > 0 ? "+" : ""}
            {score}
          </span>
        </div>
        <div className="relative h-2 bg-stone-200 rounded-full mt-2 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-full w-px bg-stone-400/40" />
          <div
            className={`absolute top-0 h-full transition-all duration-500 ${score >= 0 ? "bg-green-500" : "bg-red-500"}`}
            style={{
              left: score >= 0 ? "50%" : `${scorePct}%`,
              width: `${Math.abs(50 - scorePct)}%`,
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-white ${s.text}`}>
          Confiança: {resultado.confianca}
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full bg-white ${antifNivel.textCor}`}>
          Antifraude: {scoreAntifraude} · {antifNivel.text}
        </span>
      </div>

      {resultado.gatilhosAtivos.length > 0 && (
        <div className="bg-red-100 border border-red-300 rounded-lg p-3 space-y-1 animate-in fade-in">
          <div className="text-[10px] font-bold uppercase tracking-wider text-red-700 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Gatilhos ativos
          </div>
          {resultado.gatilhosAtivos.map((g) => (
            <div key={g.id} className="text-[11px] text-red-900">• {g.label}</div>
          ))}
        </div>
      )}

      {resultado.classificacao && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Ação recomendada</div>
          <p className="text-[12px] text-stone-700 leading-snug">{resultado.acaoRecomendada}</p>
        </div>
      )}

      {resultado.prazoInterno && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-white rounded-md p-2 border border-stone-200">
            <div className="text-stone-500 text-[9px] uppercase">Prazo interno</div>
            <div className="font-medium text-stone-800">{resultado.prazoInterno}</div>
          </div>
          <div className="bg-white rounded-md p-2 border border-stone-200">
            <div className="text-stone-500 text-[9px] uppercase">Comunicação</div>
            <div className="font-medium text-stone-800">{resultado.prazoComunicacao}</div>
          </div>
          <div className="col-span-2 bg-white rounded-md p-2 border border-stone-200">
            <div className="text-stone-500 text-[9px] uppercase">Alçada</div>
            <div className="font-medium text-stone-800">{resultado.alcada}</div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-stone-500">Dimensões</div>
        {resultado.dimensoes.map((d) => {
          const rangeMax = d.maxPontos;
          const pct = Math.min(100, (Math.abs(d.pontos) / rangeMax) * 100);
          const cor = d.pontos > 0 ? "bg-green-500" : d.pontos < 0 ? "bg-red-500" : "bg-stone-300";
          return (
            <div key={d.id} className="text-[11px]">
              <div className="flex justify-between mb-0.5">
                <span className="text-stone-700">
                  {d.id} {d.label} <span className="text-stone-400">({Math.round(d.peso * 100)}%)</span>
                </span>
                <span className={`tabular-nums font-medium ${d.pontos > 0 ? "text-green-700" : d.pontos < 0 ? "text-red-700" : "text-stone-500"}`}>
                  {d.pontos > 0 ? "+" : ""}
                  {d.pontos}
                </span>
              </div>
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div className={`h-full ${cor} transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {resultado.sustentaculos.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Sustentáculos</div>
          {resultado.sustentaculos.map((s, i) => (
            <div key={i} className="text-[11px] text-stone-700 flex items-start gap-1.5">
              <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0 mt-0.5" />
              <span>{s}</span>
            </div>
          ))}
        </div>
      )}

      {resultado.pontosAtencao.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-stone-500">Pontos de atenção</div>
          {resultado.pontosAtencao.map((p, i) => (
            <div key={i} className="text-[11px] text-stone-700 flex items-start gap-1.5">
              <XCircle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
              <span>{p}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}