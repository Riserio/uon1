import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Layers, Database, Workflow, Calculator, Plug, Shield, AlertTriangle,
  Search, Info, OctagonAlert, FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAPITULOS, ATUALIZADO_EM, type DocBloco, type DocCapitulo } from "@/content/documentacao";

const ICONES = {
  layers: Layers, database: Database, workflow: Workflow,
  calculator: Calculator, plug: Plug, shield: Shield, alert: AlertTriangle,
} as const;

const ALERTA = {
  info: { cls: "border-blue-500/30 bg-blue-500/5", icon: Info, cor: "text-blue-600" },
  atencao: { cls: "border-amber-500/30 bg-amber-500/5", icon: AlertTriangle, cor: "text-amber-600" },
  critico: { cls: "border-red-500/30 bg-red-500/5", icon: OctagonAlert, cor: "text-red-600" },
} as const;

function Bloco({ b }: { b: DocBloco }) {
  if (b.tipo === "alerta") {
    const cfg = ALERTA[b.nivel ?? "info"];
    const Icon = cfg.icon;
    return (
      <div className={`rounded-xl border p-4 ${cfg.cls}`}>
        <div className="flex items-start gap-2.5">
          <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.cor}`} />
          <div className="min-w-0">
            {b.titulo && <p className={`text-sm font-semibold mb-1 ${cfg.cor}`}>{b.titulo}</p>}
            <p className="text-sm text-muted-foreground leading-relaxed">{b.conteudo as string}</p>
          </div>
        </div>
      </div>
    );
  }

  if (b.tipo === "tabela") {
    const t = b.conteudo as { cabecalho: string[]; linhas: string[][] };
    return (
      <div className="space-y-2">
        {b.titulo && <p className="text-sm font-semibold">{b.titulo}</p>}
        <div className="rounded-xl border border-border/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {t.cabecalho.map((h) => (
                  <th key={h} className="text-left font-medium px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.linhas.map((linha, i) => (
                <tr key={i} className="border-t border-border/40">
                  {linha.map((c, j) => (
                    <td key={j} className={`px-3 py-2 align-top ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (b.tipo === "lista") {
    return (
      <div className="space-y-2">
        {b.titulo && <p className="text-sm font-semibold">{b.titulo}</p>}
        <ul className="space-y-1.5">
          {(b.conteudo as string[]).map((item, i) => (
            <li key={i} className="text-sm text-muted-foreground leading-relaxed flex gap-2">
              <span className="text-primary mt-1.5 shrink-0">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (b.tipo === "codigo") {
    return (
      <pre className="rounded-xl border border-border/60 bg-muted/40 p-3 text-xs overflow-x-auto">
        <code>{b.conteudo as string}</code>
      </pre>
    );
  }

  return (
    <div className="space-y-1.5">
      {b.titulo && <p className="text-sm font-semibold">{b.titulo}</p>}
      <p className="text-sm text-muted-foreground leading-relaxed">{b.conteudo as string}</p>
    </div>
  );
}

/** Texto de um capítulo inteiro, para a busca. */
function textoDe(cap: DocCapitulo): string {
  const partes: string[] = [cap.titulo];
  for (const s of cap.secoes) {
    partes.push(s.titulo, s.resumo);
    for (const b of s.blocos) {
      if (b.titulo) partes.push(b.titulo);
      if (typeof b.conteudo === "string") partes.push(b.conteudo);
      else if (Array.isArray(b.conteudo)) partes.push(b.conteudo.join(" "));
      else partes.push(b.conteudo.cabecalho.join(" "), b.conteudo.linhas.flat().join(" "));
    }
  }
  return partes.join(" ").toLowerCase();
}

export default function Documentacao() {
  const [capAtivo, setCapAtivo] = useState(CAPITULOS[0].id);
  const [busca, setBusca] = useState("");

  const termo = busca.trim().toLowerCase();
  const capitulos = useMemo(
    () => (termo ? CAPITULOS.filter((c) => textoDe(c).includes(termo)) : CAPITULOS),
    [termo],
  );
  const atual = capitulos.find((c) => c.id === capAtivo) ?? capitulos[0];

  const exportar = () => {
    const linhas: string[] = [`# Documentação do sistema`, `Atualizado em ${ATUALIZADO_EM}`, ""];
    for (const c of CAPITULOS) {
      linhas.push(`## ${c.titulo}`, "");
      for (const s of c.secoes) {
        linhas.push(`### ${s.titulo}`, `_${s.resumo}_`, "");
        for (const b of s.blocos) {
          if (b.titulo) linhas.push(`**${b.titulo}**`, "");
          if (typeof b.conteudo === "string") linhas.push(b.conteudo, "");
          else if (Array.isArray(b.conteudo)) {
            linhas.push(...b.conteudo.map((i) => `- ${i}`), "");
          } else {
            linhas.push(`| ${b.conteudo.cabecalho.join(" | ")} |`);
            linhas.push(`|${b.conteudo.cabecalho.map(() => "---").join("|")}|`);
            linhas.push(...b.conteudo.linhas.map((l) => `| ${l.join(" | ")} |`), "");
          }
        }
      }
    }
    const blob = new Blob([linhas.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `documentacao-sistema-${ATUALIZADO_EM.replace(/\//g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Documentação do sistema</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Arquitetura, regras de negócio e comportamento real das integrações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]">Atualizado em {ATUALIZADO_EM}</Badge>
            <Button variant="outline" size="sm" onClick={exportar} className="gap-1.5">
              <FileDown className="h-3.5 w-3.5" /> Exportar
            </Button>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar na documentação (ex.: truncamento, inadimplência, cache)"
            className="pl-9"
          />
        </div>
      </div>

      {capitulos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
          <p className="text-sm text-muted-foreground">Nada encontrado para "{busca}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5">
          <div className="space-y-1">
            {capitulos.map((c) => {
              const Icon = ICONES[c.icone];
              const ativo = atual?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setCapAtivo(c.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    ativo ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.titulo}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-6 min-w-0">
            {atual?.secoes.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border/50 bg-card p-5 sm:p-6 space-y-4">
                <div>
                  <h3 className="font-semibold">{s.titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.resumo}</p>
                </div>
                {s.blocos.map((b, i) => <Bloco key={i} b={b} />)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
