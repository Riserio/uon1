import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, CheckCircle2 } from "lucide-react";

const TIPOS = [
  { value: "reclamacao", label: "Reclamação" },
  { value: "sugestao", label: "Sugestão" },
  { value: "elogio", label: "Elogio" },
  { value: "denuncia", label: "Denúncia" },
];

export default function OuvidoriaPublica() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [corretora, setCorretora] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [protocolo, setProtocolo] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    tipo: "",
    descricao: "",
    placa_veiculo: "",
  });

  useEffect(() => {
    loadCorretora();
  }, [slug]);

  const loadCorretora = async () => {
    if (!slug) return;
    
    // Try lookup by slug first, then by ID
    let corr = null;
    const { data: bySlug } = await supabase
      .from("corretoras")
      .select("id, nome, logo_url")
      .eq("slug", slug)
      .maybeSingle();
    
    if (bySlug) {
      corr = bySlug;
    } else {
      // Fallback: try by ID
      const { data: byId } = await supabase
        .from("corretoras")
        .select("id, nome, logo_url")
        .eq("id", slug)
        .maybeSingle();
      corr = byId;
    }

    if (!corr) {
      setLoading(false);
      return;
    }
    setCorretora(corr);

    const { data: cfg } = await supabase
      .from("ouvidoria_config")
      .select("*")
      .eq("corretora_id", corr.id)
      .maybeSingle();

    setConfig(cfg);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check
    if (honeypotRef.current?.value) return;

    if (!form.nome || !form.email || !form.tipo || !form.descricao) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setSubmitting(true);

    try {
      // Rate limiting check
      const { data: recentSubmissions } = await supabase
        .from("ouvidoria_rate_limit")
        .select("id")
        .eq("corretora_id", corretora.id)
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

      if (recentSubmissions && recentSubmissions.length >= 5) {
        toast.error("Muitas submissões recentes. Tente novamente mais tarde.");
        setSubmitting(false);
        return;
      }

      // Record rate limit
      await supabase.from("ouvidoria_rate_limit").insert({
        ip: "client",
        corretora_id: corretora.id,
      });

      // Insert registro
      const { data, error } = await supabase
        .from("ouvidoria_registros")
        .insert([{
          corretora_id: corretora.id,
          nome: form.nome.trim(),
          cpf: form.cpf.trim() || null,
          email: form.email.trim(),
          telefone: form.telefone.trim() || null,
          tipo: form.tipo,
          descricao: form.descricao.trim(),
          placa_veiculo: form.placa_veiculo.trim().toUpperCase() || null,
          protocolo: "",
        }])
        .select("protocolo")
        .single();

      if (error) throw error;
      setProtocolo(data.protocolo);

      // Send confirmation email via edge function (fire and forget)
      const tipoLabel = TIPOS.find(t => t.value === form.tipo)?.label || form.tipo;
      supabase.functions.invoke("enviar-email-smtp", {
        body: {
          to: form.email.trim(),
          subject: `Sua manifestação foi recebida - Protocolo ${data.protocolo}`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><div style="background:${corPrimaria};padding:30px;text-align:center"><h1 style="color:#fff;margin:0;font-size:24px">Ouvidoria</h1><p style="color:rgba(255,255,255,0.85);margin:5px 0 0">${corretora.nome}</p></div><div style="padding:30px"><h2 style="color:#333;margin:0 0 15px">Olá, ${form.nome.trim()}!</h2><p style="color:#555;line-height:1.6">Sua manifestação foi recebida com sucesso. Abaixo estão os detalhes:</p><div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0"><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#888;width:120px">Protocolo:</td><td style="padding:8px 0;color:#333;font-weight:bold;font-size:18px">${data.protocolo}</td></tr><tr><td style="padding:8px 0;color:#888">Tipo:</td><td style="padding:8px 0;color:#333">${tipoLabel}</td></tr><tr><td style="padding:8px 0;color:#888">Data:</td><td style="padding:8px 0;color:#333">${new Date().toLocaleDateString("pt-BR")}</td></tr></table></div><p style="color:#555;line-height:1.6">Guarde o número do protocolo para acompanhamento futuro. Nossa equipe analisará sua manifestação e, se necessário, entraremos em contato.</p><div style="background:#e8f5e9;border-left:4px solid #4caf50;padding:15px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#2e7d32;margin:0;font-size:14px">⏱ Prazo de resposta: até 10 dias úteis</p></div></div><div style="background:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #eee"><p style="color:#999;font-size:12px;margin:0">Este é um e-mail automático. Por favor, não responda.</p></div></div></body></html>`,
        },
      }).catch(() => {}); // fire and forget
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao enviar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const corPrimaria = config?.cor_primaria || "#1e40af";
  const corBotao = config?.cor_botao || corPrimaria;
  const corBotaoTexto = config?.cor_botao_texto || "#ffffff";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: corPrimaria, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!corretora) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Associação não encontrada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (protocolo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto" style={{ color: corPrimaria }} />
            <h2 className="text-2xl font-bold">Registro Enviado!</h2>
            <p className="text-muted-foreground">Sua manifestação foi recebida com sucesso.</p>
            <div className="rounded-lg p-4 border-2" style={{ borderColor: corPrimaria, backgroundColor: `${corPrimaria}10` }}>
              <p className="text-sm text-muted-foreground">Seu protocolo</p>
              <p className="text-2xl font-mono font-bold" style={{ color: corPrimaria }}>{protocolo}</p>
            </div>
            <p className="text-sm text-muted-foreground">Guarde este número para acompanhamento.</p>
            <Button
              onClick={() => { setProtocolo(null); setForm({ nome: "", cpf: "", email: "", telefone: "", tipo: "", descricao: "", placa_veiculo: "" }); }}
              style={{ backgroundColor: corBotao, color: corBotaoTexto }}
            >
              Enviar nova manifestação
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3 pt-8">
          {corretora.logo_url && (
            <img src={corretora.logo_url} alt={corretora.nome} className="h-16 mx-auto object-contain" />
          )}
          <h1 className="text-3xl font-bold" style={{ color: corPrimaria }}>Ouvidoria</h1>
          <p className="text-muted-foreground">{corretora.nome}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" style={{ color: corPrimaria }} />
              Registrar Manifestação
            </CardTitle>
            <CardDescription>
              Preencha o formulário abaixo. Campos com * são obrigatórios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot */}
              <input
                ref={honeypotRef}
                type="text"
                name="website_url"
                tabIndex={-1}
                autoComplete="off"
                style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Seu nome completo"
                    required
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPF</Label>
                  <Input
                    value={form.cpf}
                    onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="seu@email.com"
                    required
                    maxLength={255}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={form.telefone}
                    onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Placa do Veículo</Label>
                  <Input
                    value={form.placa_veiculo}
                    onChange={(e) => setForm({ ...form, placa_veiculo: e.target.value.toUpperCase() })}
                    placeholder="ABC1D23"
                    maxLength={7}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Descreva detalhadamente sua manifestação..."
                  required
                  maxLength={2000}
                  rows={5}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
                style={{ backgroundColor: corBotao, color: corBotaoTexto }}
              >
                {submitting ? "Enviando..." : "Enviar Manifestação"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
