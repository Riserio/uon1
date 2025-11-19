export interface Comunicado {
  id: string;
  titulo: string;
  mensagem: string;
  link?: string;
  imagem_url?: string;
  criado_por: string;
  created_at: string;
  updated_at: string;
  ativo: boolean;
}
