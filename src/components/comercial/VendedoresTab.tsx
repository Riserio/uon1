import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, Pencil, Plus, QrCode, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MaskedInput } from "@/components/ui/masked-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ComercialFunil, ComercialLead, ComercialVendedor } from "./types";
import { QrCodeDialog } from "./QrCodeDialog";
import { formatarWhatsapp, linkCaptura, linkWhatsapp, slugify, somenteDigitos } from "./utils";

interface Props {
  funil: ComercialFunil;
  vendedores: ComercialVendedor[];
  leads: ComercialLead[];
  ganhoIds: Set<string>;
}

export function VendedoresTab({ funil, vendedores, leads, ganhoIds }: Props) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<ComercialVendedor | null>(null);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoEditado, setCodigoEditado] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [qr, setQr] = useState<{ titulo: string; subtitulo: string; link: string } | null>(null);

  const abrir = (v: ComercialVendedor | null) => {
    setEditando(v);
    setNome(v?.nome ?? "");
    setCodigo(v?.codigo ?? "");
    setCodigoEditado(!!v);
    setWhatsapp(somenteDigitos(v?.whatsapp));
    setEmail(v?.email ?? "");
    setAberto(true);
  };

  const invalidar = () => qc.invalidateQueries({ queryKey: ["comercial_vendedores"] });

  const salvar = useMutation({
    mutationFn: async () => {
      const c = slugify(codigo || nome);
      if (nome.trim().length < 2 || !c) throw new Error("Informe o nome do vendedor");
      const payload = { nome: nome.trim(), codigo: c, whatsapp: somenteDigitos(whatsapp) || null, email: email.trim() || null };
      const q = (supabase as any).from("comercial_vendedores");
      const { error } = editando ? await q.update(payload).eq("id", editando.id) : await q.insert(payload);
      if (error) {
        if (error.code === "23505") throw new Error(`O código “${c}” já é de outro vendedor`);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Vendedor salvo");
      invalidar();
      setAberto(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const alternarAtivo = useMutation({
    mutationFn: async (v: ComercialVendedor) => {
      const { error } = await (supabase as any).from("comercial_vendedores").update({ ativo: !v.ativo }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e.message),
  });

  const stats = (id: string) => {
    const meus = leads.filter((l) => l.vendedor_id === id);
    return { total: meus.length, ganhos: meus.filter((l) => ganhoIds.has(l.etapa_id)).length };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          O QR code abre o cadastro de <b>{funil.nome}</b> com o vendedor já preenchido. O lead entra
          na primeira etapa, no nome dele.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setQr({
                titulo: funil.nome,
                subtitulo: "QR geral — leads entram sem vendedor.",
                link: linkCaptura(funil.slug),
              })
            }
          >
            <QrCode className="h-4 w-4 mr-1" /> QR geral
          </Button>
          <Button onClick={() => abrir(null)}>
            <Plus className="h-4 w-4 mr-1" /> Novo vendedor
          </Button>
        </div>
      </div>

      {vendedores.length === 0 ? (
        <Card className="rounded-2xl bg-muted/40">
          <CardContent className="py-14 text-center space-y-3">
            <Users className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum vendedor cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vendedores.map((v) => {
            const s = stats(v.id);
            const zap = linkWhatsapp(v.whatsapp);
            return (
              <Card key={v.id} className={`rounded-2xl ${v.ativo ? "" : "opacity-60"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{v.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">/c/{funil.slug}/{v.codigo}</p>
                    </div>
                    <Switch checked={v.ativo} onCheckedChange={() => alternarAtivo.mutate(v)} title="Ativo" />
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
                    <span>{s.total} leads neste funil</span>
                    <span>{s.ganhos} fechados</span>
                    {v.whatsapp && <span>{formatarWhatsapp(v.whatsapp)}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!v.ativo}
                      onClick={() =>
                        setQr({
                          titulo: v.nome,
                          subtitulo: `Cadastro em ${funil.nome}`,
                          link: linkCaptura(funil.slug, v.codigo),
                        })
                      }
                    >
                      <QrCode className="h-3.5 w-3.5 mr-1" /> QR code
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => abrir(v)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    {zap && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={zap} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? "Editar vendedor" : "Novo vendedor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                autoFocus
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  if (!codigoEditado) setCodigo(slugify(e.target.value));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Código no link do QR</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">/c/{funil.slug}/</span>
                <Input
                  value={codigo}
                  onChange={(e) => {
                    setCodigoEditado(true);
                    setCodigo(slugify(e.target.value));
                  }}
                />
              </div>
              {editando && editando.codigo !== slugify(codigo) && (
                <p className="text-xs text-destructive">QR codes já impressos com o código antigo deixam de identificar este vendedor.</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <MaskedInput
                  format="(##) #####-####"
                  placeholder="(31) 99999-9999"
                  value={whatsapp}
                  onValueChange={(x) => setWhatsapp(x.value)}
                  inputMode="tel"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {qr && (
        <QrCodeDialog
          open={!!qr}
          onOpenChange={(o) => !o && setQr(null)}
          titulo={qr.titulo}
          subtitulo={qr.subtitulo}
          link={qr.link}
        />
      )}
    </div>
  );
}
