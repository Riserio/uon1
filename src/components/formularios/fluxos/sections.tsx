import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIPOS_SINISTRO, RED_FLAGS } from "./motor";
import type { FormDataFluxos, TipoSinistro } from "./types";
import { maskPlaca, maskCPF, maskCNPJ, maskTelefone } from "../masks";

// ───── Helpers ─────
type UpdateFn = (patch: Partial<FormDataFluxos>) => void;

export function SecaoCard({
  numero,
  titulo,
  descricao,
  badge,
  children,
}: {
  numero: number | string;
  titulo: string;
  descricao?: string;
  badge?: { label: string; cor?: string };
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-3">
        <span className="h-7 w-7 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center">
          {numero}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-stone-800">{titulo}</h2>
          {descricao && <p className="text-[11px] text-stone-500">{descricao}</p>}
        </div>
        {badge && (
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${badge.cor || "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
            {badge.label}
          </span>
        )}
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  obrig,
  badge,
  hint,
  full,
  children,
}: {
  label: string;
  obrig?: boolean;
  badge?: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs font-semibold text-stone-600 flex items-center gap-2">
        {label}
        {obrig && <span className="text-red-600">*</span>}
        {badge && (
          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${
            badge === "NOVO" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
            badge === "REVISADO" ? "bg-amber-50 text-amber-700 border border-amber-200" :
            "bg-red-50 text-red-700 border border-red-200"
          }`}>{badge}</span>
        )}
      </Label>
      {children}
      {hint && <p className="text-[10px] text-stone-400">{hint}</p>}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Subhead({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold border-b border-stone-100 pb-1">{children}</div>;
}

function Radio({
  value,
  onChange,
  opcoes,
  inline,
}: {
  value: string;
  onChange: (v: string) => void;
  opcoes: { value: string; label: string }[];
  inline?: boolean;
}) {
  return (
    <RadioGroup value={value} onValueChange={onChange} className={inline ? "flex flex-wrap gap-2" : "space-y-1"}>
      {opcoes.map((o) => (
        <label key={o.value} className="flex items-center gap-2 cursor-pointer text-sm text-stone-700 bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5">
          <RadioGroupItem value={o.value} />
          <span>{o.label}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

function SimChoice({
  value,
  onChange,
  options = ["Sim", "Não"],
}: {
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  return <Radio inline value={value} onChange={onChange} opcoes={options.map((o) => ({ value: o, label: o }))} />;
}

// ───── Seleção de tipo ─────
export function TipoSinistroSelector({
  tipo,
  setTipo,
}: {
  tipo: TipoSinistro | null;
  setTipo: (t: TipoSinistro) => void;
}) {
  return (
    <div className="space-y-3">
      <Subhead>Tipo de sinistro</Subhead>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {TIPOS_SINISTRO.map((t) => {
          const ativo = tipo === t.valor;
          return (
            <button
              key={t.valor}
              type="button"
              onClick={() => setTipo(t.valor as TipoSinistro)}
              className={`text-left p-3 rounded-xl border-2 transition-all duration-150 ${
                ativo ? "border-stone-900 bg-white shadow-md" : "border-stone-200 bg-stone-50 hover:border-stone-400"
              }`}
            >
              <div className="text-2xl mb-1">{t.icone}</div>
              <div className="text-xs font-semibold text-stone-800">{t.nome}</div>
              <div className="text-[10px] text-stone-500 leading-tight">{t.descricao}</div>
            </button>
          );
        })}
      </div>
      {tipo && (
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider bg-stone-900 text-white rounded-full px-3 py-1">
          Configurado para: {TIPOS_SINISTRO.find((t) => t.valor === tipo)?.nome}
        </div>
      )}
    </div>
  );
}

// ============== SEÇÕES ==============
export function S01_Identificacao({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  return (
    <SecaoCard numero={1} titulo="Identificação" descricao="Dados básicos do protocolo">
      <Grid>
        <Field label="Nome da associação" obrig><Input value={form.nomeAssociacao} onChange={(e) => update({ nomeAssociacao: e.target.value })} /></Field>
        <Field label="Protocolo do evento"><Input placeholder="SIN-2024-00123" value={form.protocolo} onChange={(e) => update({ protocolo: e.target.value })} /></Field>
        <Field label="Analista responsável" obrig><Input value={form.analista} onChange={(e) => update({ analista: e.target.value })} /></Field>
        <Field label="Regional"><Input value={form.regional} onChange={(e) => update({ regional: e.target.value })} /></Field>
        <Field label="Data de abertura" obrig><Input type="date" value={form.dataAbertura} onChange={(e) => update({ dataAbertura: e.target.value })} /></Field>
        <Field label="Data do 1º contato" obrig><Input type="date" value={form.dataPrimeiroContato} onChange={(e) => update({ dataPrimeiroContato: e.target.value })} /></Field>
        <Field label="Tipo de acionamento" full>
          <SimChoice value={form.tipoAcionamento} onChange={(v) => update({ tipoAcionamento: v })} options={["Associado", "Terceiro", "Associado e terceiro"]} />
        </Field>
        <Field label="Nome do acionante" full><Input value={form.nomeAcionante} onChange={(e) => update({ nomeAcionante: e.target.value })} /></Field>
      </Grid>
      <TipoSinistroSelector tipo={form.tipoSinistro} setTipo={(t) => update({ tipoSinistro: t })} />
    </SecaoCard>
  );
}

export function S02_Associado({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  return (
    <SecaoCard numero={2} titulo="Dados do associado">
      <Subhead>Dados cadastrais</Subhead>
      <Grid>
        <Field label="Nome do associado"><Input value={form.nomeAssociado || ""} onChange={(e) => update({ nomeAssociado: e.target.value })} /></Field>
        <Field label="Data de cadastro"><Input type="date" value={form.dataCadastro || ""} onChange={(e) => update({ dataCadastro: e.target.value })} /></Field>
        <Field label="Status na data do evento"><SimChoice value={form.statusEvento || ""} onChange={(v) => update({ statusEvento: v })} options={["Ativo", "Inadimplente"]} /></Field>
        <Field label="Boletos em aberto"><SimChoice value={form.boletosAberto || ""} onChange={(v) => update({ boletosAberto: v })} /></Field>
        <Field label="Comportamento de pagamento" full>
          <Radio
            value={form.d3_historicoFinanceiro}
            onChange={(v) => update({ d3_historicoFinanceiro: v })}
            opcoes={[
              { value: "paga_em_dia", label: "Paga em dia" },
              { value: "atrasos_pontuais", label: "Atrasos pontuais" },
              { value: "sempre_atrasa", label: "Sempre atrasa" },
              { value: "historico_irregular", label: "Irregular" },
              { value: "inadimplente_no_evento", label: "Inadimplente no evento" },
              { value: "vencimento_proximo_15d", label: "Vencimento <15d" },
            ]}
          />
        </Field>
        <Field label="Último vencimento / pagamento"><Input value={form.ultimoVencimento || ""} onChange={(e) => update({ ultimoVencimento: e.target.value })} /></Field>
        <Field label="Dias até próximo vencimento" badge="NOVO" hint="Menos de 15 dias = red flag de temporalidade">
          <Input type="number" value={form.diasProxVenc || ""} onChange={(e) => update({ diasProxVenc: e.target.value })} />
        </Field>
      </Grid>
      <Subhead>Histórico de sinistros</Subhead>
      <Grid>
        <Field label="Veículos ativos na base"><Input type="number" value={form.veiculosAtivos || ""} onChange={(e) => update({ veiculosAtivos: e.target.value })} /></Field>
        <Field label="Eventos anteriores"><SimChoice value={form.eventosAnteriores || ""} onChange={(v) => update({ eventosAnteriores: v })} /></Field>
        <Field label="Quantidade últimos 24m" badge="NOVO"><Input type="number" value={form.qtd24m || ""} onChange={(e) => update({ qtd24m: e.target.value })} /></Field>
        <Field label="Intervalo desde o último (dias)" badge="NOVO"><Input type="number" value={form.intervaloUltimo || ""} onChange={(e) => update({ intervaloUltimo: e.target.value })} /></Field>
        <Field label="Mesmo tipo que o atual" badge="RED FLAG">
          <SimChoice
            value={form.mesmoTipoAnterior || ""}
            onChange={(v) => {
              update({ mesmoTipoAnterior: v, redFlags: { ...form.redFlags, rf_mesmoTipo: v === "Sim" } });
            }}
            options={["Sim", "Não", "N/A"]}
          />
        </Field>
        <Field label="Desfecho do anterior">
          <Select value={form.d3_historicoSinistros} onValueChange={(v) => update({ d3_historicoSinistros: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="primeiro_sinistro">Primeiro sinistro</SelectItem>
              <SelectItem value="um_anterior_mais_2anos">{"Aprovado (>2 anos)"}</SelectItem>
              <SelectItem value="dois_em_24meses">2 em 24m</SelectItem>
              <SelectItem value="tres_mais_em_24meses">3+ em 24m</SelectItem>
              <SelectItem value="negado_mesmo_tipo">Negado mesmo tipo</SelectItem>
              <SelectItem value="intervalo_60dias">{"Intervalo < 60d"}</SelectItem>
              <SelectItem value="menos_90dias_ingresso">{"<"} 90d do ingresso</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Grid>
      <Subhead>Consulta SBL</Subhead>
      <Grid>
        <Field label="Resultado" full>
          <Radio
            value={form.d3_consultaSBL}
            onChange={(v) => update({ d3_consultaSBL: v, g_acionamentoDuplo: v === "ativo_com_sinistro" })}
            opcoes={[
              { value: "nao_consta", label: "Não consta" },
              { value: "ativo_sem_sinistro", label: "Ativo sem sinistro" },
              { value: "ativo_com_sinistro", label: "Ativo COM sinistro (RED FLAG)" },
            ]}
          />
        </Field>
        <Field label="Outra base comunicada"><SimChoice value={form.outraBase || ""} onChange={(v) => update({ outraBase: v })} options={["Sim", "Não", "N/A"]} /></Field>
        <Field label="Detalhe" full><Textarea rows={2} value={form.detalheSBL || ""} onChange={(e) => update({ detalheSBL: e.target.value })} /></Field>
      </Grid>
    </SecaoCard>
  );
}

export function S03_Condutor({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  return (
    <SecaoCard numero={3} titulo="Condutor">
      <Subhead>Identificação</Subhead>
      <Grid>
        <Field label="Condutor" full><SimChoice value={form.condutorTipo || ""} onChange={(v) => update({ condutorTipo: v })} options={["Próprio associado", "Outro"]} /></Field>
        {form.condutorTipo === "Outro" && (
          <>
            <Field label="Nome completo"><Input value={form.condutorNome || ""} onChange={(e) => update({ condutorNome: e.target.value })} /></Field>
            <Field label="Relação com associado"><Input value={form.condutorRelacao || ""} onChange={(e) => update({ condutorRelacao: e.target.value })} /></Field>
          </>
        )}
        <Field label="Habilitado"><SimChoice value={form.habilitado || ""} onChange={(v) => update({ habilitado: v, g_semHabilitacao: v === "Não" })} /></Field>
        <Field label="CNH vencida"><SimChoice value={form.cnhVencida || ""} onChange={(v) => update({ cnhVencida: v })} /></Field>
        <Field label="Vencimento CNH"><Input type="date" value={form.cnhVencimento || ""} onChange={(e) => update({ cnhVencimento: e.target.value })} /></Field>
        <Field label="Categoria">
          <Select value={form.cnhCategoria || ""} onValueChange={(v) => update({ cnhCategoria: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {["A", "B", "C", "D", "E", "AB"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Idade" badge="NOVO"><Input type="number" value={form.condutorIdade || ""} onChange={(e) => update({ condutorIdade: e.target.value })} /></Field>
        <Field label="Tempo habilitação (anos)" badge="NOVO"><Input type="number" value={form.condutorTempoHab || ""} onChange={(e) => update({ condutorTempoHab: e.target.value })} /></Field>
        <Field label="Regularidade condutor (consolidado)" full>
          <Radio
            value={form.d4_regularidadeCondutor}
            onChange={(v) => update({ d4_regularidadeCondutor: v })}
            opcoes={[
              { value: "cnh_valida_categoria_ok", label: "CNH válida / categoria OK" },
              { value: "cnh_vencida_30d", label: "CNH vencida ≤30d" },
              { value: "cnh_vencida_mais_30d", label: "CNH vencida >30d" },
              { value: "categoria_incompativel", label: "Categoria incompatível" },
              { value: "celular_confirmado_bo", label: "Celular confirmado no BO" },
            ]}
          />
        </Field>
      </Grid>
      <Subhead>Estado no momento</Subhead>
      <Grid>
        <Field label="Alcoolemia" badge="NOVO" full>
          <SimChoice
            value={form.alcoolemia || ""}
            onChange={(v) => update({ alcoolemia: v, g_alcoolemia: v === "Positivo" })}
            options={["Não realizado", "Negativo", "Positivo", "Recusou"]}
          />
        </Field>
        <Field label="Uso de celular no BO"><SimChoice value={form.celular || ""} onChange={(v) => update({ celular: v })} /></Field>
        <Field label="Declarou distração"><SimChoice value={form.distracao || ""} onChange={(v) => update({ distracao: v })} /></Field>
        <Field label="Usava cinto"><SimChoice value={form.cinto || ""} onChange={(v) => update({ cinto: v })} options={["Sim", "Não", "Não informado"]} /></Field>
        <Field label="Finalidade"><SimChoice value={form.finalidade || ""} onChange={(v) => update({ finalidade: v })} options={["Trabalho", "Lazer", "Não informado"]} /></Field>
        <Field label="Vítimas com lesões"><SimChoice value={form.vitimas || ""} onChange={(v) => update({ vitimas: v })} /></Field>
      </Grid>
    </SecaoCard>
  );
}

export function S04_Veiculo({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  const t = form.tipoSinistro;
  const showRastr = t && ["colisao", "roubo", "incendio", "fenomeno", "total"].includes(t);
  return (
    <SecaoCard numero={4} titulo="Veículo">
      <Subhead>Identificação</Subhead>
      <Grid>
        <Field label="Placa"><Input value={form.veicPlaca || ""} onChange={(e) => update({ veicPlaca: maskPlaca(e.target.value) })} className="uppercase" /></Field>
        <Field label="Marca/Modelo"><Input value={form.veicMM || ""} onChange={(e) => update({ veicMM: e.target.value })} /></Field>
        <Field label="Ano fabricação"><Input value={form.veicAno || ""} onChange={(e) => update({ veicAno: e.target.value })} /></Field>
        <Field label="Cota de participação"><Input value={form.cotaPart || ""} onChange={(e) => update({ cotaPart: e.target.value })} /></Field>
        <Field label="Valor FIPE" badge="NOVO"><Input value={form.fipe || ""} onChange={(e) => update({ fipe: e.target.value })} /></Field>
        <Field label="KM odômetro" badge="NOVO"><Input value={form.km || ""} onChange={(e) => update({ km: e.target.value })} /></Field>
      </Grid>
      <Subhead>Situação documental</Subhead>
      <Grid>
        <Field label="Comunicação de venda"><SimChoice value={form.comunicVenda || ""} onChange={(v) => update({ comunicVenda: v, d4_regularidadeVeiculo: v === "Sim" ? "comunicacao_venda" : form.d4_regularidadeVeiculo })} /></Field>
        <Field label="Anúncio venda ativo" badge="RED FLAG">
          <SimChoice value={form.anuncioVenda || ""} onChange={(v) => update({ anuncioVenda: v, g_anuncioVenda: v === "Sim", redFlags: { ...form.redFlags, rf_anuncioVenda: v === "Sim" } })} />
        </Field>
        <Field label="Restrição DETRAN"><SimChoice value={form.restricaoDetran || ""} onChange={(v) => update({ restricaoDetran: v })} /></Field>
        <Field label="Possui multas"><SimChoice value={form.multas || ""} onChange={(v) => update({ multas: v })} /></Field>
        <Field label="Multa tem relação com evento" full><Textarea rows={2} value={form.multaRelacao || ""} onChange={(e) => update({ multaRelacao: e.target.value })} /></Field>
        <Field label="Regularidade veículo (consolidado)" full>
          <Radio
            value={form.d4_regularidadeVeiculo}
            onChange={(v) => update({ d4_regularidadeVeiculo: v })}
            opcoes={[
              { value: "ativo_sem_restricao", label: "Ativo sem restrição" },
              { value: "comunicacao_venda", label: "Comunicação de venda" },
              { value: "anuncio_venda_ativo", label: "Anúncio ativo" },
              { value: "restricao_judicial", label: "Restrição judicial" },
              { value: "modificacao_nao_homo", label: "Mod. não homologada" },
              { value: "irreg_nexo_direto", label: "Irreg. com nexo direto" },
            ]}
          />
        </Field>
      </Grid>
      <Subhead>Condições técnicas</Subhead>
      <Grid>
        <Field label="Pneus adequados"><SimChoice value={form.pneus || ""} onChange={(v) => update({ pneus: v })} options={["Sim", "Não", "Não verificado"]} /></Field>
        <Field label="Freios/faróis"><SimChoice value={form.freios || ""} onChange={(v) => update({ freios: v })} options={["Sim", "Não", "Não verificado"]} /></Field>
        <Field label="Avaria pré-existente"><SimChoice value={form.avariaPre || ""} onChange={(v) => update({ avariaPre: v })} /></Field>
        <Field label="Irregularidade constatada"><SimChoice value={form.irregConst || ""} onChange={(v) => update({ irregConst: v })} /></Field>
        <Field label="Tipo irregularidade" badge="REVISADO" full>
          <Select value={form.tipoIrreg || ""} onValueChange={(v) => update({ tipoIrreg: v, g_gnvIncendio: v === "GNV não regularizado" && t === "incendio", redFlags: { ...form.redFlags, rf_gnvNaoReg: v === "GNV não regularizado" } })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              {["Documental", "Mecânica", "Estrutural", "Mod. não homologada", "Uso comercial não declarado", "GNV não regularizado", "Outro", "N/A"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Irreg. tem relação com evento" badge="NOVO"><SimChoice value={form.irregNexo || ""} onChange={(v) => update({ irregNexo: v, d4_regularidadeVeiculo: v === "Sim" ? "irreg_nexo_direto" : form.d4_regularidadeVeiculo })} options={["Sim", "Não", "N/A"]} /></Field>
      </Grid>
      {showRastr && (
        <>
          <Subhead>Rastreador</Subhead>
          <Grid>
            <Field label="Tacógrafo"><SimChoice value={form.tacografo || ""} onChange={(v) => update({ tacografo: v })} /></Field>
            <Field label="Rastreador instalado"><SimChoice value={form.rastreador || ""} onChange={(v) => update({ rastreador: v })} /></Field>
            <Field label="Empresa do rastreador"><Input value={form.rastEmpresa || ""} onChange={(e) => update({ rastEmpresa: e.target.value })} /></Field>
            <Field label="Resultado da consulta" badge="REVISADO" full>
              <Radio
                value={form.d4_rastreador}
                onChange={(v) => update({ d4_rastreador: v, redFlags: { ...form.redFlags, rf_rastrSemSinal: v === "sem_sinal_no_evento", rf_rastrIncompat: v === "incompativel_velocidade" } })}
                opcoes={[
                  { value: "compativel_triplo", label: "Compatível local+hora+vel" },
                  { value: "compativel_duplo", label: "Compatível local+hora" },
                  { value: "sem_sinal_no_evento", label: "Sem sinal no período (RF)" },
                  { value: "incompativel_velocidade", label: "Incompatível velocidade" },
                  { value: "nao_possui", label: "N/A" },
                ]}
              />
            </Field>
            <Field label="Foi interferido/desconectado" badge="RED FLAG">
              <SimChoice value={form.rastInterf || ""} onChange={(v) => update({ rastInterf: v, g_rastreadorDesconectado: v === "Sim" })} />
            </Field>
            <Field label="Contradiz localização" badge="RED FLAG">
              <SimChoice value={form.rastContradiz || ""} onChange={(v) => update({ rastContradiz: v, g_rastreadorContradiz: v === "Sim" })} />
            </Field>
            <Field label="Relatório anexado"><SimChoice value={form.rastRelatorio || ""} onChange={(v) => update({ rastRelatorio: v })} options={["Sim", "Não", "Pendente"]} /></Field>
          </Grid>
        </>
      )}
    </SecaoCard>
  );
}

function SubBloco({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  const t = form.tipoSinistro;
  if (!t) return null;
  switch (t) {
    case "colisao":
      return (
        <Grid>
          <Field label="Subtipo de colisão" full>
            <Radio value={form.subColisao || ""} onChange={(v) => update({ subColisao: v })} opcoes={["Frontal", "Traseira", "Lateral", "Capotamento", "Saída de pista", "Estacionamento", "Animal", "Objeto fixo"].map((o) => ({ value: o, label: o }))} />
          </Field>
          <Field label="Envolvimento"><SimChoice value={form.envolvimento || ""} onChange={(v) => update({ envolvimento: v })} options={["Causador", "Vítima"]} /></Field>
          <Field label="Dano a terceiro"><SimChoice value={form.danoTerceiro || ""} onChange={(v) => update({ danoTerceiro: v })} /></Field>
        </Grid>
      );
    case "roubo":
      return (
        <Grid>
          <Field label="Tipo de roubo" full><Radio value={form.subRoubo || ""} onChange={(v) => update({ subRoubo: v })} opcoes={["Total com violência", "Total com arma fogo", "Parcial (pertences)", "Sequestro-relâmpago", "Carjacking"].map((o) => ({ value: o, label: o }))} /></Field>
          <Field label="Condutor estava presente"><SimChoice value={form.condPresente || ""} onChange={(v) => update({ condPresente: v })} /></Field>
          <Field label="Nº de assaltantes"><Input type="number" value={form.assaltantes || ""} onChange={(e) => update({ assaltantes: e.target.value })} /></Field>
          <Field label="Uso de arma"><SimChoice value={form.arma || ""} onChange={(v) => update({ arma: v })} options={["Fogo", "Branca", "Não"]} /></Field>
          <Field label="Celular levado"><SimChoice value={form.celularLevado || ""} onChange={(v) => update({ celularLevado: v })} /></Field>
        </Grid>
      );
    case "furto":
      return (
        <Grid>
          <Field label="Tipo de furto" full><Radio value={form.subFurto || ""} onChange={(v) => update({ subFurto: v })} opcoes={["Total", "Parcial-peças", "Pertences interior", "Carga/equipamento"].map((o) => ({ value: o, label: o }))} /></Field>
          <Field label="Local onde estava" full><Radio value={form.furtoLocal || ""} onChange={(v) => update({ furtoLocal: v })} opcoes={["Via pública", "Coberto", "Descoberto", "Residência", "Empresa"].map((o) => ({ value: o, label: o }))} /></Field>
          <Field label="Recuperado"><SimChoice value={form.recuperado || ""} onChange={(v) => update({ recuperado: v })} options={["Íntegro", "Com danos", "Peças", "Não localizado"]} /></Field>
          <Field label="Havia câmera" badge="RED FLAG"><SimChoice value={form.cameraSeg || ""} onChange={(v) => update({ cameraSeg: v })} options={["Sim", "Não", "N/V"]} /></Field>
        </Grid>
      );
    case "incendio":
      return (
        <Grid>
          <Field label="Causa do incêndio" full><Radio value={form.subIncendio || ""} onChange={(v) => update({ subIncendio: v })} opcoes={["Falha elétrica/mecânica", "Criminoso", "Após colisão", "Explosão GNV", "Raio"].map((o) => ({ value: o, label: o }))} /></Field>
          <Field label="Bombeiros" full><SimChoice value={form.bombeiros || ""} onChange={(v) => update({ bombeiros: v, redFlags: { ...form.redFlags, rf_semBombeiros: v === "Não acionado" } })} options={["Laudo disponível", "Aguardando", "Não acionado"]} /></Field>
          <Field label="GNV/modificação"><SimChoice value={form.gnvMod || ""} onChange={(v) => update({ gnvMod: v, g_gnvIncendio: v === "Sim", redFlags: { ...form.redFlags, rf_gnvNaoReg: v === "Sim" } })} options={["Sim", "Não", "N/V"]} /></Field>
          <Field label="Condutor no veículo"><SimChoice value={form.condNoVeic || ""} onChange={(v) => update({ condNoVeic: v })} /></Field>
        </Grid>
      );
    case "patrimonial":
      return (
        <Grid>
          <Field label="Bens atingidos" full>
            <div className="flex flex-wrap gap-2">
              {["Portão", "Muro/gradil", "Fachada residencial", "Fachada comercial", "Poste/sinalização", "Calçada/infra", "Outro"].map((o) => {
                const arr: string[] = form.patBens || [];
                const sel = arr.includes(o);
                return (
                  <label key={o} className="flex items-center gap-2 text-xs bg-stone-50 border border-stone-200 rounded-md px-2 py-1">
                    <Checkbox checked={sel} onCheckedChange={(c) => update({ patBens: c ? [...arr, o] : arr.filter((x) => x !== o) })} />
                    {o}
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Proprietário identificado"><SimChoice value={form.proprietario || ""} onChange={(v) => update({ proprietario: v })} options={["Sim", "Não", "Patrimônio público"]} /></Field>
          <Field label="Ação de ressarcimento"><SimChoice value={form.ressarcimento || ""} onChange={(v) => update({ ressarcimento: v })} options={["Sim", "Não", "A verificar"]} /></Field>
          <Field label="Descrição" full><Textarea rows={2} value={form.patDesc || ""} onChange={(e) => update({ patDesc: e.target.value })} /></Field>
        </Grid>
      );
    case "fenomeno":
      return (
        <Grid>
          <Field label="Fenômeno" full><Radio value={form.subFenomeno || ""} onChange={(v) => update({ subFenomeno: v })} opcoes={["Granizo", "Alagamento", "Queda árvore", "Raio", "Vendaval", "Deslizamento"].map((o) => ({ value: o, label: o }))} /></Field>
          <Field label="Cobertura confirmada"><SimChoice value={form.cobertura || ""} onChange={(v) => update({ cobertura: v })} options={["Sim", "Não", "Parcial"]} /></Field>
          <Field label="Registro meteorológico" badge="NOVO"><SimChoice value={form.regMeteo || ""} onChange={(v) => update({ regMeteo: v, redFlags: { ...form.redFlags, rf_fenSemRegistro: v === "Não localizado" } })} options={["Anexado", "Não localizado", "Pendente"]} /></Field>
          <Field label="Outros veículos afetados" badge="RED FLAG"><SimChoice value={form.outrosAfet || ""} onChange={(v) => update({ outrosAfet: v, redFlags: { ...form.redFlags, rf_fenIsolado: v === "Não-isolado" } })} options={["Sim", "Não-isolado", "N/V"]} /></Field>
        </Grid>
      );
    case "total":
      return (
        <Grid>
          <Field label="Origem" full><Radio value={form.subTotal || ""} onChange={(v) => update({ subTotal: v })} opcoes={["Colisão", "Incêndio", "Roubo/furto", "Alagamento", "Múltiplos"].map((o) => ({ value: o, label: o }))} /></Field>
          <Field label="% em relação ao FIPE"><SimChoice value={form.pctFipe || ""} onChange={(v) => update({ pctFipe: v })} options={["Acima 75%", "50-75%", "Abaixo 50%"]} /></Field>
          <Field label="Valor estimado dos danos"><Input value={form.valorEstimado || ""} onChange={(e) => update({ valorEstimado: e.target.value })} /></Field>
          <Field label="Laudo de PT"><SimChoice value={form.laudoPT || ""} onChange={(v) => update({ laudoPT: v })} options={["Recebido", "Aguardando", "Não solicitado"]} /></Field>
        </Grid>
      );
  }
}

export function S05_Evento({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  const t = form.tipoSinistro;
  const showDin = t && ["colisao", "roubo", "incendio", "patrimonial", "total"].includes(t);
  const showVel = t && ["colisao", "patrimonial", "total"].includes(t);
  return (
    <SecaoCard numero={5} titulo="Evento e dinâmica">
      <Subhead>Subtipo</Subhead>
      <SubBloco form={form} update={update} />
      <Subhead>Dados gerais</Subhead>
      <Grid>
        <Field label="Data do evento" obrig><Input type="date" value={form.dataEvento || ""} onChange={(e) => update({ dataEvento: e.target.value })} /></Field>
        <Field label="Hora do evento" obrig badge="NOVO" hint="Cruzar com rastreador e câmeras"><Input type="time" value={form.horaEvento || ""} onChange={(e) => update({ horaEvento: e.target.value })} /></Field>
        <Field label="Período" full><SimChoice value={form.periodo || ""} onChange={(v) => update({ periodo: v })} options={["Dia 6-18h", "Noite 18-24h", "Madrugada 0-6h"]} /></Field>
      </Grid>
      {showDin && (
        <>
          <Subhead>Dinâmica</Subhead>
          <Grid>
            <Field label="Veículo em"><SimChoice value={form.veicEm || ""} onChange={(v) => update({ veicEm: v })} options={["Em deslocamento", "Estacionado", "N/I"]} /></Field>
            {showVel && <Field label="Velocidade estimada"><Input value={form.velocidade || ""} onChange={(e) => update({ velocidade: e.target.value })} /></Field>}
            {(t === "colisao" || t === "patrimonial") && (
              <>
                <Field label="Quem colidiu em quem"><Input value={form.quemColidiu || ""} onChange={(e) => update({ quemColidiu: e.target.value })} /></Field>
                <Field label="Tentativa de frenagem"><SimChoice value={form.frenagem || ""} onChange={(v) => update({ frenagem: v })} options={["Sim", "Não", "N/I"]} /></Field>
              </>
            )}
            <Field label="Descrição da dinâmica" obrig full><Textarea rows={3} value={form.dinamica || ""} onChange={(e) => update({ dinamica: e.target.value })} /></Field>
            <Field label="Velocidade × danos">
              <Radio value={form.d1_velocidadeDanos} onChange={(v) => update({ d1_velocidadeDanos: v })} opcoes={[{value:"compativel",label:"Compatível"},{value:"baixa_para_dano",label:"Baixa p/ dano"},{value:"alta_para_dano",label:"Alta p/ dano"},{value:"na",label:"N/A"}]} />
            </Field>
            <Field label="Subtipo físico">
              <Radio value={form.d1_subtipoFisico} onChange={(v) => update({ d1_subtipoFisico: v })} opcoes={[{value:"plenamente_plausivel",label:"Plenamente plausível"},{value:"plausivel_ressalvas",label:"Plausível c/ ressalvas"},{value:"improvavel",label:"Improvável"},{value:"fisicamente_impossivel",label:"Fisicamente impossível"}]} />
            </Field>
          </Grid>
        </>
      )}
      <Subhead>Local do evento</Subhead>
      <Grid>
        <Field label="Endereço" obrig full><Input value={form.endereco || ""} onChange={(e) => update({ endereco: e.target.value })} /></Field>
        <Field label="Link Google Maps" full><Input value={form.mapsLink || ""} onChange={(e) => update({ mapsLink: e.target.value })} /></Field>
        <Field label="Tipo de via" badge="NOVO">
          <Select value={form.tipoVia || ""} onValueChange={(v) => update({ tipoVia: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{["Urbana", "Rodovia", "Rural", "Estacionamento", "Outro"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Vel. máxima local" badge="NOVO"><Input value={form.velMax || ""} onChange={(e) => update({ velMax: e.target.value })} /></Field>
        <Field label="Clima" badge="NOVO">
          <Select value={form.clima || ""} onValueChange={(v) => update({ clima: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{["Bom", "Chuva", "Neblina", "Vento", "Outro"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Pavimento" badge="NOVO">
          <Select value={form.pavimento || ""} onValueChange={(v) => update({ pavimento: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{["Seco", "Molhado", "Buraco", "Obras", "Outro"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Sinalização"><SimChoice value={form.sinalizacao || ""} onChange={(v) => update({ sinalizacao: v })} /></Field>
        <Field label="Câmeras identificadas" badge="NOVO"><SimChoice value={form.cameras || ""} onChange={(v) => update({ cameras: v })} options={["Sim", "Não", "N/V"]} /></Field>
        <Field label="Observações" full><Textarea rows={2} value={form.obsLocal || ""} onChange={(e) => update({ obsLocal: e.target.value })} /></Field>
      </Grid>
    </SecaoCard>
  );
}

export function S06_BO({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  return (
    <SecaoCard numero={6} titulo="Boletim de ocorrência">
      <Grid>
        <Field label="Nº do BO"><Input value={form.boNumero || ""} onChange={(e) => update({ boNumero: e.target.value })} /></Field>
        <Field label="Data do BO"><Input type="date" value={form.boData || ""} onChange={(e) => update({ boData: e.target.value })} /></Field>
        <Field label="Hora do BO" badge="NOVO"><Input type="time" value={form.boHora || ""} onChange={(e) => update({ boHora: e.target.value })} /></Field>
        <Field label="Prazo evento → BO">
          <Radio value={form.d2_prazoBO} onChange={(v) => update({ d2_prazoBO: v })} opcoes={[{value:"mesmo_dia",label:"Mesmo dia"},{value:"um_a_tres",label:"1-3 dias"},{value:"quatro_a_sete",label:"4-7 dias"},{value:"oito_ou_mais",label:"8+ dias"}]} />
        </Field>
        <Field label="Tipo / Delegacia" full>
          <Radio value={form.d2_tipoDelegaciaBO} onChange={(v) => update({ d2_tipoDelegaciaBO: v, redFlags: { ...form.redFlags, rf_boOnlineGrande: v === "online_grande", rf_boDelegaciaLonge: v === "presencial_distante" } })} opcoes={[{value:"presencial_compativel",label:"Presencial compatível"},{value:"presencial_distante",label:"Presencial distante"},{value:"online_pequeno",label:"Online (pequeno)"},{value:"online_medio",label:"Online (médio)"},{value:"online_grande",label:"Online (grande)"}]} />
        </Field>
        <Field label="Retificação / 2º BO">
          <SimChoice value={form.d2_retificacaoBO === "sim" ? "Sim" : form.d2_retificacaoBO === "nao" ? "Não" : ""} onChange={(v) => update({ d2_retificacaoBO: v === "Sim" ? "sim" : "nao", redFlags: { ...form.redFlags, rf_boRetificacao: v === "Sim" } })} />
        </Field>
        <Field label="Delegado identificado"><SimChoice value={form.delegadoId || ""} onChange={(v) => update({ delegadoId: v })} /></Field>
        <Field label="Linguagem técnica atípica" badge="RED FLAG"><SimChoice value={form.boLing || ""} onChange={(v) => update({ boLing: v, redFlags: { ...form.redFlags, rf_boLinguagem: v === "Sim" } })} /></Field>
        <Field label="Terceiros no BO não contatados" badge="NOVO"><SimChoice value={form.terceirosNaoCont || ""} onChange={(v) => update({ terceirosNaoCont: v })} options={["Sim", "Não", "N/A"]} /></Field>
        <Field label="Relato do BO" obrig full><Textarea rows={3} value={form.relatoBO || ""} onChange={(e) => update({ relatoBO: e.target.value })} /></Field>
      </Grid>
      <Subhead>Coerência temporal</Subhead>
      <Grid>
        <Field label="Evento × BO">
          <Radio value={form.d5_eventoVsBO} onChange={(v) => update({ d5_eventoVsBO: v })} opcoes={[{value:"identico",label:"Idêntico"},{value:"ate_1hora",label:"Até 1h"},{value:"horas_significativas",label:"Horas signif."},{value:"datas_diferentes",label:"Datas diferentes"}]} />
        </Field>
        <Field label="1º contato × evento">
          <Radio value={form.d5_intervaloContato} onChange={(v) => update({ d5_intervaloContato: v })} opcoes={[{value:"mesmo_dia_seguinte",label:"Mesmo dia/seguinte"},{value:"dois_a_cinco",label:"2-5 dias"},{value:"seis_a_quinze",label:"6-15 dias"},{value:"quinze_a_trinta",label:"15-30 dias"},{value:"mais_de_trinta",label:">30 dias"}]} />
        </Field>
        <Field label="Coerência interna geral" full>
          <Radio value={form.d5_coerenciaInterna} onChange={(v) => update({ d5_coerenciaInterna: v })} opcoes={[{value:"todas_coerentes",label:"Todas coerentes"},{value:"pequenas_justificadas",label:"Pequenas justificadas"},{value:"divergencias_sem_exp",label:"Divergências sem exp."}]} />
        </Field>
        <Field label="Relato × BO" full>
          <Radio value={form.d2_relatoVsBO} onChange={(v) => update({ d2_relatoVsBO: v })} opcoes={[{value:"identico",label:"Idêntico"},{value:"detalhes_coerentes",label:"Detalhes coerentes"},{value:"pequenas_divergencias",label:"Pequenas divergências"},{value:"contradiz_ponto_central",label:"Contradiz ponto central"},{value:"nao_sabe_o_que_consta",label:"Não sabe o que consta"}]} />
        </Field>
        <Field label="Descreva divergências" full><Textarea rows={2} value={form.divergencias || ""} onChange={(e) => update({ divergencias: e.target.value })} /></Field>
      </Grid>
      <Subhead>Valor do sinistro</Subhead>
      <Grid>
        <Field label="Valor dos danos/orçamento"><Input value={form.valorDanos || ""} onChange={(e) => update({ valorDanos: e.target.value })} /></Field>
        <Field label="Classificação"><SimChoice value={form.classValor || ""} onChange={(v) => update({ classValor: v })} options={["Pequeno até R$3k", "Médio R$3-15k", "Grande >R$15k", "Perda total"]} /></Field>
      </Grid>
    </SecaoCard>
  );
}

export function S07_Fotos({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  const t = form.tipoSinistro;
  const docs = ["CNH frente+verso", "CRV/CRLV", "BO", "Fotos veículo", "Fotos local", "Orçamento reparo", "Laudo vistoria prévia", "Procuração"];
  if (t === "incendio") docs.push("Laudo Bombeiros");
  if (t === "fenomeno") docs.push("Registro meteorológico");
  if (t === "total") docs.push("Laudo de perda total");
  if (t === "patrimonial") docs.push("Orçamento patrimônio");
  if (t && ["colisao", "roubo", "incendio", "fenomeno", "total"].includes(t)) docs.push("Relatório rastreador");
  const docsSel: string[] = form.docs || [];
  return (
    <SecaoCard numero={7} titulo="Fotos e documentação">
      <Grid>
        <Field label="Fotos do veículo incluídas"><SimChoice value={form.fotosIncluidas || ""} onChange={(v) => update({ fotosIncluidas: v })} /></Field>
        <Field label="Qualidade das fotos" badge="NOVO" full>
          <Radio value={form.d7_fotoQualidade} onChange={(v) => update({ d7_fotoQualidade: v })} opcoes={[{value:"adequadas_metadata_ok",label:"Adequadas + metadata OK"},{value:"parciais",label:"Parciais"},{value:"insuficientes",label:"Insuficientes"},{value:"metadata_incompativel",label:"Metadata incompatível"}]} />
        </Field>
      </Grid>
      <Subhead>Análise forense (nexo causal visual)</Subhead>
      <Grid>
        <Field label="Danos coerentes c/ tipo"><SimChoice value={form.f1 || ""} onChange={(v) => update({ f1: v })} options={["Sim", "Não", "Parcialmente"]} /></Field>
        <Field label="Extensão compatível"><SimChoice value={form.f2 || ""} onChange={(v) => update({ f2: v })} options={["Sim", "Excessivos", "Insuficientes"]} /></Field>
        <Field label="Posição bate c/ impacto"><SimChoice value={form.f3 || ""} onChange={(v) => update({ f3: v })} options={["Sim", "Não-região incompat."]} /></Field>
        <Field label="Sinais de ferrugem" badge="RED FLAG">
          <SimChoice value={form.f4 || ""} onChange={(v) => update({ f4: v, redFlags: { ...form.redFlags, rf_ferrugem: v === "Sim" }, d1_coerenciaDanos: v === "Sim" ? "ferrugem_preexistente" : form.d1_coerenciaDanos })} options={["Sim", "Não", "N/V"]} />
        </Field>
        <Field label="Metadata compatível">
          <SimChoice value={form.f5 || ""} onChange={(v) => update({ f5: v, redFlags: { ...form.redFlags, rf_metadataIncompat: v === "Não" }, d7_fotoQualidade: v === "Não" ? "metadata_incompativel" : form.d7_fotoQualidade })} options={["Sim", "Não", "N/V"]} />
        </Field>
        <Field label="Mostram ambiente"><SimChoice value={form.f6 || ""} onChange={(v) => update({ f6: v })} /></Field>
        <Field label="Coerência consolidada (D1)" full>
          <Radio value={form.d1_coerenciaDanos} onChange={(v) => update({ d1_coerenciaDanos: v })} opcoes={[{value:"coerente_triplo",label:"Coerente triplo"},{value:"coerente_parcial",label:"Coerente parcial"},{value:"posicao_errada",label:"Posição errada"},{value:"incompativel",label:"Incompatível"},{value:"ferrugem_preexistente",label:"Ferrugem pré-existente"}]} />
        </Field>
      </Grid>
      <Subhead>Checklist de documentação</Subhead>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {docs.map((d) => {
          const sel = docsSel.includes(d);
          return (
            <label key={d} className="flex items-center gap-2 text-xs bg-stone-50 border border-stone-200 rounded-md px-2 py-1.5">
              <Checkbox checked={sel} onCheckedChange={(c) => update({ docs: c ? [...docsSel, d] : docsSel.filter((x) => x !== d) })} />
              {d}
            </label>
          );
        })}
      </div>
    </SecaoCard>
  );
}

export function S08_Terceiro({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  return (
    <SecaoCard numero={8} titulo="Terceiro">
      <Grid>
        <Field label="Nome do terceiro"><Input value={form.terNome || ""} onChange={(e) => update({ terNome: e.target.value })} /></Field>
        <Field label="CPF/CNPJ" badge="NOVO"><Input value={form.terDoc || ""} onChange={(e) => {
          const raw = e.target.value.replace(/\D/g,"");
          update({ terDoc: raw.length > 11 ? maskCNPJ(e.target.value) : maskCPF(e.target.value) });
        }} /></Field>
        <Field label="Contato"><Input value={form.terTel || ""} onChange={(e) => update({ terTel: maskTelefone(e.target.value) })} /></Field>
        <Field label="Placa"><Input value={form.terPlaca || ""} onChange={(e) => update({ terPlaca: maskPlaca(e.target.value) })} className="uppercase" /></Field>
        <Field label="Marca/Modelo"><Input value={form.terMM || ""} onChange={(e) => update({ terMM: e.target.value })} /></Field>
        <Field label="Seguradora" badge="NOVO"><Input value={form.terSeguradora || ""} onChange={(e) => update({ terSeguradora: e.target.value })} /></Field>
        <Field label="Passivo de ressarcimento"><SimChoice value={form.terPassivo || ""} onChange={(v) => update({ terPassivo: v })} /></Field>
        <Field label="Situação atual" badge="NOVO">
          <Select value={form.terSituacao || ""} onValueChange={(v) => update({ terSituacao: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{["Acordo firmado", "Em litígio", "Aguardando", "Não contatado", "N/A"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </Grid>
      <Subhead>Análise de conluio</Subhead>
      <Grid>
        <Field label="Terceiro conhecido do associado" badge="RED FLAG"><SimChoice value={form.conhecido || ""} onChange={(v) => update({ conhecido: v, redFlags: { ...form.redFlags, rf_terceiroConhecido: v === "Sim" } })} options={["Sim", "Não", "N/V"]} /></Field>
        <Field label="Terceiro é associado" badge="RED FLAG"><SimChoice value={form.terAssoc || ""} onChange={(v) => update({ terAssoc: v, redFlags: { ...form.redFlags, rf_terceiroConhecido: v === "Sim" || form.redFlags?.rf_terceiroConhecido } })} options={["Sim", "Não", "N/V"]} /></Field>
        <Field label="Prestador indicado"><SimChoice value={form.prestador || ""} onChange={(v) => update({ prestador: v })} /></Field>
        <Field label="Mencionou despachante" badge="RED FLAG">
          <SimChoice value={form.despachante || ""} onChange={(v) => update({ despachante: v, redFlags: { ...form.redFlags, rf_despachante: v === "Sim" }, d6_sinaisFraude: v === "Sim" ? "mencionou_despachante" : form.d6_sinaisFraude })} />
        </Field>
      </Grid>
    </SecaoCard>
  );
}

export function S09_Entrevista({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  return (
    <SecaoCard numero={9} titulo="Entrevista">
      <Grid>
        <Field label="Contato por ligação"><SimChoice value={form.contatoLig || ""} onChange={(v) => update({ contatoLig: v })} /></Field>
        <Field label="Relato consistente" badge="REVISADO">
          <SimChoice value={form.relatoConsist || ""} onChange={(v) => update({ relatoConsist: v, redFlags: { ...form.redFlags, rf_contradicoes: v === "Não" } })} options={["Sim - sem retificações", "Não - contradições"]} />
        </Field>
        <Field label="Soube informar placa do terceiro" badge="NOVO"><SimChoice value={form.placaTer || ""} onChange={(v) => update({ placaTer: v })} options={["Sim", "Não", "N/A"]} /></Field>
        <Field label="Conhecia localização exata" badge="NOVO"><SimChoice value={form.localExato || ""} onChange={(v) => update({ localExato: v })} /></Field>
        <Field label="Antecipou perguntas técnicas" badge="NOVO" full>
          <SimChoice value={form.antecipou || ""} onChange={(v) => update({ antecipou: v, d6_sinaisFraude: v === "Antecipou-incomum" ? "antecipou_tecnico" : form.d6_sinaisFraude })} options={["Antecipou-incomum", "Reagiu normalmente", "Desconhecimento natural"]} />
        </Field>
        <Field label="Hesitou ao informar horário" badge="NOVO"><SimChoice value={form.hesitou || ""} onChange={(v) => update({ hesitou: v })} /></Field>
        <Field label="Solicitou fechamento rápido" badge="RED FLAG">
          <SimChoice value={form.fechRapido || ""} onChange={(v) => update({ fechRapido: v, redFlags: { ...form.redFlags, rf_fechamentoRapido: v === "Sim" }, d6_sinaisFraude: v === "Sim" ? "fechamento_rapido" : form.d6_sinaisFraude })} />
        </Field>
      </Grid>
      <Subhead>Avaliação comportamental</Subhead>
      <Field label="Comportamento na entrevista" full>
        <Radio value={form.d6_entrevista} onChange={(v) => update({ d6_entrevista: v })} opcoes={[
          {value:"claro_objetivo",label:"Claro e objetivo"},
          {value:"claro_duvidas_menores",label:"Claro c/ dúvidas pontuais"},
          {value:"inseguranca",label:"Insegurança múltipla"},
          {value:"contradicoes_centrais",label:"Contradições identificadas"},
          {value:"altamente_suspeito",label:"Altamente suspeito"},
          {value:"nao_contatado",label:"Não contatado"},
        ]} />
      </Field>
      <Field label="Sinais de fraude (consolidado)" full>
        <Radio value={form.d6_sinaisFraude} onChange={(v) => update({ d6_sinaisFraude: v })} opcoes={[
          {value:"nenhum",label:"Nenhum"},
          {value:"antecipou_tecnico",label:"Antecipou técnico"},
          {value:"fechamento_rapido",label:"Fechamento rápido"},
          {value:"mencionou_despachante",label:"Mencionou despachante"},
          {value:"terceiro_familiar",label:"Terceiro familiar"},
        ]} />
      </Field>
      <Field label="Observações" obrig full><Textarea rows={3} value={form.obsEntrevista || ""} onChange={(e) => update({ obsEntrevista: e.target.value })} /></Field>
    </SecaoCard>
  );
}

export function S10_RedFlags({ form, update, scoreAntifraude }: { form: FormDataFluxos; update: UpdateFn; scoreAntifraude: number }) {
  const t = form.tipoSinistro;
  const flags = RED_FLAGS.filter((f) => f.tipos === "all" || (t && f.tipos.includes(t)));
  const grupos = Array.from(new Set(flags.map((f) => f.grupo)));
  const nivel = scoreAntifraude <= 5 ? { c: "bg-green-100 text-green-800 border-green-300", t: "Baixo" } : scoreAntifraude <= 12 ? { c: "bg-amber-100 text-amber-800 border-amber-300", t: "Alto" } : { c: "bg-red-100 text-red-800 border-red-400", t: "Crítico" };
  return (
    <SecaoCard numero={10} titulo="Red Flags antifraude" descricao="Marque todos os indicadores objetivos presentes.">
      <div className={`rounded-xl p-4 border-2 ${nivel.c} flex items-center justify-between`}>
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider">Score antifraude</div>
          <div className="text-2xl font-bold tabular-nums">{scoreAntifraude}</div>
        </div>
        <div className="text-sm font-semibold">{nivel.t}</div>
      </div>
      {scoreAntifraude > 5 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
          Atenção: nível antifraude elevado. Considere sindicância.
        </div>
      )}
      {grupos.map((g) => (
        <div key={g} className="space-y-2">
          <Subhead>{g}</Subhead>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {flags.filter((f) => f.grupo === g).map((f) => {
              const checked = !!form.redFlags?.[f.id];
              return (
                <label key={f.id} className="flex items-start gap-2 bg-stone-50 border border-stone-200 rounded-lg p-2.5 cursor-pointer">
                  <Checkbox checked={checked} onCheckedChange={(c) => update({ redFlags: { ...form.redFlags, [f.id]: !!c } })} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-stone-800 font-medium">{f.label}</div>
                    <div className="text-[10px] text-stone-500">Peso {f.peso}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </SecaoCard>
  );
}

export function S11_Nexo({ form, update }: { form: FormDataFluxos; update: UpdateFn }) {
  const eixos = [
    { id: "n1", titulo: "1. O evento realmente ocorreu?", opcoes: ["Comprovado", "Provável", "Inconclusivo", "Contraindicado"] },
    { id: "n2", titulo: "2. Ocorreu da forma declarada?", opcoes: ["Comprovado", "Provável", "Inconclusivo", "Contraindicado"] },
    { id: "n3", titulo: "3. Danos são consequência direta?", opcoes: ["Comprovado", "Parcial", "Inconclusivo", "Contraindicado"] },
    { id: "n4", titulo: "4. Veículo/condutor estavam aptos?", opcoes: ["Aptos", "Irreg. sem relação", "Irreg. com relação", "Inaptos"] },
    { id: "n5", titulo: "5. A cobertura se aplica?", opcoes: ["Sim", "Parcialmente", "Inconclusivo", "Não"] },
    { id: "n6", titulo: "6. Indícios de conluio?", opcoes: ["Não", "Fracos", "Moderados", "Fortes"] },
  ];
  return (
    <SecaoCard numero={11} titulo="Protocolo de nexo causal" descricao="Preencha os 6 eixos antes do parecer.">
      {eixos.map((e, i) => {
        const val = form[e.id] || "";
        const cor = val === e.opcoes[0] ? "bg-green-50 border-green-300" : val === e.opcoes[1] ? "bg-amber-50 border-amber-300" : val === e.opcoes[2] ? "bg-orange-50 border-orange-300" : val === e.opcoes[3] ? "bg-red-50 border-red-400" : "bg-stone-50 border-stone-200";
        return (
          <div key={e.id} className={`rounded-xl border-2 p-4 transition-all ${cor}`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="h-7 w-7 rounded-full bg-stone-900 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <h3 className="text-sm font-semibold text-stone-800">{e.titulo}</h3>
            </div>
            <Select value={val} onValueChange={(v) => update({ [e.id]: v } as any)}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Selecione a avaliação..." /></SelectTrigger>
              <SelectContent>{e.opcoes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        );
      })}
      <Field label="Prova independente (D7)" full>
        <Radio value={form.d7_provaIndependente} onChange={(v) => update({ d7_provaIndependente: v })} opcoes={[
          {value:"camera_confirma",label:"Câmera confirma"},
          {value:"testemunha_coerente",label:"Testemunha coerente"},
          {value:"laudo_tecnico_oficial",label:"Laudo técnico oficial"},
          {value:"sem_cameras",label:"Sem câmeras"},
          {value:"testemunha_contradiz",label:"Testemunha contradiz"},
          {value:"bombeiros_nao_acionados",label:"Bombeiros não acionados"},
          {value:"nao_verificado",label:"Não verificado"},
        ]} />
      </Field>
    </SecaoCard>
  );
}

export function S12_Parecer({ form, update, classificacaoAuto }: { form: FormDataFluxos; update: UpdateFn; classificacaoAuto: string | null }) {
  const divergencia = form.parecerAnalista && classificacaoAuto && (
    (form.parecerAnalista === "Aprovado" && classificacaoAuto !== "APROVACAO") ||
    (form.parecerAnalista === "Negado" && classificacaoAuto !== "NEGATIVA") ||
    (form.parecerAnalista === "Sindicância" && classificacaoAuto !== "SINDICANCIA")
  );
  const acoes = ["Aguardar laudo técnico", "BO complementar", "Novo contato associado", "Consulta jurídica", "Relatório rastreador", "Contato terceiro", "Verificação câmeras", "Sindicância em andamento"];
  if (form.tipoSinistro === "incendio") acoes.push("Laudo Corpo de Bombeiros");
  if (form.tipoSinistro === "fenomeno") acoes.push("Registro meteorológico");
  if (form.tipoSinistro === "total") acoes.push("Laudo de perda total");
  const acoesSel: string[] = form.acoesPendentes || [];
  return (
    <SecaoCard numero={12} titulo="Parecer final">
      <Field label="Grau de evidência do nexo" badge="REVISADO" full>
        <SimChoice value={form.grauEvidencia || ""} onChange={(v) => update({ grauEvidencia: v })} options={["Comprovado", "Provável", "Inconclusivo", "Contraindicado"]} />
      </Field>
      <Field label="Parecer do analista" full>
        <SimChoice value={form.parecerAnalista || ""} onChange={(v) => update({ parecerAnalista: v })} options={["Aprovado", "Negado", "Sindicância", "Análise jurídica", "Perícia técnica", "A definir"]} />
      </Field>
      {divergencia && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          ⚠ O parecer manual diverge da classificação automática ({classificacaoAuto}). Justifique abaixo.
        </div>
      )}
      <Grid>
        <Field label="Passivo de negativa"><SimChoice value={form.passivoNeg || ""} onChange={(v) => update({ passivoNeg: v })} options={["Sim", "Não", "A definir"]} /></Field>
        <Field label="Causa da negativa" badge="REVISADO">
          <Select value={form.causaNeg || ""} onValueChange={(v) => update({ causaNeg: v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>{["Exclusão contratual", "Fraude comprovada", "Conduta do associado", "Doc. insuficiente", "Irreg. com nexo", "Uso indevido", "Fenômeno sem cobertura", "Inadimplência", "Outro", "N/A"].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </Grid>
      <Field label="Fundamentação do analista" obrig full>
        <Textarea rows={5} className="min-h-[120px]" value={form.fundamentacao || ""} onChange={(e) => update({ fundamentacao: e.target.value })} />
      </Field>
      <Subhead>Ações pendentes</Subhead>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {acoes.map((a) => {
          const sel = acoesSel.includes(a);
          return (
            <label key={a} className="flex items-center gap-2 text-xs bg-stone-50 border border-stone-200 rounded-md px-2 py-1.5">
              <Checkbox checked={sel} onCheckedChange={(c) => update({ acoesPendentes: c ? [...acoesSel, a] : acoesSel.filter((x) => x !== a) })} />
              {a}
            </label>
          );
        })}
      </div>
      <Field label="Conclusão do comitê" obrig full><Textarea rows={4} value={form.conclusaoComite || ""} onChange={(e) => update({ conclusaoComite: e.target.value })} /></Field>
    </SecaoCard>
  );
}