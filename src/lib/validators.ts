import { z } from 'zod';

// Validador de CPF
export const validateCPF = (cpf: string): boolean => {
  const cleanCPF = cpf.replace(/[^\d]/g, '');
  
  if (cleanCPF.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleanCPF.substring(i - 1, i)) * (12 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleanCPF.substring(10, 11))) return false;

  return true;
};

// Validador de CNPJ
export const validateCNPJ = (cnpj: string): boolean => {
  const cleanCNPJ = cnpj.replace(/[^\d]/g, '');
  
  if (cleanCNPJ.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;

  let length = cleanCNPJ.length - 2;
  let numbers = cleanCNPJ.substring(0, length);
  const digits = cleanCNPJ.substring(length);
  let sum = 0;
  let pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  length = length + 1;
  numbers = cleanCNPJ.substring(0, length);
  sum = 0;
  pos = length - 7;

  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;

  return true;
};

// Validador de Telefone (formato brasileiro)
export const validatePhone = (phone: string): boolean => {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  return cleanPhone.length === 10 || cleanPhone.length === 11;
};

// Validador de Placa (formato brasileiro ABC-1234 ou Mercosul ABC1D23)
export const validatePlaca = (placa: string): boolean => {
  const cleanPlaca = placa.replace(/[^\w]/g, '').toUpperCase();
  
  // Placa antiga: ABC1234 (3 letras + 4 números)
  const formatoAntigo = /^[A-Z]{3}\d{4}$/;
  
  // Placa Mercosul: ABC1D23 (3 letras + 1 número + 1 letra + 2 números)
  const formatoMercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/;
  
  return formatoAntigo.test(cleanPlaca) || formatoMercosul.test(cleanPlaca);
};

// Formatadores
export const formatPlaca = (value: string): string => {
  const cleaned = value.replace(/[^\w]/g, '').toUpperCase();
  
  // Formato antigo: ABC-1234
  if (cleaned.length <= 7 && /^[A-Z]{0,3}\d{0,4}$/.test(cleaned)) {
    if (cleaned.length > 3) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    }
    return cleaned;
  }
  
  // Formato Mercosul: ABC1D23
  if (cleaned.length <= 7) {
    if (cleaned.length > 4) {
      return `${cleaned.slice(0, 4)}${cleaned.slice(4)}`;
    }
    return cleaned;
  }
  
  return value;
};

export const formatCPF = (value: string): string => {
  const cleanValue = value.replace(/[^\d]/g, '');
  return cleanValue
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export const formatCNPJ = (value: string): string => {
  const cleanValue = value.replace(/[^\d]/g, '');
  return cleanValue
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

export const formatPhone = (value: string): string => {
  const cleanValue = value.replace(/[^\d]/g, '');
  if (cleanValue.length <= 10) {
    return cleanValue
      .slice(0, 10)
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return cleanValue
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

export const formatCEP = (value: string): string => {
  const cleanValue = value.replace(/[^\d]/g, '');
  return cleanValue
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2');
};

export const formatChassi = (value: string): string => {
  const cleanValue = value.replace(/[^\w]/g, '').toUpperCase();
  return cleanValue.slice(0, 17);
};

export const formatCurrency = (value: number | string): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return 'R$ 0,00';
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(numValue);
};

export const parseCurrency = (value: string): number => {
  const cleanValue = value.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(cleanValue) || 0;
};

// Schemas Zod para validação
export const cpfSchema = z.string()
  .transform(val => val.replace(/[^\d]/g, ''))
  .refine(validateCPF, { message: 'CPF inválido' });

export const cnpjSchema = z.string()
  .transform(val => val.replace(/[^\d]/g, ''))
  .refine(validateCNPJ, { message: 'CNPJ inválido' });

export const phoneSchema = z.string()
  .transform(val => val.replace(/[^\d]/g, ''))
  .refine(validatePhone, { message: 'Telefone inválido' });

export const cepSchema = z.string()
  .transform(val => val.replace(/[^\d]/g, ''))
  .refine(val => val.length === 8, { message: 'CEP deve ter 8 dígitos' });

export const chassiSchema = z.string()
  .transform(val => val.replace(/[^\w]/g, '').toUpperCase())
  .refine(val => val.length === 17, { message: 'Chassi deve ter 17 caracteres' });

export const cpfOrCnpjSchema = z.string()
  .transform(val => val.replace(/[^\d]/g, ''))
  .refine(val => {
    if (val.length === 11) return validateCPF(val);
    if (val.length === 14) return validateCNPJ(val);
    return false;
  }, { message: 'CPF ou CNPJ inválido' });
