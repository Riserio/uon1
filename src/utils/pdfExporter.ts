import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AndamentoData {
  created_at: string;
  descricao: string;
  user_nome?: string;
}

interface HistoricoData {
  created_at: string;
  acao: string;
  user_nome: string;
  campos_alterados?: any;
  valores_anteriores?: any;
  valores_novos?: any;
}

export const exportAndamentosToPDF = (
  atendimentoNumero: number,
  atendimentoAssunto: string,
  andamentos: AndamentoData[]
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Tabela de andamentos
  const tableData = andamentos.map(a => [
    new Date(a.created_at).toLocaleString('pt-BR'),
    a.user_nome || 'Sistema',
    a.descricao || '',
  ]);

  autoTable(doc, {
    startY: 30,
    head: [['Data/Hora', 'Usuário', 'Descrição']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 35 },
      2: { cellWidth: 'auto' },
    },
    margin: { top: 30, left: 14, right: 14, bottom: 15 },
    showHead: 'everyPage',
    rowPageBreak: 'auto',
    didDrawPage: () => {
      // Cabeçalho em todas as páginas
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Andamentos - Atendimento #${atendimentoNumero}`, 14, 15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const assuntoLines = doc.splitTextToSize(atendimentoAssunto || '', pageWidth - 28);
      doc.text(assuntoLines.slice(0, 1), 14, 22);
    },
  });

  // Rodapé com paginação
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR')} | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  doc.save(`andamentos-${atendimentoNumero}.pdf`);
};

export const exportHistoricoToPDF = (
  atendimentoNumero: number,
  atendimentoAssunto: string,
  historico: HistoricoData[]
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const tableData = historico.map(h => {
    let mudancas = '';
    if (h.campos_alterados && Array.isArray(h.campos_alterados)) {
      mudancas = h.campos_alterados.join(', ');
    }
    return [
      new Date(h.created_at).toLocaleString('pt-BR'),
      h.user_nome,
      h.acao,
      mudancas,
    ];
  });

  autoTable(doc, {
    startY: 30,
    head: [['Data/Hora', 'Usuário', 'Ação', 'Campos Alterados']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 35 },
      2: { cellWidth: 30 },
      3: { cellWidth: 'auto' },
    },
    margin: { top: 30, left: 14, right: 14, bottom: 15 },
    showHead: 'everyPage',
    rowPageBreak: 'auto',
    didDrawPage: () => {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(`Histórico - Atendimento #${atendimentoNumero}`, 14, 15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const assuntoLines = doc.splitTextToSize(atendimentoAssunto || '', pageWidth - 28);
      doc.text(assuntoLines.slice(0, 1), 14, 22);
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Gerado em ${new Date().toLocaleString('pt-BR')} | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  doc.save(`historico-${atendimentoNumero}.pdf`);
};
