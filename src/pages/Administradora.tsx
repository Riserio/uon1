import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, Upload, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button as UIButton } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import InputMask from 'react-input-mask';

export default function Administradora() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    nome: '',
    cnpj: '',
    telefone: '',
    email: '',
    endereco: '',
    logo_url: ''
  });

  useEffect(() => {
    fetchAdministradora();
  }, []);

  const fetchAdministradora = async () => {
    try {
      const { data, error } = await supabase
        .from('administradora')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setFormData(data);
      }
    } catch (error) {
      console.error('Erro ao carregar administradora:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `administradora-logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName);

      setFormData({ ...formData, logo_url: publicUrl });
      toast.success('Logo enviada com sucesso!');
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      toast.error('Erro ao fazer upload da logo');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.nome) {
      toast.error('Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      if (formData.id) {
        const { error } = await supabase
          .from('administradora')
          .update({
            nome: formData.nome,
            cnpj: formData.cnpj,
            telefone: formData.telefone,
            email: formData.email,
            endereco: formData.endereco,
            logo_url: formData.logo_url
          })
          .eq('id', formData.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('administradora')
          .insert({
            nome: formData.nome,
            cnpj: formData.cnpj,
            telefone: formData.telefone,
            email: formData.email,
            endereco: formData.endereco,
            logo_url: formData.logo_url
          })
          .select()
          .single();

        if (error) throw error;
        setFormData({ ...formData, id: data.id });
      }

      toast.success('Administradora salva com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar administradora');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <PageHeader
        icon={Building2}
        title="Administradora"
        subtitle="Dados cadastrais da administradora"
        actions={
          <Button variant="outline" onClick={() => navigate('/corretoras')} className="rounded-xl gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        }
      />

      <Card>
        <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Dados da Administradora
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Administradora *</Label>
              <Input
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Nome da administradora"
              />
            </div>

            <div className="space-y-2">
              <Label>CNPJ</Label>
              <InputMask
                mask="99.999.999/9999-99"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
              >
                {(inputProps: any) => <Input {...inputProps} placeholder="00.000.000/0000-00" />}
              </InputMask>
            </div>

            <div className="space-y-2">
              <Label>Telefone</Label>
              <InputMask
                mask="(99) 99999-9999"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              >
                {(inputProps: any) => <Input {...inputProps} placeholder="(00) 00000-0000" />}
              </InputMask>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@administradora.com"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Endereço</Label>
              <Input
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Endereço completo"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Logo da Administradora</Label>
              <div className="flex items-center gap-4">
                {formData.logo_url && (
                  <img 
                    src={formData.logo_url} 
                    alt="Logo" 
                    className="h-16 w-auto object-contain border rounded p-2"
                  />
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => document.getElementById('logo-upload')?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Enviando...' : formData.logo_url ? 'Alterar Logo' : 'Fazer Upload'}
                </Button>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                A logo será exibida no rodapé dos relatórios e documentos
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Administradora'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
