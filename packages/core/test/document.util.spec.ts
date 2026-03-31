import { validateCPF, validateCNPJ, cleanDocument, formatCPF, formatCNPJ } from '../src/shared/utils/document.util'
import { describe, it, expect } from '@jest/globals'

describe('Document Utils', () => {

  // ── CPF ──────────────────────────────────────────────────────────────────

  describe('validateCPF()', () => {
    it('deve aceitar CPF válido', () => {
      expect(validateCPF('12345678909')).toBe(true)
      expect(validateCPF('11144477735')).toBe(true)
    })

    it('deve rejeitar CPF com todos dígitos iguais', () => {
      expect(validateCPF('11111111111')).toBe(false)
      expect(validateCPF('00000000000')).toBe(false)
    })

    it('deve rejeitar CPF com comprimento errado', () => {
      expect(validateCPF('1234567890')).toBe(false)
      expect(validateCPF('123456789012')).toBe(false)
    })

    it('deve rejeitar CPF com dígito verificador inválido', () => {
      expect(validateCPF('12345678900')).toBe(false)
      expect(validateCPF('12312312312')).toBe(false)
    })
  })

  // ── CNPJ ─────────────────────────────────────────────────────────────────

  describe('validateCNPJ()', () => {
    it('deve aceitar CNPJ válido', () => {
      expect(validateCNPJ('11222333000181')).toBe(true)
    })

    it('deve rejeitar CNPJ com todos dígitos iguais', () => {
      expect(validateCNPJ('11111111111111')).toBe(false)
    })

    it('deve rejeitar CNPJ com comprimento errado', () => {
      expect(validateCNPJ('1234567800019')).toBe(false)
    })

    it('deve rejeitar CNPJ inválido', () => {
      expect(validateCNPJ('12345678000100')).toBe(false)
    })
  })

  // ── cleanDocument ─────────────────────────────────────────────────────────

  describe('cleanDocument()', () => {
    it('deve remover pontos, traços e barras', () => {
      expect(cleanDocument('123.456.789-09')).toBe('12345678909')
      expect(cleanDocument('12.345.678/0001-90')).toBe('12345678000190')
      expect(cleanDocument('  123.456.789-09  ')).toBe('12345678909')
    })

    it('deve aceitar documento já limpo', () => {
      expect(cleanDocument('12345678909')).toBe('12345678909')
    })
  })

  // ── formatCPF ─────────────────────────────────────────────────────────────

  describe('formatCPF()', () => {
    it('deve formatar CPF limpo', () => {
      expect(formatCPF('12345678909')).toBe('123.456.789-09')
    })

    it('deve formatar CPF já formatado', () => {
      expect(formatCPF('123.456.789-09')).toBe('123.456.789-09')
    })
  })

  // ── formatCNPJ ────────────────────────────────────────────────────────────

  describe('formatCNPJ()', () => {
    it('deve formatar CNPJ limpo', () => {
      expect(formatCNPJ('12345678000190')).toBe('12.345.678/0001-90')
    })
  })
})
