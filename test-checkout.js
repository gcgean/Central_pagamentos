const axios = require('axios');
const token = require('jsonwebtoken').sign({ sub: '123', role: 'super_admin', type: 'admin', mustChangePassword: false }, 'troque_isso_em_producao_use_openssl_rand_base64_64');

(async () => {
  try {
    const res = await axios.post('http://localhost:3005/api/v1/orders/ca143c01-72c4-4a5f-854f-9f09c0184bbf/checkout', { 
      billingType: 'CREDIT_CARD', 
      creditCard: { token: 'mock' } 
    }, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    console.log('SUCCESS:', res.data);
  } catch (e) {
    console.error('ERROR:', e.response?.data || e.message);
  }
})();
