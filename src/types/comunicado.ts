export interface Comunicado {
  id: string;
  titulo: string;
  mensagem: string;
  link?: string | null;
  imagem_url?: string | null;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  ativo: boolean;
  /** true = também na página pública do Radar; false = somente interno */
  publico: boolean;
}
