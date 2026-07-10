// Gera, no navegador (via canvas), as variantes de tamanho que um PWA
// icon precisa a partir de UMA imagem enviada pelo admin em Configurações
// > Imagens > Ícone do App: 192x192 e 512x512 (ícone "any", pode ter
// fundo transparente), 512x512 "maskable" (com margem de segurança e
// fundo sólido, exigido pelo Android pra não cortar o desenho ao aplicar
// máscaras de formato) e 180x180 pro apple-touch-icon do iOS (fundo
// sólido, já que o iOS não lida bem com transparência em ícone de tela
// inicial — preenche áreas transparentes com preto).
export interface GeneratedPwaIcons {
  icon192: Blob;
  icon512: Blob;
  icon512Maskable: Blob;
  appleTouchIcon: Blob;
}

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

function renderToCanvas(
  img: HTMLImageElement,
  size: number,
  opts: { paddingRatio?: number; background?: string | null }
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, size, size);
  }

  const pad = opts.paddingRatio ?? 0;
  const innerSize = size * (1 - pad * 2);
  const scale = Math.min(innerSize / img.width, innerSize / img.height);
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
      canvasToBlob(renderToCanvas(img, 192, { paddingRatio: 0, background: null })),
      canvasToBlob(renderToCanvas(img, 512, { paddingRatio: 0, background: null })),
      canvasToBlob(renderToCanvas(img, 512, { paddingRatio: 0.15, background: "#ffffff" })),
      canvasToBlob(renderToCanvas(img, 180, { paddingRatio: 0.08, background: "#ffffff" })),
    ]);
    return { icon192, icon512, icon512Maskable, appleTouchIcon };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
