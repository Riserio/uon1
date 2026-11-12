import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNomesUsuarios } from "./useNomesUsuarios";

interface Registro {
  id: number;
  user_id: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  dono_id: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  data_hora: string;
}

const ACAO: Record<string, string> = {
  criacao: "Criou",
  edicao: "Editou",
  mudanca_etapa: "Mudou etapa",
  mudanca_status: "Mudou status",
  transferencia: "Transferiu",
  arquivamento: "Arquivou",
  desarquivamento: "Desarquivou",
  cancelamento: "Cancelou",
  solicitacao_cancelamento: "Pediu cancelamento",
  comentario: "Comentou",
  exclusao: "Excluiu",
  cadastro_usuario: "Cadastrou usuário",
  mudanca_vinculo: "Mudou vínculo/equipe",
  mudanca_nivel: "Mudou nível",
  inativacao_usuario: "Inativou usuário",
  reativacao_usuario: "Reativou usuário",
};
const ENTIDADE: Record<string, string> = { lead: "Lead", cotacao: "Cotação", usuario: "Usuário" };

function resumo(r: Registro) {
  const d = r.dados_depois ?? {};
  if (r.acao === "comentario") return String(d.texto ?? "");
  const campos = Object.keys(d).filter((k) => !["id", "created_at", "created_by"].includes(k));
  if (r.acao === "criacao") return String(d.nome ?? (d.numero ? `nº ${d.numero}` : ""));
  return campos.slice(0, 6).join(", ");
}

/** Log de auditoria: Gerente vê o das suas equipes; Admin, tudo (RLS). */
export function AuditoriaTab() {
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ["comercial_auditoria"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comercial_auditoria")
        .select("*")
        .order("data_hora", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Registro[];
    },
  });
  const nomes = useNomesUsuarios(registros.flatMap((r) => [r.user_id, r.dono_id]));

  if (isLoading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <Card className="rounded-2xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Quem</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Registro</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>O que mudou</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registros.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                Nada registrado ainda.
              </TableCell>
            </TableRow>
          )}
          {registros.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums whitespace-nowrap text-muted-foreground">
                {format(new Date(r.data_hora), "dd/MM/yy HH:mm", { locale: ptBR })}
              </TableCell>
              <TableCell>{r.user_id ? nomes.get(r.user_id) ?? "—" : "Sistema"}</TableCell>
              <TableCell>{ACAO[r.acao] ?? r.acao}</TableCell>
              <TableCell>{ENTIDADE[r.entidade] ?? r.entidade}</TableCell>
              <TableCell>{(r.dono_id && nomes.get(r.dono_id)) || "—"}</TableCell>
              <TableCell className="max-w-[320px] truncate text-muted-foreground" title={resumo(r)}>
                {resumo(r)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
