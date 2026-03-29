const axios = require('axios');
const token = require('jsonwebtoken').sign({ sub: '488934ee-de01-4553-a0e6-0884de5a9775', role: 'super_admin' }, 'dev_jwt_secret_change_in_production');

axios.post('http://localhost:3000/api/v1/subscriptions', { 
  customerId: 'b0dab01b-a95a-4a40-9d58-741a317072b4', 
  productId: '88eb7428-1b6e-4402-be53-6ab8e7b992f4', // I will use fake UUIDs, it should return 500 because of FK violation
  planId: '98436040-5a33-401c-bf6d-8b0451ff6604', 
  contractedAmount: 0, 
  trialDays: 1 
}, { 
  headers: { Authorization: `Bearer ${token}` } 
})
.then(r => console.log('SUCCESS:', r.data))
.catch(e => console.error('ERROR:', e.response?.data || e.message));
