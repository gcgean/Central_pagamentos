export interface Customer {
  id:              string
  personType:      'PF' | 'PJ'
  document:        string
  documentClean:   string
  legalName:       string
  tradeName?:      string | null
  email:           string
  phone?:          string | null
  status:          'active' | 'inactive' | 'blocked'
  addressZip?:     string | null
  addressStreet?:  string | null
  addressNumber?:  string | null
  addressComp?:    string | null
  addressDistrict?: string | null
  addressCity?:    string | null
  addressState?:   string | null
  addressCountry?: string | null
  notes?:          string | null
  metadata:        Record<string, unknown>
  createdAt:       Date
  updatedAt:       Date
}
