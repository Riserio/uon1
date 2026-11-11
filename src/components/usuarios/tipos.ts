import { supabase } from "@/integrations/supabase/client";

export type RoleType = "superintendente" | "administrativo" | "lider" | "comercial" | "parceiro";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone?: string;
  cargo?: string;
  cargo_id?: string | null;
  equipe_id?: string;
  lider_id?: string;
  administrativo_id?: string;
  ativo: boolean;
  status: string;
  whatsapp?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  avatar_url?: string | null;
  cpf_cnpj?: string;
}

export interface Equipe {
  id: string;
  nome: string;
  descricao?: string;
  lider_id?: string;
  lideres?: string[];
}

export interface CargoOpcao {
  id: string;
  nome: string;
  cor?: string | null;
  descricao?: string | null;
  ativo?: boolean;
}

export const PERFIS: { id: RoleType; label: string; desc: string }[] = [
  { id: "superintendente", label: "Superintendente", desc: "Acesso total ao sistema" },
  { id: "administrativo", label: "Administrativo", desc: "Gestão interna e cadastros" },
  { id: "lider", label: "Líder", desc: "Lidera uma ou mais equipes" },
  { id: "comercial", label: "Comercial", desc: "Faz parte de uma equipe" },
  { id: "parceiro", label: "Parceiro", desc: "Acesso ao BI pelo portal" },
];

export const nomePerfil = (role?: string | null) =>
  role === "admin" ? "Administrador" : PERFIS.find((p) => p.id === role)?.label ?? role ?? "—";

/** Chamada à edge function create-user (mesma usada pelo cadastro completo). */
export async function criarUsuarioViaFuncao(payload: Record<string, unknown>) {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session) throw new Error("Sessão inválida");
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ loginUrl: `${window.location.origin}/auth`, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const msg = String(result.error || "Erro ao criar usuário").replace(/^EMAIL_EXISTS:\s*/, "");
    throw new Error(msg);
  }
  return {
    userId: (result.userId || result.user?.id || null) as string | null,
    emailAcessoEnviado: !!result.emailAcessoEnviado,
  };
}
