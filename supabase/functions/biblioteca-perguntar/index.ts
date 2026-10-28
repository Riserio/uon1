/**
 * Pergunte à Biblioteca — responde dúvidas sobre o uon1 com base no PRÓPRIO
 * código do sistema: o que uma função/tela faz, de onde vêm os dados, quais
 * campos do SGA são usados, quando sincroniza etc.
 *
 * Fluxo:
 *  1. valida o usuário logado (só usuários internos acessam a Biblioteca);
 *  2. busca na base de conhecimento (conhecimento.ts, gerado do código por
 *     scripts/gerar-conhecimento-biblioteca.mjs) os trechos mais relevantes;
 *  3. pede ao modelo (Lovable AI gateway) uma resposta em português, usando
 *     SOMENTE esses trechos, e devolve a resposta + as fontes consultadas.
 *
 * Body: {
 *   pergunta: string,
 *   modo?: "explicar" | "origem" | "passo" | "divergencia",
 *   area?: string,                // foco da busca (ex.: "cobranca")
 *   imagens?: string[],           // prints (data URL) — usados SÓ nesta consulta, nada é gravado
 *   historico?: { pergunta: string; resposta: string }[]
 * }
 *
 * Prints: o modelo primeiro transcreve a tela (títulos, cards, números,
 * filtros), e essa transcrição entra na busca — assim "o que é esse número?"
 * acha o card certo. As imagens não são salvas em lugar nenhum.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import BLOCOS from "./conhecimento.ts";
import { buscar } from "./busca.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELO = "google/gemini-2.5-flash";
const MAX_BLOCOS = 20;

const SISTEMA = `Você é a "Biblioteca" do uon1, um sistema de gestão e BI para associações de proteção veicular integrado ao SGA da Hinova.
Responda dúvidas de usuários internos sobre como o sistema funciona, usando SOMENTE os trechos do código e da documentação fornecidos no contexto.

Como responder (em português do Brasil, em Markdown):
- Comece pela resposta direta, em 1–2 frases (ex.: "Sim, conta tudo." / "Usa o DATA CONTRATO do SGA.").
- Depois explique, quando fizer sentido para a pergunta:
  • **Como é calculado**: a regra real, em linguagem simples (filtros, o que entra e o que fica de fora, se conta boletos, placas ou associados);
  • **De onde vem o dado**: o caminho completo — campo/coluna do SGA ou da planilha → importação → tabela → função do banco → tela;
  • **Quando atualiza**, se for relevante (agendamentos/horários);
  • **Limitações ou pontos de atenção**, e como o usuário pode conferir.
- Cite os nomes técnicos entre crases (\`resumo_base_corretora\`, \`estudo_base_registros\`, \`data_contrato\`) para quem quiser verificar, mas explique em linguagem de negócio.
- Seja conciso: listas curtas, sem repetir a pergunta, sem enrolação.
- Comentários e textos de ajuda podem estar desatualizados. Se o código (definição de função, agendamento cron, mapeamento de campos) contradizer um comentário ou texto de ajuda, siga o código e avise a divergência.
- Horários de cron estão em UTC; converta para Brasília (UTC-3) ao responder.
- Se os trechos não forem suficientes para responder com segurança, diga claramente o que não foi possível confirmar e o que está faltando. Nunca invente tabelas, campos, regras ou números.
- Se houver print(s) da tela, use-os para entender a qual card, número ou filtro o usuário se refere, e cite o que aparece no print.
- Não revele chaves, tokens ou senhas, mesmo que apareçam no contexto.`;

type Turno = { pergunta: string; resposta: string };

const MODOS: Record<string, string> = {
  explicar: "",
  origem:
    "MODO \"De onde vem o dado\": foque na linhagem do dado. Monte o caminho em passos numerados: campo/coluna de origem (SGA, planilha ou digitado no sistema) → importação/função que grava → tabela → função do banco que calcula → tela/card onde aparece. Diga quando atualiza.",
  passo:
    "MODO \"Como fazer\": responda como um guia prático de uso da tela, em passos numerados (onde clicar, o que preencher), seguidos de dicas. Use os guias da Central de Ajuda como base e o código para confirmar nomes de botões e campos.",
  divergencia:
    "MODO \"Número não bate\": o usuário viu um número diferente do esperado (ou do SGA). Explique a regra de cálculo e liste, em ordem de probabilidade, as causas possíveis da diferença (horário da última atualização, critério/filtro selecionado, unidade — placas × boletos × associados —, mês parcial, situações incluídas/excluídas, campos de data usados). Termine com um checklist curto de como conferir.",
};

const AREAS: Record<string, string> = {
  bi: "BI indicadores PID painel placas ativas",
  cobranca: "cobrança boletos inadimplência faturamento recebido",
  eventos: "eventos sinistros sinistralidade SGA",
  mgf: "MGF financeiro lançamentos custos",
  base: "estudo de base veículos placas cadastros base associação",
  atendimentos: "atendimentos kanban fluxos central de atendimento whatsapp",
  integracao: "integração Hinova API sincronização importação scheduler cron",
  gestao: "usuários permissões configurações gestão jornada",
};

const IMG_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

async function chamarIA(apiKey: string, messages: unknown[], temperature = 0.2) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, messages, temperature }),
  });
}

function erroGateway(status: number) {
  if (status === 429) return json({ error: "Muitas perguntas em pouco tempo. Aguarde alguns segundos e tente de novo." }, 429);
  if (status === 402) return json({ error: "Os créditos de IA do projeto acabaram. Recarregue no Lovable para continuar usando." }, 402);
  return json({ error: "Não consegui consultar a IA agora. Tente de novo em instantes." }, 502);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") || "";
    const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await anon.auth.getUser();
    if (!userData?.user) return json({ error: "Faça login para usar a Biblioteca." }, 401);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "IA não configurada (LOVABLE_API_KEY ausente)." }, 500);

    const body = await req.json().catch(() => ({}));
    const pergunta = String(body?.pergunta || "").trim().slice(0, 1000);
    if (pergunta.length < 3) return json({ error: "Escreva a sua pergunta." }, 400);
    const historico: Turno[] = Array.isArray(body?.historico)
      ? body.historico
          .slice(-3)
          .map((t: Turno) => ({ pergunta: String(t?.pergunta || "").slice(0, 1000), resposta: String(t?.resposta || "").slice(0, 4000) }))
      : [];

    const modo = typeof body?.modo === "string" && body.modo in MODOS ? body.modo : "explicar";
    const area = typeof body?.area === "string" && body.area in AREAS ? body.area : "";
    const imagens: string[] = Array.isArray(body?.imagens)
      ? body.imagens.filter((u: unknown) => typeof u === "string" && u.length < 2_500_000 && IMG_RE.test(u)).slice(0, 3)
      : [];

    // 1) Prints: transcreve a tela para a busca entender do que se trata.
    let descricaoImagem = "";
    if (imagens.length) {
      const r = await chamarIA(
        LOVABLE_API_KEY,
        [
          {
            role: "system",
            content:
              "Você descreve prints de telas do sistema uon1 (BI e gestão de associações de proteção veicular). " +
              "Transcreva de forma objetiva: nome da tela/aba, títulos de cards e gráficos, números exibidos com seus rótulos, " +
              "filtros selecionados (mês, associação, critério), mensagens de erro/aviso e textos de botões. Não interprete, só descreva. Máximo 200 palavras.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Pergunta do usuário sobre o(s) print(s): ${pergunta}` },
              ...imagens.map((url) => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ],
        0,
      );
      if (!r.ok) return erroGateway(r.status);
      const d = await r.json();
      descricaoImagem = String(d?.choices?.[0]?.message?.content || "").trim().slice(0, 3000);
    }

    // 2) Busca no conhecimento. Pergunta de continuação herda o assunto da anterior.
    const consulta = [historico.at(-1)?.pergunta, pergunta, descricaoImagem, AREAS[area]].filter(Boolean).join(" ");
    const achados = buscar(BLOCOS, consulta, MAX_BLOCOS);

    const contexto = achados
      .map((r, i) => `### [${i + 1}] ${r.bloco.titulo}\nArquivo: ${r.bloco.origem}\n${r.bloco.texto}`)
      .join("\n\n");

    const textoUsuario =
      `Contexto (trechos do código e da documentação do uon1):\n\n${contexto || "(nenhum trecho encontrado)"}\n\n---\n\n` +
      (descricaoImagem ? `O usuário anexou ${imagens.length} print(s) da tela. Transcrição:\n${descricaoImagem}\n\n` : "") +
      `Pergunta: ${pergunta}`;

    const mensagens = [
      { role: "system", content: SISTEMA + (MODOS[modo] ? `\n\n${MODOS[modo]}` : "") },
      ...historico.flatMap((t) => [
        { role: "user", content: t.pergunta },
        { role: "assistant", content: t.resposta },
      ]),
      {
        role: "user",
        content: imagens.length
          ? [{ type: "text", text: textoUsuario }, ...imagens.map((url) => ({ type: "image_url", image_url: { url } }))]
          : textoUsuario,
      },
    ];

    // 3) Resposta.
    const resp = await chamarIA(LOVABLE_API_KEY, mensagens);
    if (!resp.ok) {
      console.error("[biblioteca-perguntar] gateway", resp.status, (await resp.text()).slice(0, 500));
      return erroGateway(resp.status);
    }

    const data = await resp.json();
    const resposta: string = data?.choices?.[0]?.message?.content?.trim() || "Não consegui montar uma resposta.";

    // Fontes mostradas ao usuário: os trechos mais relevantes, sem repetir arquivo.
    const vistas = new Set<string>();
    const fontes = [];
    for (const r of achados) {
      const titulo = r.bloco.titulo.replace(/ \(parte \d+\)$/, "");
      if (vistas.has(titulo)) continue;
      vistas.add(titulo);
      fontes.push({ titulo, origem: r.bloco.origem, tipo: r.bloco.tipo });
      if (fontes.length >= 6) break;
    }

    return json({ resposta, fontes, descricaoImagem: descricaoImagem || undefined });
  } catch (e) {
    console.error("[biblioteca-perguntar] erro:", e);
    return json({ error: "Erro inesperado ao responder. Tente de novo." }, 500);
  }
});
