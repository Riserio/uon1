/**
 * Utilitário centralizado para abertura do WhatsApp
 * Tenta abrir o app nativo primeiro, fallback para WhatsApp Web
 */

interface WhatsAppOptions {
  phone?: string;
  message: string;
}

/**
 * Detecta se o usuário está em um dispositivo móvel
 */
const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

/**
 * Formata o número de telefone para o padrão internacional
 */
const formatPhoneNumber = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, "");
  // Se já começa com 55, mantém, senão adiciona
  return cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
};

/**
 * Abre o WhatsApp com a mensagem especificada
 * - Em dispositivos móveis: tenta abrir o app nativo
 * - Em desktop: abre WhatsApp Web
 */
export const openWhatsApp = ({ phone, message }: WhatsAppOptions): void => {
  const encodedMessage = encodeURIComponent(message);
  
  if (isMobileDevice()) {
    // Em mobile, usa o deep link universal do WhatsApp
    // Este link tenta abrir o app nativo primeiro
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, "_blank");
    } else {
      window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
    }
  } else {
    // Em desktop, usa WhatsApp Web
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      window.open(`https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`, "_blank");
    } else {
      window.open(`https://web.whatsapp.com/send?text=${encodedMessage}`, "_blank");
    }
  }
};

/**
 * Cria uma URL do WhatsApp (útil para links)
 */
export const getWhatsAppUrl = ({ phone, message }: WhatsAppOptions): string => {
  const encodedMessage = encodeURIComponent(message);
  
  if (isMobileDevice()) {
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    }
    return `https://wa.me/?text=${encodedMessage}`;
  } else {
    if (phone) {
      const formattedPhone = formatPhoneNumber(phone);
      return `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;
    }
    return `https://web.whatsapp.com/send?text=${encodedMessage}`;
  }
};
