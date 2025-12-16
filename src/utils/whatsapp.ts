/**
 * Utilitário centralizado para abertura do WhatsApp
 * Usa api.whatsapp.com que detecta automaticamente se o app está instalado
 * e oferece a opção de abrir no app ou no WhatsApp Web
 */

interface WhatsAppOptions {
  phone?: string;
  message: string;
}

/**
 * Formata o número de telefone para o padrão internacional
 */
const formatPhoneNumber = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, "");
  // Se já começa com 55, mantém, senão adiciona
  return cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
};

/**
 * Abre o WhatsApp usando a API oficial que:
 * - Detecta se o app está instalado
 * - Oferece opções de abrir no app ou WhatsApp Web
 * - Funciona em desktop e mobile
 */
export const openWhatsApp = ({ phone, message }: WhatsAppOptions): void => {
  const encodedMessage = encodeURIComponent(message);
  
  let url = "https://api.whatsapp.com/send?";
  
  if (phone) {
    const formattedPhone = formatPhoneNumber(phone);
    url += `phone=${formattedPhone}&`;
  }
  
  url += `text=${encodedMessage}`;
  
  window.open(url, "_blank");
};

/**
 * Cria uma URL do WhatsApp (útil para links)
 */
export const getWhatsAppUrl = ({ phone, message }: WhatsAppOptions): string => {
  const encodedMessage = encodeURIComponent(message);
  
  let url = "https://api.whatsapp.com/send?";
  
  if (phone) {
    const formattedPhone = formatPhoneNumber(phone);
    url += `phone=${formattedPhone}&`;
  }
  
  url += `text=${encodedMessage}`;
  
  return url;
};
