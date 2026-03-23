export interface Subscription {
  id:                     string
  customerId:             string
  productId:              string
  planId:                 string
  contractedAmount:       number
  contractedCurrency:     string
  externalSubscriptionId?: string | null
  gatewayName?:           string | null
  status:                 'pending' | 'trialing' | 'active' | 'overdue' | 'suspended' | 'canceled' | 'expired'
  startedAt?:             Date | null
  trialEndsAt?:           Date | null
  currentPeriodStart?:    Date | null
  currentPeriodEnd?:      Date | null
  nextBillingAt?:         Date | null
  canceledAt?:            Date | null
  cancellationReason?:    string | null
  createdAt:              Date
  updatedAt:              Date

  // joins opcionais
  customer?: { name: string; email: string }
  product?:  { name: string; code: string }
  plan?: {
    name:          string
    code:          string
    amount:        number
    intervalUnit:  string
    intervalCount: number
    maxUsers?:     number | null
    featureSet?:   Record<string, unknown>
  }
}
