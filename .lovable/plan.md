

## Plan: Improve Link Section in Ouvidoria Config Dialog

The current link section shows two raw URLs ("Link Publico do Formulario" and "Link Embed (Portal)") with no explanation of what they do. The user needs clarity.

### Changes to `src/components/ouvidoria/OuvidoriaConfigDialog.tsx`

Replace the two plain URL sections (lines 167-186) with styled card-based blocks that include:

1. **Link Publico** card:
   - Icon: `ExternalLink`
   - Title: "Formulario Publico"
   - Description: "Link direto para o associado abrir ou responder uma manifestacao. Compartilhe por e-mail, WhatsApp ou site."
   - URL field (read-only) + Copy button + Open in new tab button

2. **Link Embed** card:
   - Icon: `Code`
   - Title: "Embed para Portal"
   - Description: "Use este link para incorporar o formulario via iframe no portal do parceiro. Requer token de autenticacao."
   - URL field (read-only) + Copy button
   - Show iframe snippet copyable (e.g. `<iframe src="..."></iframe>`)

3. **Visual style**: Each link in a bordered card (`p-4 rounded-xl border bg-muted/20`) with icon + title + description on top, URL + actions below. Consistent with the widget pattern used elsewhere.

4. **Slug indicator**: Show a small badge next to the URL indicating if it's using slug or UUID (e.g., Badge "slug: vide" in green, or "usando ID" in yellow with hint to configure slug).

Single file edit, no database changes needed.

