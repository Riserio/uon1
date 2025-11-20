import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PDFData {
  vistoria: any;
  fotos: any[];
  corretora?: any;
  administradora?: any;
}

export const generateVistoriaPDF = async (data: PDFData) => {
  const { vistoria, fotos, corretora, administradora } = data;
  const doc = new jsPDF();
  
  let yPosition = 20;

  // Load and add logos
  if (corretora?.logo_url) {
    try {
      const logoImg = await loadImage(corretora.logo_url);
      doc.addImage(logoImg, 'PNG', 15, yPosition, 40, 20);
    } catch (error) {
      console.error('Erro ao carregar logo da corretora:', error);
    }
  }

  if (administradora?.logo_url) {
    try {
      const adminLogoImg = await loadImage(administradora.logo_url);
      doc.addImage(adminLogoImg, 'PNG', 155, yPosition, 40, 20);
    } catch (error) {
      console.error('Erro ao carregar logo da administradora:', error);
    }
  }

  yPosition = 50;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE VISTORIA', 105, yPosition, { align: 'center' });
  
  yPosition += 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Vistoria #${vistoria.numero}`, 105, yPosition, { align: 'center' });
  
  yPosition += 15;

  // Vistoria Info
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Informações da Vistoria', 15, yPosition);
  yPosition += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const vistoriaInfo = [
    ['Tipo', vistoria.tipo_vistoria === 'sinistro' ? 'Sinistro' : 'Reativação'],
    ['Status', vistoria.status],
    ['Data', new Date(vistoria.created_at).toLocaleDateString('pt-BR')],
    ['Tipo de Abertura', vistoria.tipo_abertura === 'manual' ? 'Manual' : 'Digital'],
  ];

  if (vistoria.cliente_nome) vistoriaInfo.push(['Cliente', vistoria.cliente_nome]);
  if (vistoria.cliente_cpf) vistoriaInfo.push(['CPF', vistoria.cliente_cpf]);
  if (vistoria.cliente_telefone) vistoriaInfo.push(['Telefone', vistoria.cliente_telefone]);
  if (vistoria.cliente_email) vistoriaInfo.push(['Email', vistoria.cliente_email]);
  if (corretora?.nome) vistoriaInfo.push(['Corretora', corretora.nome]);

  autoTable(doc, {
    startY: yPosition,
    head: [['Campo', 'Valor']],
    body: vistoriaInfo,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246] },
  });

  yPosition = (doc as any).lastAutoTable.finalY + 15;

  // Vehicle Info
  if (vistoria.veiculo_placa || vistoria.veiculo_modelo) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Veículo', 15, yPosition);
    yPosition += 8;

    const veiculoInfo = [];
    if (vistoria.veiculo_placa) veiculoInfo.push(['Placa', vistoria.veiculo_placa]);
    if (vistoria.veiculo_marca) veiculoInfo.push(['Marca', vistoria.veiculo_marca]);
    if (vistoria.veiculo_modelo) veiculoInfo.push(['Modelo', vistoria.veiculo_modelo]);
    if (vistoria.veiculo_ano) veiculoInfo.push(['Ano', vistoria.veiculo_ano]);
    if (vistoria.veiculo_cor) veiculoInfo.push(['Cor', vistoria.veiculo_cor]);
    if (vistoria.veiculo_chassi) veiculoInfo.push(['Chassi', vistoria.veiculo_chassi]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Campo', 'Valor']],
      body: veiculoInfo,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  }

  // Analysis
  if (vistoria.analise_ia) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Análise por IA', 15, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const analise = typeof vistoria.analise_ia === 'string' 
      ? JSON.parse(vistoria.analise_ia) 
      : vistoria.analise_ia;

    if (analise.danos_detectados?.length > 0) {
      doc.text('Danos Detectados:', 15, yPosition);
      yPosition += 6;
      analise.danos_detectados.forEach((dano: string) => {
        doc.text(`• ${dano}`, 20, yPosition);
        yPosition += 5;
      });
      yPosition += 5;
    }

    if (analise.observacoes) {
      doc.text('Observações:', 15, yPosition);
      yPosition += 6;
      const lines = doc.splitTextToSize(analise.observacoes, 170);
      doc.text(lines, 20, yPosition);
      yPosition += lines.length * 5 + 10;
    }
  }

  // Photos section
  if (fotos.length > 0) {
    doc.addPage();
    yPosition = 20;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Fotos da Vistoria', 15, yPosition);
    yPosition += 10;

    for (let i = 0; i < fotos.length; i++) {
      const foto = fotos[i];
      
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      try {
        const imgData = await loadImage(foto.arquivo_url);
        doc.addImage(imgData, 'JPEG', 15, yPosition, 180, 100);
        
        yPosition += 105;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(getPosicaoNome(foto.posicao), 15, yPosition);
        yPosition += 5;

        if (foto.analise_ia) {
          doc.setFont('helvetica', 'normal');
          const analise = typeof foto.analise_ia === 'string' 
            ? JSON.parse(foto.analise_ia) 
            : foto.analise_ia;
          
          if (analise.descricao) {
            const lines = doc.splitTextToSize(analise.descricao, 170);
            doc.text(lines, 15, yPosition);
            yPosition += lines.length * 5;
          }
        }
        
        yPosition += 10;
      } catch (error) {
        console.error(`Erro ao carregar foto ${foto.posicao}:`, error);
      }
    }
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    
    if (administradora) {
      doc.text(administradora.nome || '', 15, 285);
      if (administradora.telefone) doc.text(`Tel: ${administradora.telefone}`, 15, 290);
      if (administradora.email) doc.text(administradora.email, 100, 290);
    }
    
    doc.text(`Página ${i} de ${pageCount}`, 180, 290);
  }

  return doc;
};

const loadImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
};

const getPosicaoNome = (posicao: string) => {
  const nomes: Record<string, string> = {
    frontal: 'Frontal',
    traseira: 'Traseira',
    lateral_esquerda: 'Lateral Esquerda',
    lateral_direita: 'Lateral Direita'
  };
  return nomes[posicao] || posicao;
};
