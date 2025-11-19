import { z } from 'zod';

// Authentication schemas
export const signInSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255, 'Email muito longo'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const signUpSchema = z.object({
  nome: z.string()
    .trim()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo')
    .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome deve conter apenas letras'),
  email: z.string()
    .trim()
    .email('Email inválido')
    .max(255, 'Email muito longo')
    .toLowerCase(),
  password: z.string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número'),
});

// User management schemas
export const createUserSchema = z.object({
  email: z.string().trim().email('Email inválido').max(255),
  nome: z.string().trim().min(2, 'Nome muito curto').max(100, 'Nome muito longo'),
  telefone: z.string().regex(/^[\d\s\-()]+$/, 'Telefone inválido').optional().or(z.literal('')),
  cargo: z.string().max(100, 'Cargo muito longo').optional().or(z.literal('')),
});

// Utility function to generate cryptographically secure passwords
export const generateSecurePassword = (): string => {
  const length = 16;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }
  
  // Ensure it meets password requirements
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  if (!hasUpper || !hasLower || !hasNumber) {
    // Regenerate if requirements not met (rare with 16 chars)
    return generateSecurePassword();
  }
  
  return password;
};
