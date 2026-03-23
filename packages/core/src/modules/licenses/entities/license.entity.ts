export interface License {
  id:              string
  customerId:      string
  productId:       string
  planId?:         string | null
  originType:      'subscription' | 'order' | 'manual' | 'trial'
  originId:        string
  status:          'active' | 'inactive' | 'suspended' | 'expired' | 'revoked'
  startsAt:        Date
  expiresAt?:      Date | null
  graceUntil?:     Date | null
  maxUsers?:       number | null
  featureSet:      Record<string, unknown>
  suspendedAt?:    Date | null
  suspendedReason?: string | null
  revokedAt?:      Date | null
  revokedReason?:  string | null
  createdAt:       Date
  updatedAt:       Date

  // joins opcionais
  product?: { code: string; name: string }
  plan?:    { code: string; name: string }
}
