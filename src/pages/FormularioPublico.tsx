import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import FormularioGoogleForms from "@/components/formularios/FormularioGoogleForms";
import FormularioTypeform from "@/components/formularios/FormularioTypeform";
import FormularioSinistro from "@/components/formularios/sinistro/FormularioSinistro";

export default function FormularioPublico() {
  const { slug } = useParams<{ slug: string }>();

  const { data: form, isLoading, error } = useQuery({
    queryKey: ["formulario_publico", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formularios")
        .select("*, formulario_perguntas(*)")
        .eq("slug", slug!)
        .eq("status", "publicado")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (form?.titulo) document.title = form.titulo;
  }, [form]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        Carregando...
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-2">
            <h1 className="text-xl font-bold">Formulário indisponível</h1>
            <p className="text-sm text-muted-foreground">
              Este formulário não existe ou ainda não está publicado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const estilo = ((form as any).estilo as string) || "typeform";

  if (estilo === "sinistro") return <FormularioColapse form={form} />;
  if (estilo === "google_forms") return <FormularioGoogleForms form={form} />;
  return <FormularioTypeform form={form} />;
}