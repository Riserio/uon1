import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Shield, CheckCircle2, Paperclip, X, UserX } from "lucide-react";

const TIPOS = [
  { value: "reclamacao", label: "Reclamação" },
  { value: "sugestao", label: "Sugestão" },
  { value: "elogio", label: "Elogio" },
  { value: "denuncia", label: "Denúncia" },
];

const PRIORIDADES = [
  { value: "baixa", label: "Baixa", color: "bg-green-500" },
  { value: "media", label: "Média", color: "bg-yellow-500" },
  { value: "alta", label: "Alta", color: "bg-red-500" },
];

const CANAIS_RETORNO = [
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ligacao", label: "Ligação" },
];

export default function OuvidoriaPublica() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [corretora, setCorretora] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [protocolo, setProtocolo] = useState<string | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    email: "",
    telefone: "",
    tipo: "",
    descricao: "",
    placa_veiculo: "",
    anonimo: false,
    prioridade: "media",
    canal_retorno: "email",
  });

  const [anexos, setAnexos] = useState<File[]>([]);

  useEffect(() => {
    loadCorretora();
  }, [slug]);

  const loadCorretora = async () => {
    if (!slug) return;
    let corr = null;
    const { data: bySlug } = await supabase
      .from("corretoras")
      .select("id, nome, logo_url")
      .eq("slug", slug)
      .maybeSingle();
    if (bySlug) {
      corr = bySlug;
    } else {
      const { data: byId } = await supabase
        .from("corretoras")
        .select("id, nome, logo_url")
        .eq("id", slug)
        .maybeSingle();
      corr = byId;
    }
    if (!corr) { setLoading(false); return; }
    setCorretora(corr);
    const { data: cfg } = await supabase
      .from("ouvidoria_config")
      .select("*")
      .eq("corretora_id", corr.id)
      .maybeSingle();
    setConfig(cfg);
    setLoading(false);
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => f.size <= 10 * 1024 * 1024); // 10MB max each
    if (valid.length < files.length) toast.error("Arquivos acima de 10MB foram ignorados");
    setAnexos(prev => [...prev, ...valid].slice(0, 5)); // max 5
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAnexo = (idx: number) => setAnexos(prev => prev.filter((_, i) => i !== idx));

  const uploadAnexos = async (registroId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of anexos) {
      const ext = file.name.split('.').pop();
      const path = `ouvidoria/${registroId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("documentos").upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from("documentos").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypotRef.current?.value) return;

    if ((!form.anonimo && !form.nome) || !form.email || !form.tipo || !form.descricao) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setSubmitting(true);
    try {
      // Rate limiting
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

      await supabase.from("ouvidoria_rate_limit").insert({ ip: "client", corretora_id: corretora.id });

      const { data, error } = await supabase
        .from("ouvidoria_registros")
        .insert([{
          corretora_id: corretora.id,
          nome: form.anonimo ? "Anônimo" : form.nome.trim(),
          cpf: form.anonimo ? null : (form.cpf.trim() || null),
          email: form.email.trim(),
          telefone: form.telefone.trim() || null,
          tipo: form.tipo,
          descricao: form.descricao.trim(),
          placa_veiculo: form.placa_veiculo.trim().toUpperCase() || null,
          protocolo: "",
          anonimo: form.anonimo,
          prioridade: form.prioridade,
          canal_retorno: form.canal_retorno,
        }] as any)
        .select("id, protocolo")
        .single();

      if (error) throw error;

      // Upload attachments if any
      if (anexos.length > 0 && data) {
        const urls = await uploadAnexos(data.id);
        if (urls.length > 0) {
          await supabase.from("ouvidoria_registros").update({ anexos_urls: urls } as any).eq("id", data.id);
        }
      }

      setProtocolo(data.protocolo);

      // Fire and forget email
      const tipoLabel = TIPOS.find(t => t.value === form.tipo)?.label || form.tipo;
      const logoHtml = corretora.logo_url ? `<img src="${corretora.logo_url}" alt="${corretora.nome}" style="max-height:60px;margin:0 auto 10px;display:block" />` : "";
      supabase.functions.invoke("enviar-email-ouvidoria", {
        body: {
          to: form.email.trim(),
          subject: `Sua manifestação foi recebida - Protocolo ${data.protocolo}`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><div style="background:${corPrimaria};padding:30px;text-align:center">${logoHtml}<h1 style="color:#fff;margin:0;font-size:24px">Ouvidoria</h1><p style="color:rgba(255,255,255,0.85);margin:5px 0 0">${corretora.nome}</p></div><div style="padding:30px"><h2 style="color:#333;margin:0 0 15px">Olá${form.anonimo ? '' : `, ${form.nome.trim()}`}!</h2><p style="color:#555;line-height:1.6">Sua manifestação foi recebida com sucesso.</p><div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0"><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#888;width:120px">Protocolo:</td><td style="padding:8px 0;color:#333;font-weight:bold;font-size:18px">${data.protocolo}</td></tr><tr><td style="padding:8px 0;color:#888">Tipo:</td><td style="padding:8px 0;color:#333">${tipoLabel}</td></tr><tr><td style="padding:8px 0;color:#888">Data:</td><td style="padding:8px 0;color:#333">${new Date().toLocaleDateString("pt-BR")}</td></tr></table></div><div style="background:#e8f5e9;border-left:4px solid #4caf50;padding:15px;border-radius:0 8px 8px 0;margin:20px 0"><p style="color:#2e7d32;margin:0;font-size:14px">⏱ Prazo de resposta: até 10 dias úteis</p></div></div></div></body></html>`,
        },
      }).catch((err: any) => console.error("[Ouvidoria] Erro ao enviar email de abertura:", err));

      // Send alert email to association
      const alertEmails: string[] = config?.emails_alerta || [];
      if (alertEmails.length > 0) {
        const nomeManifestante = form.anonimo ? "Anônimo" : form.nome.trim();
        const dataFormatada = new Date().toLocaleDateString("pt-BR");
        const horaFormatada = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const descricaoResumida = form.descricao.trim().substring(0, 500) + (form.descricao.length > 500 ? "..." : "");

        // Try to fetch custom template from DB
        let alertHtml = "";
        try {
          const { data: tmplData } = await supabase
            .from("email_templates")
            .select("corpo, assunto")
            .eq("tipo", "ouvidoria_alerta")
            .eq("ativo", true)
            .order("created_at", { ascending: false })
            .limit(1);

          if (tmplData && tmplData.length > 0) {
            alertHtml = tmplData[0].corpo
              .replace(/\{protocolo\}/g, data.protocolo)
              .replace(/\{nome_manifestante\}/g, nomeManifestante)
              .replace(/\{nome_associacao\}/g, corretora.nome)
              .replace(/\{logo_url\}/g, corretora.logo_url || "")
              .replace(/\{tipo\}/g, tipoLabel)
              .replace(/\{prioridade\}/g, form.prioridade || "Normal")
              .replace(/\{descricao\}/g, descricaoResumida)
              .replace(/\{data\}/g, dataFormatada)
              .replace(/\{hora\}/g, horaFormatada);
          }
        } catch (e) {
          console.error("[Ouvidoria] Erro ao buscar template:", e);
        }

        // Fallback to hardcoded template
        if (!alertHtml) {
          alertHtml = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)"><div style="background:#f97316;padding:30px;text-align:center">${logoHtml}<h1 style="color:#fff;margin:0;font-size:24px">🔔 Nova Manifestação</h1><p style="color:rgba(255,255,255,0.85);margin:5px 0 0">Ouvidoria - ${corretora.nome}</p></div><div style="padding:30px"><h2 style="color:#333;margin:0 0 15px">Nova manifestação recebida!</h2><p style="color:#555;line-height:1.6">Uma nova manifestação foi registrada na ouvidoria e requer atenção.</p><div style="background:#fff7ed;border-left:4px solid #f97316;padding:20px;border-radius:0 8px 8px 0;margin:20px 0"><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;color:#888;width:130px">Protocolo:</td><td style="padding:8px 0;color:#333;font-weight:bold;font-size:16px">${data.protocolo}</td></tr><tr><td style="padding:8px 0;color:#888">Manifestante:</td><td style="padding:8px 0;color:#333">${nomeManifestante}</td></tr><tr><td style="padding:8px 0;color:#888">Tipo:</td><td style="padding:8px 0;color:#333">${tipoLabel}</td></tr><tr><td style="padding:8px 0;color:#888">Prioridade:</td><td style="padding:8px 0;color:#333">${form.prioridade || "Normal"}</td></tr><tr><td style="padding:8px 0;color:#888">Data:</td><td style="padding:8px 0;color:#333">${dataFormatada} ${horaFormatada}</td></tr></table></div><div style="background:#f8f9fa;border-radius:8px;padding:15px;margin:20px 0"><p style="color:#888;margin:0 0 5px;font-size:12px;text-transform:uppercase">Descrição:</p><p style="color:#333;margin:0;line-height:1.6">${descricaoResumida}</p></div><p style="color:#888;font-size:12px;text-align:center;margin-top:30px">Acesse o backoffice da ouvidoria para dar andamento.</p></div></div></body></html>`;
        }

        alertEmails.forEach((alertEmail) => {
          supabase.functions.invoke("enviar-email-ouvidoria", {
            body: {
              to: alertEmail,
              subject: `🔔 Nova Manifestação - Protocolo ${data.protocolo} - ${corretora.nome}`,
              html: alertHtml,
            },
          }).catch((err: any) => console.error("[Ouvidoria] Erro ao enviar alerta para associação:", err));
        });
      }
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
              onClick={() => { setProtocolo(null); setForm({ nome: "", cpf: "", email: "", telefone: "", tipo: "", descricao: "", placa_veiculo: "", anonimo: false, prioridade: "media", canal_retorno: "email" }); setAnexos([]); }}
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
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Honeypot */}
              <input ref={honeypotRef} type="text" name="website_url" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: '-9999px', opacity: 0 }} />

              {/* Anonymous toggle */}
              <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/30">
                <div className="flex items-center gap-3">
                  <UserX className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Manifestação anônima</p>
                    <p className="text-xs text-muted-foreground">Seus dados pessoais não serão exibidos</p>
                  </div>
                </div>
                <Switch checked={form.anonimo} onCheckedChange={v => setForm({ ...form, anonimo: v })} />
              </div>

              {/* Personal data - hidden if anonymous */}
              {!form.anonimo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome *</Label>
                    <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome completo" required={!form.anonimo} maxLength={100} />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF</Label>
                    <Input value={form.cpf} onChange={e => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" maxLength={14} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" required maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(00) 00000-0000" maxLength={15} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Placa do Veículo</Label>
                  <Input value={form.placa_veiculo} onChange={e => setForm({ ...form, placa_veiculo: e.target.value.toUpperCase() })} placeholder="ABC1D23" maxLength={7} />
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <Label>Nível de Prioridade *</Label>
                <div className="flex gap-3">
                  {PRIORIDADES.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, prioridade: p.value })}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition-all ${form.prioridade === p.value ? 'border-current shadow-sm' : 'border-transparent bg-muted/40 hover:bg-muted/60'}`}
                      style={form.prioridade === p.value ? { borderColor: corPrimaria, color: corPrimaria } : {}}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Descreva detalhadamente sua manifestação..." required maxLength={2000} rows={5} />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <Label>Anexos (opcional)</Label>
                <div className="rounded-xl border-2 border-dashed p-4 text-center space-y-2 bg-muted/20">
                  <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={handleFileAdd} className="hidden" />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5">
                    <Paperclip className="h-4 w-4" /> Adicionar arquivo
                  </Button>
                  <p className="text-xs text-muted-foreground">Máx. 5 arquivos, 10MB cada (imagens, PDF, DOC)</p>
                </div>
                {anexos.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {anexos.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)}KB</span>
                        <button type="button" onClick={() => removeAnexo(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Canal de retorno */}
              <div className="space-y-3">
                <Label>Como deseja receber o retorno? *</Label>
                <RadioGroup value={form.canal_retorno} onValueChange={v => setForm({ ...form, canal_retorno: v })} className="flex gap-4">
                  {CANAIS_RETORNO.map(c => (
                    <label key={c.value} className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 cursor-pointer transition-all flex-1 justify-center text-sm font-medium ${form.canal_retorno === c.value ? 'shadow-sm' : 'border-transparent bg-muted/40 hover:bg-muted/60'}`}
                      style={form.canal_retorno === c.value ? { borderColor: corPrimaria, color: corPrimaria } : {}}>
                      <RadioGroupItem value={c.value} className="sr-only" />
                      {c.label}
                    </label>
                  ))}
                </RadioGroup>
              </div>

              <Button type="submit" className="w-full" disabled={submitting} style={{ backgroundColor: corBotao, color: corBotaoTexto }}>
                {submitting ? "Enviando..." : "Enviar Manifestação"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
