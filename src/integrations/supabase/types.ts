export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      administradora: {
        Row: {
          cnpj: string | null
          created_at: string | null
          email: string | null
          endereco: string | null
          id: string
          logo_url: string | null
          nome: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      andamentos: {
        Row: {
          atendimento_id: string
          created_at: string
          created_by: string
          descricao: string
          id: string
          updated_at: string
        }
        Insert: {
          atendimento_id: string
          created_at?: string
          created_by: string
          descricao: string
          id?: string
          updated_at?: string
        }
        Update: {
          atendimento_id?: string
          created_at?: string
          created_by?: string
          descricao?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "andamentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          colors: Json | null
          created_at: string | null
          id: string
          login_image_url: string | null
          logo_url: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          colors?: Json | null
          created_at?: string | null
          id?: string
          login_image_url?: string | null
          logo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          colors?: Json | null
          created_at?: string | null
          id?: string
          login_image_url?: string | null
          logo_url?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      atendimento_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_url: string
          atendimento_id: string
          created_at: string
          created_by: string
          id: string
          tipo_arquivo: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_url: string
          atendimento_id: string
          created_at?: string
          created_by: string
          id?: string
          tipo_arquivo?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_url?: string
          atendimento_id?: string
          created_at?: string
          created_by?: string
          id?: string
          tipo_arquivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_anexos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_atendimento"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          arquivado: boolean | null
          assunto: string
          contato_id: string | null
          corretora_id: string | null
          created_at: string
          data_concluido: string | null
          data_retorno: string | null
          fluxo_concluido_id: string | null
          fluxo_concluido_nome: string | null
          fluxo_id: string | null
          id: string
          numero: number
          observacoes: string | null
          prioridade: Database["public"]["Enums"]["priority_type"]
          responsavel_id: string | null
          status: string
          status_changed_at: string | null
          tags: string[] | null
          tipo_atendimento: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          arquivado?: boolean | null
          assunto: string
          contato_id?: string | null
          corretora_id?: string | null
          created_at?: string
          data_concluido?: string | null
          data_retorno?: string | null
          fluxo_concluido_id?: string | null
          fluxo_concluido_nome?: string | null
          fluxo_id?: string | null
          id?: string
          numero?: number
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["priority_type"]
          responsavel_id?: string | null
          status?: string
          status_changed_at?: string | null
          tags?: string[] | null
          tipo_atendimento?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          arquivado?: boolean | null
          assunto?: string
          contato_id?: string | null
          corretora_id?: string | null
          created_at?: string
          data_concluido?: string | null
          data_retorno?: string | null
          fluxo_concluido_id?: string | null
          fluxo_concluido_nome?: string | null
          fluxo_id?: string | null
          id?: string
          numero?: number
          observacoes?: string | null
          prioridade?: Database["public"]["Enums"]["priority_type"]
          responsavel_id?: string | null
          status?: string
          status_changed_at?: string | null
          tags?: string[] | null
          tipo_atendimento?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_fluxo_concluido_id_fkey"
            columns: ["fluxo_concluido_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos_historico: {
        Row: {
          acao: string
          atendimento_id: string
          campos_alterados: Json | null
          created_at: string
          id: string
          user_id: string
          user_nome: string
          valores_anteriores: Json | null
          valores_novos: Json | null
        }
        Insert: {
          acao: string
          atendimento_id: string
          campos_alterados?: Json | null
          created_at?: string
          id?: string
          user_id: string
          user_nome: string
          valores_anteriores?: Json | null
          valores_novos?: Json | null
        }
        Update: {
          acao?: string
          atendimento_id?: string
          campos_alterados?: Json | null
          created_at?: string
          id?: string
          user_id?: string
          user_nome?: string
          valores_anteriores?: Json | null
          valores_novos?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_historico_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicados: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          id: string
          imagem_url: string | null
          link: string | null
          mensagem: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por: string
          id?: string
          imagem_url?: string | null
          link?: string | null
          mensagem: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          id?: string
          imagem_url?: string | null
          link?: string | null
          mensagem?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      contatos: {
        Row: {
          cargo: string | null
          corretora_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          facebook: string | null
          id: string
          instagram: string | null
          linkedin: string | null
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cargo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cargo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          linkedin?: string | null
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      corretoras: {
        Row: {
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          logo_url: string | null
          nome: string
          observacoes: string | null
          responsavel: string | null
          susep: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          observacoes?: string | null
          responsavel?: string | null
          susep?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          observacoes?: string | null
          responsavel?: string | null
          susep?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documentos: {
        Row: {
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_url: string
          created_at: string
          criado_por: string
          descricao: string | null
          id: string
          tipo_arquivo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_url: string
          created_at?: string
          criado_por: string
          descricao?: string | null
          id?: string
          tipo_arquivo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_url?: string
          created_at?: string
          criado_por?: string
          descricao?: string | null
          id?: string
          tipo_arquivo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_auto_config: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_config: {
        Row: {
          created_at: string | null
          from_email: string
          from_name: string
          id: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_user: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          from_email: string
          from_name: string
          id?: string
          smtp_host: string
          smtp_password: string
          smtp_port?: number
          smtp_user: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          from_email?: string
          from_name?: string
          id?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_user?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_historico: {
        Row: {
          assunto: string
          atendimento_id: string
          corpo: string
          created_at: string | null
          destinatario: string
          enviado_em: string | null
          enviado_por: string
          erro_mensagem: string | null
          id: string
          status: string
        }
        Insert: {
          assunto: string
          atendimento_id: string
          corpo: string
          created_at?: string | null
          destinatario: string
          enviado_em?: string | null
          enviado_por: string
          erro_mensagem?: string | null
          id?: string
          status?: string
        }
        Update: {
          assunto?: string
          atendimento_id?: string
          corpo?: string
          created_at?: string | null
          destinatario?: string
          enviado_em?: string | null
          enviado_por?: string
          erro_mensagem?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_historico_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          agendado_para: string | null
          assunto: string
          atendimento_id: string | null
          corpo: string
          created_at: string | null
          destinatario: string
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          max_tentativas: number | null
          prioridade: number | null
          status: string
          tentativas: number | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          agendado_para?: string | null
          assunto: string
          atendimento_id?: string | null
          corpo: string
          created_at?: string | null
          destinatario: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number | null
          prioridade?: number | null
          status?: string
          tentativas?: number | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          agendado_para?: string | null
          assunto?: string
          atendimento_id?: string | null
          corpo?: string
          created_at?: string | null
          destinatario?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number | null
          prioridade?: number | null
          status?: string
          tentativas?: number | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_rate_limits: {
        Row: {
          created_at: string | null
          emails_sent: number | null
          id: string
          limite_diario: number | null
          periodo_inicio: string | null
          provider: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          emails_sent?: number | null
          id?: string
          limite_diario?: number | null
          periodo_inicio?: string | null
          provider: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          emails_sent?: number | null
          id?: string
          limite_diario?: number | null
          periodo_inicio?: string | null
          provider?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          assunto: string
          ativo: boolean | null
          corpo: string
          created_at: string | null
          id: string
          nome: string
          status: string[] | null
          tipo: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assunto: string
          ativo?: boolean | null
          corpo: string
          created_at?: string | null
          id?: string
          nome: string
          status?: string[] | null
          tipo?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assunto?: string
          ativo?: boolean | null
          corpo?: string
          created_at?: string | null
          id?: string
          nome?: string
          status?: string[] | null
          tipo?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      equipe_lideres: {
        Row: {
          created_at: string | null
          equipe_id: string
          id: string
          lider_id: string
        }
        Insert: {
          created_at?: string | null
          equipe_id: string
          id?: string
          lider_id: string
        }
        Update: {
          created_at?: string | null
          equipe_id?: string
          id?: string
          lider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_lideres_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_lideres_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipes: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          lider_id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          lider_id: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          lider_id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipes_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          cor: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          google_event_id: string | null
          id: string
          lembrete_minutos: number[] | null
          local: string | null
          tipo: string | null
          titulo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          google_event_id?: string | null
          id?: string
          lembrete_minutos?: number[] | null
          local?: string | null
          tipo?: string | null
          titulo: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          google_event_id?: string | null
          id?: string
          lembrete_minutos?: number[] | null
          local?: string | null
          tipo?: string | null
          titulo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      fluxos: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          descricao: string | null
          gera_proximo_automatico: boolean
          id: string
          nome: string
          ordem: number
          proximo_fluxo_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          gera_proximo_automatico?: boolean
          id?: string
          nome: string
          ordem?: number
          proximo_fluxo_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          gera_proximo_automatico?: boolean
          id?: string
          nome?: string
          ordem?: number
          proximo_fluxo_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fluxos_proximo_fluxo_id_fkey"
            columns: ["proximo_fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_integrations: {
        Row: {
          access_token: string
          connected_at: string
          created_at: string
          id: string
          last_sync_at: string | null
          refresh_token: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lembretes_disparados: {
        Row: {
          created_at: string | null
          disparado_em: string | null
          evento_id: string
          id: string
          user_id: string
          visualizado: boolean | null
        }
        Insert: {
          created_at?: string | null
          disparado_em?: string | null
          evento_id: string
          id?: string
          user_id: string
          visualizado?: boolean | null
        }
        Update: {
          created_at?: string | null
          disparado_em?: string | null
          evento_id?: string
          id?: string
          user_id?: string
          visualizado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_disparados_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      links_uteis: {
        Row: {
          categoria: string | null
          created_at: string
          criado_por: string
          descricao: string | null
          id: string
          titulo: string
          updated_at: string
          url: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          criado_por: string
          descricao?: string | null
          id?: string
          titulo: string
          updated_at?: string
          url: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          criado_por?: string
          descricao?: string | null
          id?: string
          titulo?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          anexos: Json | null
          assunto: string
          created_at: string
          destinatario_id: string
          em_resposta_a: string | null
          id: string
          lida: boolean
          mensagem: string
          remetente_id: string
          updated_at: string
        }
        Insert: {
          anexos?: Json | null
          assunto: string
          created_at?: string
          destinatario_id: string
          em_resposta_a?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          remetente_id: string
          updated_at?: string
        }
        Update: {
          anexos?: Json | null
          assunto?: string
          created_at?: string
          destinatario_id?: string
          em_resposta_a?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          remetente_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_em_resposta_a_fkey"
            columns: ["em_resposta_a"]
            isOneToOne: false
            referencedRelation: "mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_alertas: {
        Row: {
          created_at: string
          enviado_para: Json
          id: string
          meta_esperada: number
          periodo_analise: string
          responsavel_id: string
          tipo_alerta: string
          valor_atual: number
        }
        Insert: {
          created_at?: string
          enviado_para?: Json
          id?: string
          meta_esperada: number
          periodo_analise: string
          responsavel_id: string
          tipo_alerta: string
          valor_atual: number
        }
        Update: {
          created_at?: string
          enviado_para?: Json
          id?: string
          meta_esperada?: number
          periodo_analise?: string
          responsavel_id?: string
          tipo_alerta?: string
          valor_atual?: number
        }
        Relationships: []
      }
      performance_metas: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          meta_minima_atendimentos: number
          meta_taxa_conclusao: number
          meta_tempo_medio_horas: number
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          meta_minima_atendimentos?: number
          meta_taxa_conclusao?: number
          meta_tempo_medio_horas?: number
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          meta_minima_atendimentos?: number
          meta_taxa_conclusao?: number
          meta_tempo_medio_horas?: number
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          administrativo_id: string | null
          ativo: boolean
          avatar_url: string | null
          cargo: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string
          equipe_id: string | null
          facebook: string | null
          id: string
          instagram: string | null
          lider_id: string | null
          linkedin: string | null
          nome: string
          status: string | null
          telefone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          administrativo_id?: string | null
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email: string
          equipe_id?: string | null
          facebook?: string | null
          id: string
          instagram?: string | null
          lider_id?: string | null
          linkedin?: string | null
          nome: string
          status?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          administrativo_id?: string | null
          ativo?: boolean
          avatar_url?: string | null
          cargo?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string
          equipe_id?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          lider_id?: string | null
          linkedin?: string | null
          nome?: string
          status?: string | null
          telefone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_administrativo_id_fkey"
            columns: ["administrativo_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_config: {
        Row: {
          created_at: string
          from_email: string
          from_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_email: string
          from_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_email?: string
          from_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      status_config: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          fluxo_id: string | null
          id: string
          is_final: boolean | null
          nome: string
          ordem: number
          prazo_horas: number
          tipo_etapa: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          fluxo_id?: string | null
          id?: string
          is_final?: boolean | null
          nome: string
          ordem?: number
          prazo_horas?: number
          tipo_etapa?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          fluxo_id?: string | null
          id?: string
          is_final?: boolean | null
          nome?: string
          ordem?: number
          prazo_horas?: number
          tipo_etapa?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_config_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      status_publicos_config: {
        Row: {
          created_at: string | null
          descricao_publica: string | null
          fluxo_id: string
          id: string
          ordem_exibicao: number | null
          status_nome: string
          updated_at: string | null
          visivel_publico: boolean | null
        }
        Insert: {
          created_at?: string | null
          descricao_publica?: string | null
          fluxo_id: string
          id?: string
          ordem_exibicao?: number | null
          status_nome: string
          updated_at?: string | null
          visivel_publico?: boolean | null
        }
        Update: {
          created_at?: string | null
          descricao_publica?: string | null
          fluxo_id?: string
          id?: string
          ordem_exibicao?: number | null
          status_nome?: string
          updated_at?: string | null
          visivel_publico?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "status_publicos_config_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
        ]
      }
      termos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          ativo: boolean | null
          corretora_id: string | null
          created_at: string | null
          created_by: string
          descricao: string | null
          id: string
          obrigatorio: boolean | null
          ordem: number | null
          tipo_sinistro: string[] | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          ativo?: boolean | null
          corretora_id?: string | null
          created_at?: string | null
          created_by: string
          descricao?: string | null
          id?: string
          obrigatorio?: boolean | null
          ordem?: number | null
          tipo_sinistro?: string[] | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          ativo?: boolean | null
          corretora_id?: string | null
          created_at?: string | null
          created_by?: string
          descricao?: string | null
          id?: string
          obrigatorio?: boolean | null
          ordem?: number | null
          tipo_sinistro?: string[] | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "termos_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
      termos_aceitos: {
        Row: {
          aceito_em: string | null
          id: string
          ip_address: string | null
          termo_id: string
          user_agent: string | null
          vistoria_id: string
        }
        Insert: {
          aceito_em?: string | null
          id?: string
          ip_address?: string | null
          termo_id: string
          user_agent?: string | null
          vistoria_id: string
        }
        Update: {
          aceito_em?: string | null
          id?: string
          ip_address?: string | null
          termo_id?: string
          user_agent?: string | null
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "termos_aceitos_termo_id_fkey"
            columns: ["termo_id"]
            isOneToOne: false
            referencedRelation: "termos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "termos_aceitos_vistoria_id_fkey"
            columns: ["vistoria_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id"]
          },
        ]
      }
      user_fluxo_permissions: {
        Row: {
          created_at: string
          created_by: string | null
          fluxo_id: string
          id: string
          pode_editar: boolean
          pode_visualizar: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fluxo_id: string
          id?: string
          pode_editar?: boolean
          pode_visualizar?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fluxo_id?: string
          id?: string
          pode_editar?: boolean
          pode_visualizar?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_fluxo_permissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_fluxo_permissions_fluxo_id_fkey"
            columns: ["fluxo_id"]
            isOneToOne: false
            referencedRelation: "fluxos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_fluxo_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vistoria_fotos: {
        Row: {
          analise_ia: Json | null
          analise_manual: boolean | null
          aprovada_em: string | null
          aprovada_por: string | null
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_url: string
          created_at: string
          id: string
          observacao_reprovacao: string | null
          ordem: number
          posicao: string
          status_analise: string | null
          status_aprovacao: string | null
          vistoria_id: string
        }
        Insert: {
          analise_ia?: Json | null
          analise_manual?: boolean | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_url: string
          created_at?: string
          id?: string
          observacao_reprovacao?: string | null
          ordem: number
          posicao: string
          status_analise?: string | null
          status_aprovacao?: string | null
          vistoria_id: string
        }
        Update: {
          analise_ia?: Json | null
          analise_manual?: boolean | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_url?: string
          created_at?: string
          id?: string
          observacao_reprovacao?: string | null
          ordem?: number
          posicao?: string
          status_analise?: string | null
          status_aprovacao?: string | null
          vistoria_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_fotos_vistoria_id_fkey"
            columns: ["vistoria_id"]
            isOneToOne: false
            referencedRelation: "vistorias"
            referencedColumns: ["id"]
          },
        ]
      }
      vistorias: {
        Row: {
          analise_ia: Json | null
          assinatura_url: string | null
          atendimento_id: string | null
          atestado_obito_url: string | null
          bo_url: string | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          cnh_dados: Json | null
          cnh_url: string | null
          cof: string | null
          completed_at: string | null
          condutor_veiculo: string | null
          corretora_id: string | null
          created_at: string
          created_by: string
          crlv_fotos_urls: string[] | null
          croqui_acidente_url: string | null
          custo_acordo: number | null
          custo_oficina: number | null
          custo_perda_parcial: number | null
          custo_perda_total: number | null
          custo_reparo: number | null
          custo_terceiros: number | null
          danos_detectados: string[] | null
          data_evento: string | null
          data_incidente: string | null
          dias_validade: number | null
          endereco: string | null
          fez_bo: boolean | null
          foi_hospital: boolean | null
          hora_evento: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          latitude: number | null
          laudo_alcoolemia_url: string | null
          laudo_medico_url: string | null
          link_expires_at: string | null
          link_token: string | null
          local_tem_camera: boolean | null
          longitude: number | null
          motorista_faleceu: boolean | null
          narrar_fatos: string | null
          numero: number
          observacoes_ia: string | null
          placa_terceiro: string | null
          policia_foi_local: boolean | null
          relato_incidente: string | null
          relatorio_url: string | null
          status: string
          tem_terceiros: boolean | null
          tipo_abertura: string
          tipo_sinistro: string | null
          tipo_vistoria: string
          updated_at: string
          valor_franquia: number | null
          valor_indenizacao: number | null
          veiculo_ano: string | null
          veiculo_chassi: string | null
          veiculo_cor: string | null
          veiculo_marca: string | null
          veiculo_modelo: string | null
          veiculo_placa: string | null
          vitima_ou_causador: string | null
        }
        Insert: {
          analise_ia?: Json | null
          assinatura_url?: string | null
          atendimento_id?: string | null
          atestado_obito_url?: string | null
          bo_url?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cnh_dados?: Json | null
          cnh_url?: string | null
          cof?: string | null
          completed_at?: string | null
          condutor_veiculo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by: string
          crlv_fotos_urls?: string[] | null
          croqui_acidente_url?: string | null
          custo_acordo?: number | null
          custo_oficina?: number | null
          custo_perda_parcial?: number | null
          custo_perda_total?: number | null
          custo_reparo?: number | null
          custo_terceiros?: number | null
          danos_detectados?: string[] | null
          data_evento?: string | null
          data_incidente?: string | null
          dias_validade?: number | null
          endereco?: string | null
          fez_bo?: boolean | null
          foi_hospital?: boolean | null
          hora_evento?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          latitude?: number | null
          laudo_alcoolemia_url?: string | null
          laudo_medico_url?: string | null
          link_expires_at?: string | null
          link_token?: string | null
          local_tem_camera?: boolean | null
          longitude?: number | null
          motorista_faleceu?: boolean | null
          narrar_fatos?: string | null
          numero?: number
          observacoes_ia?: string | null
          placa_terceiro?: string | null
          policia_foi_local?: boolean | null
          relato_incidente?: string | null
          relatorio_url?: string | null
          status?: string
          tem_terceiros?: boolean | null
          tipo_abertura: string
          tipo_sinistro?: string | null
          tipo_vistoria: string
          updated_at?: string
          valor_franquia?: number | null
          valor_indenizacao?: number | null
          veiculo_ano?: string | null
          veiculo_chassi?: string | null
          veiculo_cor?: string | null
          veiculo_marca?: string | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          vitima_ou_causador?: string | null
        }
        Update: {
          analise_ia?: Json | null
          assinatura_url?: string | null
          atendimento_id?: string | null
          atestado_obito_url?: string | null
          bo_url?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cnh_dados?: Json | null
          cnh_url?: string | null
          cof?: string | null
          completed_at?: string | null
          condutor_veiculo?: string | null
          corretora_id?: string | null
          created_at?: string
          created_by?: string
          crlv_fotos_urls?: string[] | null
          croqui_acidente_url?: string | null
          custo_acordo?: number | null
          custo_oficina?: number | null
          custo_perda_parcial?: number | null
          custo_perda_total?: number | null
          custo_reparo?: number | null
          custo_terceiros?: number | null
          danos_detectados?: string[] | null
          data_evento?: string | null
          data_incidente?: string | null
          dias_validade?: number | null
          endereco?: string | null
          fez_bo?: boolean | null
          foi_hospital?: boolean | null
          hora_evento?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          latitude?: number | null
          laudo_alcoolemia_url?: string | null
          laudo_medico_url?: string | null
          link_expires_at?: string | null
          link_token?: string | null
          local_tem_camera?: boolean | null
          longitude?: number | null
          motorista_faleceu?: boolean | null
          narrar_fatos?: string | null
          numero?: number
          observacoes_ia?: string | null
          placa_terceiro?: string | null
          policia_foi_local?: boolean | null
          relato_incidente?: string | null
          relatorio_url?: string | null
          status?: string
          tem_terceiros?: boolean | null
          tipo_abertura?: string
          tipo_sinistro?: string | null
          tipo_vistoria?: string
          updated_at?: string
          valor_franquia?: number | null
          valor_indenizacao?: number | null
          veiculo_ano?: string | null
          veiculo_chassi?: string | null
          veiculo_cor?: string | null
          veiculo_marca?: string | null
          veiculo_modelo?: string | null
          veiculo_placa?: string | null
          vitima_ou_causador?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vistorias_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistorias_corretora_id_fkey"
            columns: ["corretora_id"]
            isOneToOne: false
            referencedRelation: "corretoras"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      administrativo_can_view_profile: {
        Args: { target_profile_id: string; viewer_id: string }
        Returns: boolean
      }
      can_send_email: { Args: { provider_name: string }; Returns: boolean }
      can_view_profile: {
        Args: { target_profile_id: string; viewer_id: string }
        Returns: boolean
      }
      get_user_lider_id: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_email_rate_limits: { Args: never; Returns: undefined }
      user_can_access_fluxo: {
        Args: { _fluxo_id: string; _require_edit?: boolean; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "lider"
        | "comercial"
        | "superintendente"
        | "administrativo"
      priority_type: "Alta" | "Média" | "Baixa"
      status_type: "novo" | "andamento" | "aguardo" | "concluido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "lider",
        "comercial",
        "superintendente",
        "administrativo",
      ],
      priority_type: ["Alta", "Média", "Baixa"],
      status_type: ["novo", "andamento", "aguardo", "concluido"],
    },
  },
} as const
