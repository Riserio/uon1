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
  
  // Título
  doc.setFontSize(16);
  doc.text(`Andamentos - Atendimento #${atendimentoNumero}`, 14, 15);
  
  doc.setFontSize(10);
  doc.text(atendimentoAssunto, 14, 22);
  
  // Tabela de andamentos
  const tableData = andamentos.map(a => [
    new Date(a.created_at).toLocaleString('pt-BR'),
    a.user_nome || 'Sistema',
    a.descricao
  ]);
  
  autoTable(doc, {
    startY: 30,
    head: [['Data/Hora', 'Usuário', 'Descrição']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });
  
  doc.save(`andamentos-${atendimentoNumero}.pdf`);
};

export const exportHistoricoToPDF = (
  atendimentoNumero: number,
  atendimentoAssunto: string,
  historico: HistoricoData[]
) => {
  const doc = new jsPDF();
  
  // Título
  doc.setFontSize(16);
  doc.text(`Histórico - Atendimento #${atendimentoNumero}`, 14, 15);
  
  doc.setFontSize(10);
  doc.text(atendimentoAssunto, 14, 22);
  
  // Tabela de histórico
  const tableData = historico.map(h => {
    let mudancas = '';
    if (h.campos_alterados && Array.isArray(h.campos_alterados)) {
      mudancas = h.campos_alterados.join(', ');
    }
    
    return [
      new Date(h.created_at).toLocaleString('pt-BR'),
      h.user_nome,
      h.acao,
      mudancas
    ];
  });
  
  autoTable(doc, {
    startY: 30,
    head: [['Data/Hora', 'Usuário', 'Ação', 'Campos Alterados']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
    columnStyles: {
      3: { cellWidth: 'auto' }
    }
  });
  
  doc.save(`historico-${atendimentoNumero}.pdf`);
};
