import { useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Ban, Download, FileUp, Loader2, RotateCcw, Search, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const CARTAO = "rounded-3xl border border-border/40 bg-card shadow-sm";

export interface Prospect {
  id: string;
  associacao: string;
  email: string;
  email_alternativo: string | null;
  cidade_uf: string | null;
  uf: string | null;
  site: string | null;
  cnpj: string | null;
  fonte: string | null;
  observacoes: string | null;
  status: "ativo" | "descadastrado" | "invalido";
  ultimo_envio_em: string | null;
  criado_em: string;
}

const STATUS: Record<Prospect["status"], { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  descadastrado: { rotulo: "Descadastrado", classe: "bg-muted text-muted-foreground" },
  invalido: { rotulo: "E-mail inválido", classe: "bg-red-500/10 text-red-700 dark:text-red-300" },
};

const EMAIL = /^[^\s@;,]+@[^\s@;,]+\.[a-z]{2,}$/i;
const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Cabeçalhos aceitos na importação (a planilha de prospecção usa os primeiros de cada lista). */
const COLUNAS: Record<string, string[]> = {
  associacao: ["associacao", "nome", "nome fantasia", "razao social", "entidade", "empresa"],
  email: ["e-mail principal", "email principal", "e-mail", "email"],
  email_alternativo: ["e-mails alternativos", "emails alternativos", "e-mail alternativo", "email alternativo"],
  cidade_uf: ["cidade/uf", "cidade", "municipio", "local"],
  uf: ["uf", "estado"],
  site: ["site", "website", "url"],
  cnpj: ["cnpj"],
  fonte: ["fonte do e-mail", "fonte do email", "fonte"],
  observacoes: ["observacoes", "observacao", "obs"],
};
const ufDe = (cidadeUf?: string | null, uf?: string | null) => {
  const direto = (uf ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(direto)) return direto;
  const m = (cidadeUf ?? "").trim().match(/(?:\/|-|,|\s)([A-Za-z]{2})$/) ?? (cidadeUf ?? "").trim().match(/^([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : null;
};
const texto = (v: unknown) => {
  const t = String(v ?? "").trim();
  return t && t !== "—" ? t : null;
};

type Linha = Omit<Prospect, "id" | "status" | "ultimo_envio_em" | "criado_em">;

/** Lê as linhas (primeira linha = cabeçalho) e devolve os prospects válidos. */
function interpretar(matriz: unknown[][]): { linhas: Linha[]; semEmail: number } {
  if (matriz.length < 2) return { linhas: [], semEmail: 0 };
  const cab = matriz[0].map((c) => normalizar(String(c ?? "")));
  const idx: Record<string, number> = {};
  for (const [campo, nomes] of Object.entries(COLUNAS)) {
    const i = cab.findIndex((h) => nomes.includes(h));
    if (i >= 0) idx[campo] = i;
  }
  if (idx.email === undefined) throw new Error("Não encontrei a coluna de e-mail (ex.: \"E-mail principal\").");
  const pega = (l: unknown[], campo: string) => (idx[campo] === undefined ? null : texto(l[idx[campo]]));
  let semEmail = 0;
  const linhas: Linha[] = [];
  for (const l of matriz.slice(1)) {
    if (!l || l.every((c) => !texto(c))) continue;
    const emails = (pega(l, "email") ?? "").split(/[;,\s]+/).filter((e) => EMAIL.test(e));
    if (!emails.length) {
      semEmail++;
      continue;
    }
    const alternativos = [...emails.slice(1), ...(pega(l, "email_alternativo") ?? "").split(/[;,\s]+/).filter((e) => EMAIL.test(e))];
    const cidade = pega(l, "cidade_uf");
    linhas.push({
      associacao: pega(l, "associacao") ?? emails[0].split("@")[1],
      email: emails[0].toLowerCase(),
      email_alternativo: alternativos.length ? alternativos.join("; ").toLowerCase() : null,
      cidade_uf: cidade,
      uf: ufDe(cidade, pega(l, "uf")),
      site: pega(l, "site"),
      cnpj: pega(l, "cnpj"),
      fonte: pega(l, "fonte"),
      observacoes: pega(l, "observacoes"),
    });
  }
  return { linhas, semEmail };
}

function csv(linhas: (string | null | undefined)[][]) {
  return linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
}
function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Aba Prospects do Radar público: importação, busca e seleção para campanhas. */
export function ProspectsRadar({
  prospects,
  carregando,
  emailsAssinantes,
  selecionados,
  onSelecionar,
  onMudou,
}: {
  prospects: Prospect[];
  carregando: boolean;
  emailsAssinantes: Set<string>;
  selecionados: string[];
  onSelecionar: (ids: string[]) => void;
  onMudou: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | Prospect["status"]>("ativo");
  const [importando, setImportando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const existentes = useMemo(() => new Set(prospects.map((p) => p.email.toLowerCase())), [prospects]);
  const ufs = useMemo(() => [...new Set(prospects.map((p) => p.uf).filter(Boolean) as string[])].sort(), [prospects]);
  const contagem = useMemo(() => {
    const c = { ativo: 0, descadastrado: 0, invalido: 0 };
    prospects.forEach((p) => c[p.status]++);
    return c;
  }, [prospects]);
  const lista = useMemo(() => {
    const t = normalizar(busca);
    return prospects.filter(
      (p) =>
        (filtroStatus === "todos" || p.status === filtroStatus) &&
        (uf === "todas" || p.uf === uf) &&
        (!t || [p.associacao, p.email, p.email_alternativo, p.cidade_uf, p.cnpj, p.site].some((x) => normalizar(x ?? "").includes(t))),
    );
  }, [prospects, busca, uf, filtroStatus]);
  const ativosDaLista = lista.filter((p) => p.status === "ativo").map((p) => p.id);
  const todosMarcados = ativosDaLista.length > 0 && ativosDaLista.every((id) => selecionados.includes(id));

  const marcarTodos = (v: boolean) =>
    onSelecionar(v ? [...new Set([...selecionados, ...ativosDaLista])] : selecionados.filter((id) => !ativosDaLista.includes(id)));

  const mudarStatus = async (p: Prospect, status: Prospect["status"]) => {
    const { error } = await db.from("radar_prospects").update({ status, atualizado_em: new Date().toISOString() }).eq("id", p.id);
    if (error) return toast.error("Não foi possível alterar");
    if (status !== "ativo") onSelecionar(selecionados.filter((id) => id !== p.id));
    onMudou();
  };

  const excluir = async () => {
    setOcupado(true);
    for (let i = 0; i < selecionados.length; i += 500) {
      const { error } = await db.from("radar_prospects").delete().in("id", selecionados.slice(i, i + 500));
      if (error) {
        setOcupado(false);
        return toast.error("Não foi possível excluir");
      }
    }
    toast.success(`${selecionados.length} ${selecionados.length === 1 ? "prospect excluído" : "prospects excluídos"}`);
    onSelecionar([]);
    setConfirmarExclusao(false);
    setOcupado(false);
    onMudou();
  };

  return (
    <section className={`${CARTAO} overflow-hidden`}>
      <div className="px-5 py-4 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por associação, e-mail, cidade, CNPJ ou site" className="pl-9 rounded-full" />
        </div>
        <Select value={uf} onValueChange={setUf}>
          <SelectTrigger className="w-[120px] rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as UFs</SelectItem>
            {ufs.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1">
          {(
            [
              ["ativo", `Ativos (${contagem.ativo})`],
              ["descadastrado", `Descadastrados (${contagem.descadastrado})`],
              ["invalido", `Inválidos (${contagem.invalido})`],
              ["todos", "Todos"],
            ] as const
          ).map(([id, rot]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltroStatus(id)}
              aria-pressed={filtroStatus === id}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filtroStatus === id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
            >
              {rot}
            </button>
          ))}
        </div>
        <Button size="sm" className="rounded-full" onClick={() => setImportando(true)}>
          <Upload className="h-4 w-4 mr-1.5" /> Importar
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={!lista.length}
          onClick={() =>
            baixar(
              `radar-prospects-${format(new Date(), "yyyy-MM-dd")}.csv`,
              csv([
                ["Associação", "Cidade/UF", "E-mail principal", "E-mails alternativos", "Site", "CNPJ", "Fonte do e-mail", "Observações", "Situação", "Último envio"],
                ...lista.map((p) => [
                  p.associacao,
                  p.cidade_uf,
                  p.email,
                  p.email_alternativo,
                  p.site,
                  p.cnpj,
                  p.fonte,
                  p.observacoes,
                  STATUS[p.status].rotulo,
                  p.ultimo_envio_em ? format(parseISO(p.ultimo_envio_em), "dd/MM/yyyy HH:mm") : "",
                ]),
              ]),
            )
          }
        >
          <Download className="h-4 w-4 mr-1.5" /> Exportar
        </Button>
      </div>

      {selecionados.length > 0 && (
        <div className="mx-5 mb-3 rounded-2xl bg-primary/10 px-4 py-2 text-sm flex items-center justify-between gap-2 flex-wrap">
          <span>
            {selecionados.length} {selecionados.length === 1 ? "prospect selecionado" : "prospects selecionados"} para a próxima campanha.
          </span>
          <span className="flex items-center gap-3">
            {!confirmarExclusao ? (
              <button type="button" className="text-xs underline text-red-700" onClick={() => setConfirmarExclusao(true)}>
                Excluir selecionados
              </button>
            ) : (
              <span className="flex items-center gap-2 text-xs">
                Excluir {selecionados.length} de vez?
                <Button size="sm" variant="ghost" className="h-7 rounded-full" onClick={() => setConfirmarExclusao(false)} disabled={ocupado}>
                  Voltar
                </Button>
                <Button size="sm" variant="destructive" className="h-7 rounded-full" onClick={excluir} disabled={ocupado}>
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />} Excluir
                </Button>
              </span>
            )}
            <button type="button" className="text-xs underline" onClick={() => onSelecionar([])}>
              Limpar
            </button>
          </span>
        </div>
      )}

      <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2 w-10">
                <Checkbox checked={todosMarcados} disabled={!ativosDaLista.length} onCheckedChange={(v) => marcarTodos(v === true)} aria-label="Selecionar todos os ativos do filtro" />
              </th>
              <th className="text-left font-medium px-3 py-2">Associação</th>
              <th className="text-left font-medium px-3 py-2">Contato</th>
              <th className="text-left font-medium px-3 py-2">Local</th>
              <th className="text-left font-medium px-3 py-2">Situação</th>
              <th className="text-left font-medium px-3 py-2">Último envio</th>
              <th className="px-3 py-2 w-10" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </td>
              </tr>
            ) : !prospects.length ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                  Nenhum prospect ainda. Use <strong>Importar</strong> para carregar a planilha de prospecção (.xlsx ou .csv).
                </td>
              </tr>
            ) : !lista.length ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-muted-foreground">
                  Ninguém neste filtro.
                </td>
              </tr>
            ) : (
              lista.map((p) => (
                <tr key={p.id} className="border-t border-border/40">
                  <td className="px-5 py-2.5">
                    {p.status === "ativo" && (
                      <Checkbox
                        checked={selecionados.includes(p.id)}
                        onCheckedChange={(v) => onSelecionar(v === true ? [...selecionados, p.id] : selecionados.filter((x) => x !== p.id))}
                        aria-label={`Selecionar ${p.associacao}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block font-medium">{p.associacao}</span>
                    {p.site && (
                      <a href={/^https?:\/\//.test(p.site) ? p.site : `https://${p.site}`} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-muted-foreground hover:text-foreground">
                        {p.site.replace(/^https?:\/\//, "")}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <a href={`mailto:${p.email}`} className="block text-primary hover:underline">
                      {p.email}
                    </a>
                    {p.email_alternativo && <span className="block text-[11px] text-muted-foreground">{p.email_alternativo}</span>}
                    {emailsAssinantes.has(p.email.toLowerCase()) && <span className="block text-[11px] text-emerald-700">Já é assinante</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{p.cidade_uf ?? p.uf ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[p.status].classe}`} title={p.observacoes ?? undefined}>
                      {STATUS[p.status].rotulo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{p.ultimo_envio_em ? format(parseISO(p.ultimo_envio_em), "dd/MM/yyyy") : "—"}</td>
                  <td className="px-3 py-2.5">
                    {p.status === "ativo" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Marcar e-mail como inválido" onClick={() => mudarStatus(p, "invalido")}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    ) : p.status === "invalido" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Voltar a ativo" onClick={() => mudarStatus(p, "ativo")}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ImportarProspects
        aberto={importando}
        onFechar={() => setImportando(false)}
        existentes={existentes}
        emailsAssinantes={emailsAssinantes}
        onImportou={onMudou}
      />
    </section>
  );
}

function ImportarProspects({
  aberto,
  onFechar,
  existentes,
  emailsAssinantes,
  onImportou,
}: {
  aberto: boolean;
  onFechar: () => void;
  existentes: Set<string>;
  emailsAssinantes: Set<string>;
  onImportou: () => void;
}) {
  const [colado, setColado] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ novos: Linha[]; repetidos: number; assinantes: number; semEmail: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const limpar = () => {
    setColado("");
    setArquivo(null);
    setResultado(null);
    if (entrada.current) entrada.current.value = "";
  };
  const analisar = (matriz: unknown[][]) => {
    try {
      const { linhas, semEmail } = interpretar(matriz);
      const vistos = new Set<string>();
      let repetidos = 0;
      let assinantes = 0;
      const novos: Linha[] = [];
      for (const l of linhas) {
        if (existentes.has(l.email) || vistos.has(l.email)) repetidos++;
        else if (emailsAssinantes.has(l.email)) assinantes++;
        else novos.push(l);
        vistos.add(l.email);
      }
      setResultado({ novos, repetidos, assinantes, semEmail });
    } catch (e) {
      setResultado(null);
      toast.error(e instanceof Error ? e.message : "Não consegui ler o arquivo");
    }
  };
  const lerArquivo = async (f: File) => {
    setArquivo(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      // usa a aba "Prospects" se existir; senão a primeira
      const nome = wb.SheetNames.find((n) => normalizar(n) === "prospects") ?? wb.SheetNames[0];
      analisar(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false, defval: "" }));
    } catch {
      toast.error("Não consegui ler o arquivo. Use .xlsx ou .csv.");
    }
  };
  const lerColado = () => {
    const linhas = colado.split(/\r?\n/).filter((l) => l.trim());
    const sep = linhas[0]?.includes("\t") ? "\t" : linhas[0]?.includes(";") ? ";" : ",";
    analisar(linhas.map((l) => l.split(sep)));
  };

  const salvar = async () => {
    if (!resultado?.novos.length) return;
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    let incluidos = 0;
    for (let i = 0; i < resultado.novos.length; i += 500) {
      const lote = resultado.novos.slice(i, i + 500).map((l) => ({ ...l, criado_por: u.user?.id ?? null }));
      const { error } = await db.from("radar_prospects").insert(lote);
      if (error) {
        toast.error(`Parou em ${incluidos} incluídos: ${error.message}`);
        setSalvando(false);
        onImportou();
        return;
      }
      incluidos += lote.length;
    }
    toast.success(`${incluidos} ${incluidos === 1 ? "prospect importado" : "prospects importados"}`);
    setSalvando(false);
    limpar();
    onImportou();
    onFechar();
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!v) {
          limpar();
          onFechar();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar prospects</DialogTitle>
          <DialogDescription>
            Envie a planilha de prospecção (.xlsx ou .csv) ou cole as linhas copiadas dela. A primeira linha precisa ter os títulos das colunas: Associação, Cidade/UF, E-mail principal, E-mails
            alternativos, Site, Fonte do e-mail, Observações e CNPJ. Só a de e-mail é obrigatória.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input ref={entrada} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
          <Button variant="outline" className="w-full rounded-2xl h-14 border-dashed" onClick={() => entrada.current?.click()}>
            <FileUp className="h-5 w-5 mr-2" /> {arquivo ?? "Escolher arquivo"}
          </Button>
          <div className="space-y-1.5">
            <Label htmlFor="p-colar">Ou cole as linhas (com o cabeçalho)</Label>
            <Textarea id="p-colar" value={colado} onChange={(e) => setColado(e.target.value)} rows={4} placeholder={"Associação\tCidade/UF\tE-mail principal\nAPVS Brasil\tBelo Horizonte/MG\tatendimento@apvsbrasil.com.br"} />
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="rounded-full" disabled={!colado.trim()} onClick={lerColado}>
                Ler linhas coladas
              </Button>
            </div>
          </div>

          {resultado && (
            <div className="rounded-2xl bg-muted/50 px-4 py-3 text-sm space-y-1">
              <p>
                <strong>{resultado.novos.length}</strong> {resultado.novos.length === 1 ? "prospect novo" : "prospects novos"} para importar.
              </p>
              {resultado.repetidos > 0 && <p className="text-muted-foreground">{resultado.repetidos} já estavam na lista (ignorados).</p>}
              {resultado.assinantes > 0 && <p className="text-muted-foreground">{resultado.assinantes} já são assinantes da newsletter (ignorados).</p>}
              {resultado.semEmail > 0 && <p className="text-muted-foreground">{resultado.semEmail} linhas sem e-mail válido (ignoradas).</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => {
              limpar();
              onFechar();
            }}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button className="rounded-full" disabled={!resultado?.novos.length || salvando} onClick={salvar}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Importar {resultado?.novos.length ?? ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
