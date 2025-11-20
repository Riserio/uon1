import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface VistoriaData {
  id: string;
  numero: number;
  tipo_vistoria: string;
  status: string;
  created_at: string;
  completed_at?: string;
  cliente_nome?: string;
  cliente_cpf?: string;
  cliente_email?: string;
  cliente_telefone?: string;
  veiculo_placa?: string;
  veiculo_marca?: string;
  veiculo_modelo?: string;
  veiculo_ano?: string;
  veiculo_cor?: string;
  veiculo_chassi?: string;
  endereco?: string;
  data_incidente?: string;
  relato_incidente?: string;
  danos_detectados?: string[];
  observacoes_ia?: string;
  analise_ia?: any;
  cnh_dados?: any;
}

interface Foto {
  id: string;
  posicao: string;
  arquivo_url: string;
  analise_ia?: any;
}

interface CorretoraData {
  nome: string;
  logo_url?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
}

interface AdministradoraData {
  nome: string;
  logo_url?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
}

export async function generateVistoriaPDF(
  vistoria: VistoriaData,
  fotos: Foto[],
  corretora?: CorretoraData,
  administradora?: AdministradoraData
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPosition = 20;

  // Helper para adicionar nova página se necessário
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - 30) {
      doc.addPage();
      yPosition = 20;
      addFooter();
    }
  };

  // Função para adicionar rodapé
  const addFooter = () => {
    const footerY = pageHeight - 20;
    
    // Logo da administradora (pequena)
    if (administradora?.logo_url) {
      try {
        doc.addImage(administradora.logo_url, 'PNG', 10, footerY - 8, 15, 8);
      } catch (e) {
        console.log('Erro ao adicionar logo administradora no rodapé:', e);
      }
    }

    // Informações da administradora
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    const adminText = administradora 
      ? `${administradora.nome} | CNPJ: ${administradora.cnpj || 'N/A'} | Tel: ${administradora.telefone || 'N/A'}`
      : 'Sistema de Vistorias';
    doc.text(adminText, pageWidth / 2, footerY, { align: 'center' });
  };

  // CABEÇALHO
  doc.setFillColor(248, 250, 252);
  doc.rect(0, 0, pageWidth, 50, 'F');

  // Logo da corretora
  if (corretora?.logo_url) {
    try {
      doc.addImage(corretora.logo_url, 'PNG', 15, 10, 40, 20);
    } catch (e) {
      console.log('Erro ao adicionar logo:', e);
    }
  }

  // Título
  doc.setFontSize(22);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE VISTORIA', pageWidth / 2, 25, { align: 'center' });

  // Número da vistoria
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(`Nº ${vistoria.numero}`, pageWidth / 2, 35, { align: 'center' });

  yPosition = 60;

  // INFORMAÇÕES DA CORRETORA
  if (corretora) {
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('Corretora', 15, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    doc.text(`${corretora.nome}`, 15, yPosition);
    yPosition += 5;
    if (corretora.cnpj) {
      doc.text(`CNPJ: ${corretora.cnpj}`, 15, yPosition);
      yPosition += 5;
    }
    if (corretora.telefone) {
      doc.text(`Telefone: ${corretora.telefone}`, 15, yPosition);
      yPosition += 5;
    }
    yPosition += 5;
  }

  // DADOS DO CLIENTE
  checkPageBreak(40);
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados do Cliente', 15, yPosition);
  yPosition += 8;

  const clienteData = [
    ['Nome', vistoria.cliente_nome || 'N/A'],
    ['CPF', vistoria.cliente_cpf || 'N/A'],
    ['E-mail', vistoria.cliente_email || 'N/A'],
    ['Telefone', vistoria.cliente_telefone || 'N/A'],
  ];

  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: clienteData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 40 },
      1: { cellWidth: 'auto' }
    },
    margin: { left: 15, right: 15 }
  });

  yPosition = (doc as any).lastAutoTable.finalY + 10;

  // DADOS DO VEÍCULO
  checkPageBreak(50);
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados do Veículo', 15, yPosition);
  yPosition += 8;

  const veiculoData = [
    ['Placa', vistoria.veiculo_placa || 'N/A'],
    ['Marca/Modelo', `${vistoria.veiculo_marca || ''} ${vistoria.veiculo_modelo || ''}`.trim() || 'N/A'],
    ['Ano', vistoria.veiculo_ano || 'N/A'],
    ['Cor', vistoria.veiculo_cor || 'N/A'],
    ['Chassi', vistoria.veiculo_chassi || 'N/A'],
  ];

  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: veiculoData,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 40 },
      1: { cellWidth: 'auto' }
    },
    margin: { left: 15, right: 15 }
  });

  yPosition = (doc as any).lastAutoTable.finalY + 10;

  // DADOS DA VISTORIA
  checkPageBreak(50);
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.text('Informações da Vistoria', 15, yPosition);
  yPosition += 8;

  const vistoriaInfo = [
    ['Tipo', vistoria.tipo_vistoria],
    ['Status', vistoria.status],
    ['Data da Vistoria', format(new Date(vistoria.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })],
    ['Data de Conclusão', vistoria.completed_at ? format(new Date(vistoria.completed_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'N/A'],
    ['Local', vistoria.endereco || 'N/A'],
  ];

  if (vistoria.data_incidente) {
    vistoriaInfo.push(['Data do Incidente', format(new Date(vistoria.data_incidente), 'dd/MM/yyyy', { locale: ptBR })]);
  }

  autoTable(doc, {
    startY: yPosition,
    head: [],
    body: vistoriaInfo,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 50 },
      1: { cellWidth: 'auto' }
    },
    margin: { left: 15, right: 15 }
  });

  yPosition = (doc as any).lastAutoTable.finalY + 10;

  // RELATO DO INCIDENTE
  if (vistoria.relato_incidente) {
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('Relato do Incidente', 15, yPosition);
    yPosition += 8;

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    const relatoLines = doc.splitTextToSize(vistoria.relato_incidente, pageWidth - 30);
    doc.text(relatoLines, 15, yPosition);
    yPosition += relatoLines.length * 5 + 10;
  }

  // DANOS DETECTADOS
  if (vistoria.danos_detectados && vistoria.danos_detectados.length > 0) {
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('Danos Detectados pela IA', 15, yPosition);
    yPosition += 8;

    doc.setFontSize(10);
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'normal');
    vistoria.danos_detectados.forEach((dano: string) => {
      checkPageBreak(8);
      doc.text(`• ${dano}`, 20, yPosition);
      yPosition += 6;
    });
    yPosition += 5;
  }

  // ANÁLISE DA IA
  if (vistoria.observacoes_ia) {
    checkPageBreak(40);
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('Análise Geral da IA', 15, yPosition);
    yPosition += 8;

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    const analiseLines = doc.splitTextToSize(vistoria.observacoes_ia, pageWidth - 30);
    analiseLines.forEach((line: string) => {
      checkPageBreak(6);
      doc.text(line, 15, yPosition);
      yPosition += 5;
    });
    yPosition += 10;
  }

  // FOTOS E ANÁLISES INDIVIDUAIS
  if (fotos && fotos.length > 0) {
    doc.addPage();
    yPosition = 20;
    
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.text('Fotos e Análises Detalhadas', 15, yPosition);
    yPosition += 10;

    for (const foto of fotos) {
      checkPageBreak(90);

      // Título da posição
      doc.setFontSize(12);
      doc.setTextColor(30, 58, 138);
      doc.setFont('helvetica', 'bold');
      doc.text(foto.posicao.replace('_', ' ').toUpperCase(), 15, yPosition);
      yPosition += 8;

      // Adicionar foto
      try {
        const imgWidth = 80;
        const imgHeight = 60;
        doc.addImage(foto.arquivo_url, 'JPEG', 15, yPosition, imgWidth, imgHeight);
        
        // Análise ao lado da foto
        if (foto.analise_ia?.analise) {
          doc.setFontSize(8);
          doc.setTextColor(51, 65, 85);
          doc.setFont('helvetica', 'normal');
          const analiseText = doc.splitTextToSize(foto.analise_ia.analise, pageWidth - imgWidth - 35);
          doc.text(analiseText, imgWidth + 25, yPosition + 5);
        }

        yPosition += imgHeight + 10;
      } catch (e) {
        console.log('Erro ao adicionar foto:', e);
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Erro ao carregar imagem', 15, yPosition);
        yPosition += 10;
      }
    }
  }

  // Adicionar rodapé em todas as páginas
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter();
  }

  // Gerar e baixar PDF
  const fileName = `Vistoria_${vistoria.numero}_${format(new Date(), 'ddMMyyyy')}.pdf`;
  doc.save(fileName);
}
