import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PERGUNTAS_COMITE, ORDEM_CATEGORIAS, CATEGORIAS_PERGUNTAS } from '@/constants/perguntasComite';

interface SinistroData {
  numero: number;
  cliente_nome?: string;
  cliente_cpf?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  veiculo_placa?: string;
  veiculo_marca?: string;
  veiculo_modelo?: string;
  veiculo_ano?: string;
  veiculo_cor?: string;
  veiculo_valor_fipe?: number;
  tipo_sinistro?: string;
  data_incidente?: string;
  relato_incidente?: string;
  status?: string;
  created_at?: string;
}

interface ComiteData {
  parecer_analista?: string;
  decisao?: string;
  valor_aprovado?: number;
  justificativa?: string;
  data_deliberacao?: string;
}

interface FotoData {
  url: string;
  tipo: string;
}

export const exportDeliberacaoPDF = async (
  sinistro: SinistroData,
  respostas: Record<string, string>,
  comite: ComiteData,
  fotos: FotoData[] = []
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPos = 15;

  // Título
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Deliberação do Comitê', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Sinistro #${sinistro.numero}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Informações do Sinistro
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Dados do Sinistro', 14, yPos);
  yPos += 8;

  const dadosSinistro = [
    ['Cliente', sinistro.cliente_nome || 'N/A'],
    ['CPF', sinistro.cliente_cpf || 'N/A'],
    ['Telefone', sinistro.cliente_telefone || 'N/A'],
    ['Email', sinistro.cliente_email || 'N/A'],
    ['Tipo do Sinistro', sinistro.tipo_sinistro || 'N/A'],
    ['Data do Incidente', sinistro.data_incidente ? new Date(sinistro.data_incidente).toLocaleDateString('pt-BR') : 'N/A'],
    ['Status', sinistro.status || 'N/A'],
    ['Data de Abertura', sinistro.created_at ? new Date(sinistro.created_at).toLocaleDateString('pt-BR') : 'N/A'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: dadosSinistro,
    styles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 'auto' }
    },
    theme: 'plain',
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Dados do Veículo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Dados do Veículo', 14, yPos);
  yPos += 8;

  const dadosVeiculo = [
    ['Placa', sinistro.veiculo_placa || 'N/A'],
    ['Marca', sinistro.veiculo_marca || 'N/A'],
    ['Modelo', sinistro.veiculo_modelo || 'N/A'],
    ['Ano', sinistro.veiculo_ano || 'N/A'],
    ['Cor', sinistro.veiculo_cor || 'N/A'],
    ['Valor FIPE', sinistro.veiculo_valor_fipe 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sinistro.veiculo_valor_fipe) 
      : 'N/A'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: dadosVeiculo,
    styles: { fontSize: 9 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { cellWidth: 'auto' }
    },
    theme: 'plain',
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Relato do Incidente
  if (sinistro.relato_incidente) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Relato do Incidente', 14, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const relatoLines = doc.splitTextToSize(sinistro.relato_incidente, pageWidth - 28);
    doc.text(relatoLines, 14, yPos);
    yPos += relatoLines.length * 5 + 10;
  }

  // Nova página para as perguntas
  doc.addPage();
  yPos = 15;

  // Respostas da Entrevista
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('4. Respostas da Entrevista do Comitê', 14, yPos);
  yPos += 10;

  const respostasTable: string[][] = [];
  
  ORDEM_CATEGORIAS.forEach(categoria => {
    const perguntas = CATEGORIAS_PERGUNTAS[categoria];
    if (!perguntas) return;

    perguntas.forEach(pergunta => {
      const resposta = respostas[pergunta.id] || 'Não respondido';
      respostasTable.push([
        pergunta.pergunta.substring(0, 60) + (pergunta.pergunta.length > 60 ? '...' : ''),
        resposta
      ]);
    });
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Pergunta', 'Resposta']],
    body: respostasTable,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 'auto' }
    },
    didDrawPage: (data) => {
      // Rodapé em cada página
      doc.setFontSize(8);
      doc.text(
        `Página ${data.pageNumber}`,
        pageWidth - 20,
        doc.internal.pageSize.height - 10
      );
    }
  });

  // Nova página para parecer do comitê
  doc.addPage();
  yPos = 15;

  // Parecer do Comitê
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('5. Parecer do Comitê', 14, yPos);
  yPos += 10;

  const getStatusColor = (status: string): [number, number, number] => {
    switch (status?.toLowerCase()) {
      case 'aprovado':
      case 'aprovada':
        return [34, 197, 94]; // green
      case 'negado':
      case 'negada':
      case 'reprovada':
        return [239, 68, 68]; // red
      case 'em_analise':
      case 'em análise':
        return [249, 115, 22]; // orange
      default:
        return [156, 163, 175]; // gray
    }
  };

  const statusColor = getStatusColor(comite.decisao || '');
  
  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(14, yPos, pageWidth - 28, 25, 3, 3, 'F');
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`Decisão: ${comite.decisao || 'Pendente'}`, pageWidth / 2, yPos + 10, { align: 'center' });
  
  if (comite.valor_aprovado) {
    doc.setFontSize(12);
    doc.text(
      `Valor Aprovado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comite.valor_aprovado)}`,
      pageWidth / 2,
      yPos + 18,
      { align: 'center' }
    );
  }
  
  doc.setTextColor(0, 0, 0);
  yPos += 35;

  if (comite.justificativa) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Justificativa:', 14, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const justificativaLines = doc.splitTextToSize(comite.justificativa, pageWidth - 28);
    doc.text(justificativaLines, 14, yPos);
    yPos += justificativaLines.length * 5 + 10;
  }

  if (comite.data_deliberacao) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `Data da Deliberação: ${new Date(comite.data_deliberacao).toLocaleString('pt-BR')}`,
      14,
      yPos
    );
  }

  // Fotos (se houver)
  if (fotos.length > 0) {
    doc.addPage();
    yPos = 15;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('6. Fotos do Sinistro', 14, yPos);
    yPos += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const fotosPorLinha = 3;
    const larguraFoto = 55;
    const alturaFoto = 40;
    const espacamento = 5;
    
    fotos.forEach((foto, index) => {
      const coluna = index % fotosPorLinha;
      const linha = Math.floor(index / fotosPorLinha);
      
      const x = 14 + coluna * (larguraFoto + espacamento);
      const y = yPos + linha * (alturaFoto + 15);
      
      // Placeholder para foto (em produção, usar addImage com a URL)
      doc.setDrawColor(200, 200, 200);
      doc.rect(x, y, larguraFoto, alturaFoto);
      doc.setFontSize(7);
      doc.text(foto.tipo || `Foto ${index + 1}`, x + 2, y + alturaFoto + 5);
      doc.text('[Imagem]', x + larguraFoto / 2, y + alturaFoto / 2, { align: 'center' });
    });
  }

  // Rodapé final
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR')} | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }

  doc.save(`deliberacao-sinistro-${sinistro.numero}.pdf`);
};
