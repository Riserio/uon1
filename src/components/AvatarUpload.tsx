import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera } from "lucide-react";
import { toast } from "sonner";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl?: string | null;
  userName: string;
  onUploadComplete?: (url: string) => void;
}

export function AvatarUpload({ userId, currentAvatarUrl, userName, onUploadComplete }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Tamanho máximo: 5MB");
        return;
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error("Apenas imagens são permitidas");
        return;
      }

      console.log('Uploading avatar via Edge Function...');

      // Get current session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar autenticado");
        return;
      }

      // Upload via Edge Function (bypasses RLS)
      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('upload-avatar', {
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      if (!data || !data.publicUrl) {
        throw new Error('Failed to get public URL from upload');
      }

      console.log('Upload successful:', data);

      setAvatarUrl(data.publicUrl);
      toast.success("Foto atualizada com sucesso!");

      if (onUploadComplete) {
        onUploadComplete(data.publicUrl);
      }
    } catch (error: any) {
      console.error('Avatar upload error:', error);
      toast.error("Erro ao fazer upload da foto: " + (error.message || 'Erro desconhecido'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Avatar className="h-24 w-24">
          <AvatarImage src={avatarUrl || "/images/logo-collapsed.png"} alt={userName} />
          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{initials}</AvatarFallback>
        </Avatar>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute bottom-0 right-0 rounded-full h-8 w-8"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={uploadAvatar}
        className="hidden"
        disabled={uploading}
      />
      {uploading && <p className="text-sm text-muted-foreground">Enviando...</p>}
    </div>
  );
}
