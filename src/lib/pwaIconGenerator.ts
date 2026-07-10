// Gera, no navegador (via canvas), as variantes de tamanho que um PWA
// icon precisa a partir de UMA imagem enviada pelo admin em Configurações
// > Imagens > Ícone do App: 192x192, 512x512, 512x512 "maskable" (usado
// pelo Android ao aplicar máscaras de formato) e 180x180 pro
// apple-touch-icon do iOS.
//
// Todas as variantes usam modo "cover" (preenche o quadrado inteiro,
// cortando o excesso) em vez de "contain" (encaixar com barras/fundo) —
// a pedido do usuário, a imagem enviada deve preencher 100% do ícone, sem
// sobra de fundo sólido nas bordas. Por isso o recomendado é enviar uma
// imagem já quadrada (ver RECOMMENDED_ICON_SIZE_LABEL) — caso contrário o
// recorte automático corta as bordas mais longas para manter o quadrado.
export interface GeneratedPwaIcons {
  icon192: Blob;
  icon512: Blob;
  icon512Maskable: Blob;
  appleTouchIcon: Blob;
}

// Tamanho de referência mostrado na UI de upload para o admin já enviar a
// imagem no formato ideal (quadrada, resolução alta o bastante para o
// maior ícone gerado) e evitar corte por causa de proporção não-quadrada.
export const RECOMMENDED_ICON_SIZE_LABEL = "512×512px (quadrada, PNG com fundo)";
export const RECOMMENDED_ICON_MIN_PX = 512;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve(img);
      // Mantemos a URL viva até o load terminar; será revogada pelo chamador.
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Desenha a imagem preenchendo o quadrado inteiro (comportamento "cover",
// igual a background-size: cover no CSS): escala pelo MAIOR fator (em vez
// do menor) e centraliza, cortando o excesso que sobra fora do quadrado.
// Isso garante que não sobra nenhuma faixa de fundo visível, mesmo que a
// imagem original não seja quadrada.
function renderToCanvas(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (size - w) / 2;
  const y = (size - h) / 2;
  ctx.drawImage(img, x, y, w, h);

  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Falha ao gerar imagem"));
    }, "image/png");
  });
}

export async function generatePwaIconsFromFile(file: File): Promise<GeneratedPwaIcons> {
  const img = await loadImage(file);
  try {
    const [icon192, icon512, icon512Maskable, appleTouchIcon] = await Promise.all([
      canvasToBlob(renderToCanvas(img, 192)),
      canvasToBlob(renderToCanvas(img, 512)),
      canvasToBlob(renderToCanvas(img, 512)),
      canvasToBlob(renderToCanvas(img, 180)),
    ]);
    return { icon192, icon512, icon512Maskable, appleTouchIcon };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
